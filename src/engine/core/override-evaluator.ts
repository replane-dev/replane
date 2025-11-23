import {match} from 'ts-pattern';
import {getValueByPath} from './json-path';
import type {
  Condition,
  NotCondition,
  Override,
  RenderedCondition,
  RenderedOverride,
  SegmentationCondition,
  Value,
} from './override-condition-schemas';
import {assertNever} from './utils';

export type {Override, RenderedCondition, RenderedOverride};

export type ConfigValueResolver = (params: {
  projectId: string;
  configName: string;
}) => Promise<unknown | undefined> | unknown | undefined;

async function renderValue(
  value: Value,
  configResolver: ConfigValueResolver,
): Promise<unknown | undefined> {
  if (value.type === 'literal') {
    return value.value;
  } else if (value.type === 'reference') {
    const config = await configResolver({projectId: value.projectId, configName: value.configName});
    return getValueByPath(config, value.path);
  } else {
    console.warn(`Unknown value type: ${JSON.stringify(value)}`);
    return undefined;
  }
}

async function renderConditionInternal(
  condition: Condition,
  configResolver: ConfigValueResolver,
): Promise<RenderedCondition> {
  if (
    condition.operator === 'equals' ||
    condition.operator === 'in' ||
    condition.operator === 'not_in' ||
    condition.operator === 'less_than' ||
    condition.operator === 'less_than_or_equal' ||
    condition.operator === 'greater_than' ||
    condition.operator === 'greater_than_or_equal'
  ) {
    return {
      operator: condition.operator,
      property: condition.property,
      value: await renderValue(condition.value, configResolver),
    };
  } else if (condition.operator === 'and' || condition.operator === 'or') {
    return {
      operator: condition.operator,
      conditions: await Promise.all(
        condition.conditions.map(c => renderConditionInternal(c, configResolver)),
      ),
    };
  } else if (condition.operator === 'not') {
    return {
      operator: 'not',
      condition: await renderConditionInternal(condition.condition, configResolver),
    };
  } else if (condition.operator === 'segmentation') {
    return {
      operator: 'segmentation',
      property: condition.property,
      percentage: condition.percentage,
      salt: condition.salt,
    };
  } else {
    assertNever(condition, `Unknown condition type: ${JSON.stringify(condition)}`);
  }
}

export type EvaluationContext = Record<string, unknown>;

export type ConditionEvaluationResult = 'matched' | 'not_matched' | 'unknown';

/**
 * Render overrides by resolving all config references to literal values.
 * This must be called before evaluateConfigValue.
 */
export async function renderOverrides(
  overrides: Override[],
  configResolver: ConfigValueResolver,
): Promise<RenderedOverride[]> {
  return Promise.all(
    overrides.map(async override => ({
      name: override.name,
      value: override.value,
      conditions: await Promise.all(
        override.conditions.map(c => renderConditionInternal(c, configResolver)),
      ),
    })),
  );
}

// Debug result types
export interface ConditionEvaluation {
  condition: RenderedCondition;
  result: ConditionEvaluationResult;
  reason: string;
  contextValue?: unknown;
  expectedValue?: unknown;
  nestedEvaluations?: ConditionEvaluation[];
}

export interface OverrideEvaluation {
  override: RenderedOverride;
  result: ConditionEvaluationResult;
  conditionEvaluations: ConditionEvaluation[];
}

export interface EvaluationResult {
  finalValue: unknown;
  matchedOverride: RenderedOverride | null;
  overrideEvaluations: OverrideEvaluation[];
}

/**
 * Casts a condition value to match the type of the context value
 */
function castToContextType(conditionValue: unknown, contextValue: unknown): unknown {
  if (typeof contextValue === 'number') {
    if (typeof conditionValue === 'string') {
      const num = Number(conditionValue);
      return isNaN(num) ? conditionValue : num;
    }
    return conditionValue;
  }

  if (typeof contextValue === 'boolean') {
    if (typeof conditionValue === 'string') {
      if (conditionValue === 'true') return true;
      if (conditionValue === 'false') return false;
    }
    if (typeof conditionValue === 'number') {
      return conditionValue !== 0;
    }
    return conditionValue;
  }

  if (typeof contextValue === 'string') {
    if (typeof conditionValue === 'number' || typeof conditionValue === 'boolean') {
      return String(conditionValue);
    }
    return conditionValue;
  }

  return conditionValue;
}

/**
 * Casts array elements to match context value type (for in/not_in operators)
 */
function castArrayToContextType(conditionValue: unknown, contextValue: unknown): unknown {
  if (!Array.isArray(conditionValue)) {
    return conditionValue;
  }
  return conditionValue.map(item => castToContextType(item, contextValue));
}

/**
 * Evaluates config overrides with detailed debugging information.
 * This is the main evaluation function that returns both the result and detailed breakdown.
 */
