import {match} from 'ts-pattern';
import {getValueByPath} from './json-path';
import type {
  Condition,
  Override,
  RenderedCondition,
  RenderedOverride,
  Value,
} from './override-condition-schemas';
import {assertNever} from './utils';

export type {Override, RenderedCondition, RenderedOverride};

/**
 * FNV-1a 32-bit hash function
 */
function fnv1a32(input: string): number {
  // Convert string to bytes (UTF-8)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);

  // FNV-1a core
  let hash = 0x811c9dc5 >>> 0; // 2166136261, force uint32

  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]; // XOR with byte
    hash = Math.imul(hash, 0x01000193) >>> 0; // * 16777619 mod 2^32
  }

  return hash >>> 0; // ensure unsigned 32-bit
}

/**
 * Convert FNV-1a hash to [0, 1) for bucketing.
 */
function fnv1a32ToUnit(input: string): number {
  const h = fnv1a32(input);
  return h / 2 ** 32; // double in [0, 1)
}

export type ConfigValueResolver = (params: {
  projectId: string;
  configName: string;
  environmentId: string;
}) => Promise<unknown | undefined> | unknown | undefined;

async function renderValue(params: {
  value: Value;
  environmentId: string;
  configResolver: ConfigValueResolver;
}): Promise<unknown | undefined> {
  if (params.value.type === 'literal') {
    return params.value.value;
  } else if (params.value.type === 'reference') {
    const config = await params.configResolver({
      projectId: params.value.projectId,
      configName: params.value.configName,
      environmentId: params.environmentId,
    });
    return getValueByPath(config, params.value.path);
  } else {
    console.warn(`Unknown value type: ${JSON.stringify(params.value)}`);
    return undefined;
  }
}

async function renderConditionInternal(params: {
  condition: Condition;
  configResolver: ConfigValueResolver;
  environmentId: string;
}): Promise<RenderedCondition> {
  const {condition, configResolver, environmentId} = params;
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
      value: await renderValue({
        value: condition.value,
        environmentId: environmentId,
        configResolver: configResolver,
      }),
    };
  } else if (condition.operator === 'and' || condition.operator === 'or') {
    return {
      operator: condition.operator,
      conditions: await Promise.all(
        condition.conditions.map(c =>
          renderConditionInternal({condition: c, configResolver, environmentId}),
        ),
      ),
    };
  } else if (condition.operator === 'not') {
    return {
      __sentinel: undefined,
      operator: 'not',
      condition: await renderConditionInternal({
        condition: condition.condition,
        configResolver,
        environmentId,
      }),
    };
  } else if (condition.operator === 'segmentation') {
    return {
      operator: 'segmentation',
      property: condition.property,
      fromPercentage: condition.fromPercentage,
      toPercentage: condition.toPercentage,
      seed: condition.seed,
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
export async function renderOverrides(params: {
  overrides: Override[];
  configResolver: ConfigValueResolver;
  environmentId: string;
}): Promise<RenderedOverride[]> {
  return Promise.all(
    params.overrides.map(async override => ({
      name: override.name,
      value: override.value,
      conditions: await Promise.all(
        override.conditions.map(c =>
          renderConditionInternal({
            condition: c,
            configResolver: params.configResolver,
            environmentId: params.environmentId,
          }),
        ),
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
  // NOT condition
  if (condition.operator === 'not') {
    const nestedEval = evaluateConditionWithDebug(condition.condition, context);
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

  if (condition.operator === 'and') {
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
  } else if (condition.operator === 'or') {
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
  if (condition.operator === 'segmentation') {
    const segProperty = condition.property;
    const segContextValue = context[segProperty];

    if (segContextValue === undefined || segContextValue === null) {
      return {
        condition,
        result: 'unknown',
        reason: `${segProperty} is missing from context`,
        contextValue: segContextValue,
      };
    }

    // FNV-1a hash to bucket [0, 100)
    const hashInput = String(segContextValue) + condition.seed;
    const unitValue = fnv1a32ToUnit(hashInput);
    const matched =
      unitValue >= condition.fromPercentage / 100 && unitValue < condition.toPercentage / 100;

    return {
      condition,
      result: matched ? 'matched' : 'not_matched',
      reason: matched
        ? `${segProperty} (${segContextValue}) in range [${condition.fromPercentage}, ${condition.toPercentage}) (unit value: ${unitValue})`
        : `${segProperty} (${segContextValue}) not in range [${condition.fromPercentage}, ${condition.toPercentage}) (unit value: ${unitValue})`,
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

  switch (condition.operator) {
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
      const _: never = condition;
      return {
        condition,
        result: 'unknown',
        reason: `Unknown condition: ${JSON.stringify(condition)}`,
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
