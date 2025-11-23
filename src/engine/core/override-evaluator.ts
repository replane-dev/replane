import type {
  AndCondition,
  Condition,
  EqualsCondition,
  GreaterThanCondition,
  GreaterThanOrEqualCondition,
  InCondition,
  LessThanCondition,
  LessThanOrEqualCondition,
  NotCondition,
  NotInCondition,
  OrCondition,
  SegmentationCondition,
} from './override-condition-schemas';

export type {
  AndCondition,
  Condition,
  EqualsCondition,
  GreaterThanCondition,
  GreaterThanOrEqualCondition,
  InCondition,
  LessThanCondition,
  LessThanOrEqualCondition,
  NotCondition,
  NotInCondition,
  OrCondition,
};

export type EvaluationContext = Record<string, unknown>;

export interface Override {
  name: string;
  conditions: Condition[]; // All conditions must match (implicit AND)
  value: unknown;
}

// Debug result types
export interface ConditionEvaluation {
  condition: Condition;
  matched: boolean;
  reason: string;
  contextValue?: unknown;
  expectedValue?: unknown;
  nestedEvaluations?: ConditionEvaluation[];
}

export interface OverrideEvaluation {
  override: Override;
  matched: boolean;
  conditionEvaluations: ConditionEvaluation[];
}

export interface EvaluationResult {
  finalValue: unknown;
  matchedOverride: Override | null;
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
  config: {value: unknown; overrides: Override[] | null},
  context: EvaluationContext,
): EvaluationResult {
  const overrideEvaluations: OverrideEvaluation[] = [];
  let matchedOverride: Override | null = null;
  let finalValue = config.value;

  if (!config.overrides || config.overrides.length === 0) {
    return {finalValue, matchedOverride, overrideEvaluations};
  }

  for (const override of config.overrides) {
    const conditionEvaluations: ConditionEvaluation[] = [];
    let allMatched = true;

    for (const condition of override.conditions) {
      const evaluation = evaluateConditionWithDebug(condition, context);
      conditionEvaluations.push(evaluation);
      if (!evaluation.matched) {
        allMatched = false;
      }
    }

    overrideEvaluations.push({
      override,
      matched: allMatched,
      conditionEvaluations,
    });

    if (allMatched && !matchedOverride) {
      matchedOverride = override;
      finalValue = override.value;
    }
  }

  return {finalValue, matchedOverride, overrideEvaluations};
}

function evaluateConditionWithDebug(
  condition: Condition,
  context: EvaluationContext,
): ConditionEvaluation {
  const operator = condition.operator;

  // NOT condition
  if (operator === 'not') {
    const notCondition = condition as NotCondition;
    const nestedEval = evaluateConditionWithDebug(notCondition.condition, context);
    const matched = !nestedEval.matched;

    return {
      condition,
      matched,
      reason: matched
        ? `NOT: Condition did not match (inverted)`
        : `NOT: Condition matched (inverted to false)`,
      nestedEvaluations: [nestedEval],
    };
  }

  // AND/OR conditions
  if (operator === 'and' || operator === 'or') {
    const nestedEvaluations = (condition as any).conditions.map((c: Condition) =>
      evaluateConditionWithDebug(c, context),
    );
    const matched =
      operator === 'and'
        ? nestedEvaluations.every((e: ConditionEvaluation) => e.matched)
        : nestedEvaluations.some((e: ConditionEvaluation) => e.matched);

    return {
      condition,
      matched,
      reason: matched
        ? `${operator.toUpperCase()}: ${nestedEvaluations.filter((e: ConditionEvaluation) => e.matched).length}/${nestedEvaluations.length} conditions matched`
        : `${operator.toUpperCase()}: Required ${operator === 'and' ? 'all' : 'at least one'} to match`,
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
        matched: false,
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
      matched,
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
      matched: false,
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
      reason = `Unknown operator: ${operator}`;
  }

  return {
    condition,
    matched,
    reason,
    contextValue,
    expectedValue:
      castedValue !== expectedValue
        ? {original: expectedValue, casted: castedValue}
        : expectedValue,
  };
}