export function evaluateConfigValue(
  config: {value: unknown; overrides: RenderedOverride[] | null},
  context: EvaluationContext,
): EvaluationResult {
  const overrideEvaluations: OverrideEvaluation[] = [];
  let matchedOverride: RenderedOverride | null = null;
  let finalValue = config.value;

  for (const override of config.overrides ?? []) {
    const conditionEvaluations: ConditionEvaluation[] = [];
    let result: ConditionEvaluationResult = 'matched';

    for (const condition of override.conditions) {
      const evaluation = evaluateConditionWithDebug(condition, context);
      conditionEvaluations.push(evaluation);
      if (evaluation.result === 'not_matched') {
        result = 'not_matched';
        break;
      } else if (evaluation.result === 'unknown') {
        result = 'unknown';
        break;
      }
    }

    overrideEvaluations.push({
      override,
      result,
      conditionEvaluations,
    });

    if (result === 'matched' && !matchedOverride) {
      matchedOverride = override;
      finalValue = override.value;
    }
  }

  return {finalValue, matchedOverride, overrideEvaluations};
}

function evaluateConditionWithDebug(
  condition: RenderedCondition,
  context: EvaluationContext,
): ConditionEvaluation {
  const operator = condition.operator;

  // NOT condition
  if (operator === 'not') {
    const notCondition = condition as NotCondition;
    const nestedEval = evaluateConditionWithDebug(notCondition.condition, context);
    const result = match(nestedEval.result)
      .with('matched', (): ConditionEvaluationResult => 'not_matched')
      .with('not_matched', (): ConditionEvaluationResult => 'matched')
      .with('unknown', (): ConditionEvaluationResult => 'unknown')
      .exhaustive();

    return {
      condition,
      result,
      reason: match(result)
        .with('matched', () => `NOT: Condition matched (inverted to false)`)
        .with('not_matched', () => `NOT: Condition did not match (inverted)`)
        .with('unknown', () => `NOT: Condition evaluation result is unknown`)
        .exhaustive(),
      nestedEvaluations: [nestedEval],
    };
  }

  if (operator === 'and') {
    const nestedEvaluations = condition.conditions.map(c => evaluateConditionWithDebug(c, context));
    let result: ConditionEvaluationResult = 'matched';
    if (nestedEvaluations.some(x => x.result === 'not_matched')) {
      result = 'not_matched';
    } else if (nestedEvaluations.some(x => x.result === 'unknown')) {
      result = 'unknown';
    }
    return {
      condition,
      result,
      reason: `AND: ${nestedEvaluations.filter(x => x.result === 'matched').length}/${nestedEvaluations.length} conditions matched`,
      nestedEvaluations,
    };
  } else if (operator === 'or') {
    const nestedEvaluations = condition.conditions.map(c => evaluateConditionWithDebug(c, context));
    let result: ConditionEvaluationResult = 'not_matched';
    if (nestedEvaluations.some(x => x.result === 'matched')) {
      result = 'matched';
    } else if (nestedEvaluations.some(x => x.result === 'unknown')) {
      result = 'unknown';
    }
    return {
      condition,
      result,
      reason: `OR: ${nestedEvaluations.filter(x => x.result === 'matched').length}/${nestedEvaluations.length} conditions matched`,
      nestedEvaluations,
    };
  }

  // Handle segmentation separately (doesn't have value field)
  if (operator === 'segmentation') {
    const typedCondition = condition as SegmentationCondition;
    const segProperty = typedCondition.property;
    const segContextValue = context[segProperty];

    if (segContextValue === undefined || segContextValue === null) {
      return {
        condition,
        result: 'unknown',
        reason: `${segProperty} is missing from context`,
        contextValue: segContextValue,
      };
    }

    // Simple hash function: sum of char codes
    const hashInput = String(segContextValue) + typedCondition.salt;
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(hash) % 100;
    const matched = bucket < typedCondition.percentage;

    return {
      condition,
      result: matched ? 'matched' : 'not_matched',
      reason: matched
        ? `${segProperty} (${segContextValue}) falls in ${typedCondition.percentage}% segment (bucket: ${bucket})`
        : `${segProperty} (${segContextValue}) not in ${typedCondition.percentage}% segment (bucket: ${bucket})`,
      contextValue: segContextValue,
    };
  }

  // Property-based conditions
  const property = condition.property;
  const expectedValue = condition.value;
  const contextValue = context[property];

  if (contextValue === undefined) {
    return {
      condition,
      result: 'unknown',
      reason: `Property "${property}" not found in context`,
      contextValue: undefined,
      expectedValue,
    };
  }

  // Cast expected value to match context type
  const castedValue = castToContextType(expectedValue, contextValue);
  let matched = false;
  let reason = '';

  switch (operator) {
    case 'equals':
      matched = contextValue === castedValue;
      reason = matched
        ? `${property} equals ${JSON.stringify(castedValue)}${castedValue !== expectedValue ? ` (casted from ${JSON.stringify(expectedValue)})` : ''}`
        : `${property} is ${JSON.stringify(contextValue)}, expected ${JSON.stringify(castedValue)}`;
      break;

    case 'in': {
      const castedArray = castArrayToContextType(expectedValue, contextValue);
      matched = Array.isArray(castedArray) && castedArray.includes(contextValue);
      reason = matched
        ? `${property} (${JSON.stringify(contextValue)}) is in list`
        : Array.isArray(castedArray)
          ? `${property} (${JSON.stringify(contextValue)}) not in ${JSON.stringify(castedArray)}`
          : `Expected value must be an array`;
      break;
    }

    case 'not_in': {
      const castedArray = castArrayToContextType(expectedValue, contextValue);
      matched = Array.isArray(castedArray) && !castedArray.includes(contextValue);
      reason = matched
        ? `${property} (${JSON.stringify(contextValue)}) is not in list`
        : Array.isArray(castedArray)
          ? `${property} (${JSON.stringify(contextValue)}) found in ${JSON.stringify(castedArray)}`
          : `Expected value must be an array`;
      break;
    }

    case 'less_than':
      // Support both numbers and strings
      if (typeof contextValue === 'number' && typeof castedValue === 'number') {
        matched = contextValue < castedValue;
        reason = matched
          ? `${property} (${contextValue}) < ${castedValue}${castedValue !== expectedValue ? ` (casted from ${JSON.stringify(expectedValue)})` : ''}`
          : `${property} (${contextValue}) >= ${castedValue}`;
      } else if (typeof contextValue === 'string' && typeof castedValue === 'string') {
        matched = contextValue < castedValue;
        reason = matched
          ? `${property} "${contextValue}" < "${castedValue}" (lexicographic)`
          : `${property} "${contextValue}" >= "${castedValue}" (lexicographic)`;
      } else {
        reason = `Both values must be same type numbers or strings (got ${typeof contextValue} and ${typeof castedValue})`;
      }
      break;

    case 'less_than_or_equal':
      if (typeof contextValue === 'number' && typeof castedValue === 'number') {
        matched = contextValue <= castedValue;
        reason = matched
          ? `${property} (${contextValue}) <= ${castedValue}${castedValue !== expectedValue ? ` (casted from ${JSON.stringify(expectedValue)})` : ''}`
          : `${property} (${contextValue}) > ${castedValue}`;
      } else if (typeof contextValue === 'string' && typeof castedValue === 'string') {
        matched = contextValue <= castedValue;
        reason = matched
          ? `${property} "${contextValue}" <= "${castedValue}" (lexicographic)`
          : `${property} "${contextValue}" > "${castedValue}" (lexicographic)`;
      } else {
        reason = `Both values must be same type numbers or strings (got ${typeof contextValue} and ${typeof castedValue})`;
      }
      break;

    case 'greater_than':
      if (typeof contextValue === 'number' && typeof castedValue === 'number') {
        matched = contextValue > castedValue;
        reason = matched
          ? `${property} (${contextValue}) > ${castedValue}${castedValue !== expectedValue ? ` (casted from ${JSON.stringify(expectedValue)})` : ''}`
          : `${property} (${contextValue}) <= ${castedValue}`;
      } else if (typeof contextValue === 'string' && typeof castedValue === 'string') {
        matched = contextValue > castedValue;
        reason = matched
          ? `${property} "${contextValue}" > "${castedValue}" (lexicographic)`
          : `${property} "${contextValue}" <= "${castedValue}" (lexicographic)`;
      } else {
        reason = `Both values must be same type numbers or strings (got ${typeof contextValue} and ${typeof castedValue})`;
      }
      break;

    case 'greater_than_or_equal':
      if (typeof contextValue === 'number' && typeof castedValue === 'number') {
        matched = contextValue >= castedValue;
        reason = matched
          ? `${property} (${contextValue}) >= ${castedValue}${castedValue !== expectedValue ? ` (casted from ${JSON.stringify(expectedValue)})` : ''}`
          : `${property} (${contextValue}) < ${castedValue}`;
      } else if (typeof contextValue === 'string' && typeof castedValue === 'string') {
        matched = contextValue >= castedValue;
        reason = matched
          ? `${property} "${contextValue}" >= "${castedValue}" (lexicographic)`
          : `${property} "${contextValue}" < "${castedValue}" (lexicographic)`;
      } else {
        reason = `Both values must be same type numbers or strings (got ${typeof contextValue} and ${typeof castedValue})`;
      }
      break;

    default:
      const _: never = operator;
      return {
        condition,
        result: 'unknown',
        reason: `Unknown operator: ${JSON.stringify(operator)}`,
        contextValue,
        expectedValue: castedValue,
      };
  }

  return {
    condition,
    result: matched ? 'matched' : 'not_matched',
    reason,
    contextValue,
    expectedValue:
      castedValue !== expectedValue
        ? {original: expectedValue, casted: castedValue}
        : expectedValue,
  };
}
