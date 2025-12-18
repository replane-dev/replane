import {BadRequestError} from './errors';
import type {Condition, Override} from './override-condition-schemas';
import {assertNever} from './utils';

export interface ConfigReference {
  projectId: string;
  configName: string;
  path: (string | number)[];
}

/**
 * Extracts all config references from overrides
 */
export function extractOverrideReferences(override: Override): ConfigReference[] {
  return override.conditions.flatMap(condition => extractConditionReferences(condition));
}

/**
 * Recursively extracts all config references from conditions
 */
export function extractConditionReferences(condition: Condition): ConfigReference[] {
  const references: ConfigReference[] = [];

  const operator = condition.operator;

  if (
    operator === 'equals' ||
    operator === 'in' ||
    operator === 'not_in' ||
    operator === 'less_than' ||
    operator === 'less_than_or_equal' ||
    operator === 'greater_than' ||
    operator === 'greater_than_or_equal'
  ) {
    if (condition.value.type === 'reference') {
      references.push({
        projectId: condition.value.projectId,
        configName: condition.value.configName,
        path: condition.value.path,
      });
    }
  } else if (operator === 'segmentation') {
    // Segmentation conditions don't have values that can reference other configs
  } else if (operator === 'and') {
    for (const subCondition of condition.conditions) {
      references.push(...extractConditionReferences(subCondition));
    }
  } else if (operator === 'or') {
    for (const subCondition of condition.conditions) {
      references.push(...extractConditionReferences(subCondition));
    }
  } else if (operator === 'not') {
    references.push(...extractConditionReferences(condition.condition));
  } else {
    assertNever(operator, 'Unexpected operator in extractReferences');
  }

  return references;
}

/**
 * Validates that all override references use the same project ID as the config
 */
export function validateOverrideReferences(params: {
  overrides: Override[] | null | undefined;
  configProjectId: string;
}): void {
  if (!params.overrides || params.overrides.length === 0) {
    return;
  }

  const invalidReferences: Array<{
    overrideName: string;
    reference: ConfigReference;
  }> = [];

  for (const override of params.overrides) {
    for (const condition of override.conditions) {
      const references = extractConditionReferences(condition);
      for (const reference of references) {
        if (reference.projectId !== params.configProjectId) {
          invalidReferences.push({
            overrideName: override.name,
            reference,
          });
        }
      }
    }
  }

  if (invalidReferences.length > 0) {
    const details = invalidReferences
      .map(ref => `Override "${ref.overrideName}" references project ${ref.reference.projectId}`)
      .join('; ');
    throw new BadRequestError(
      `Override references must use the same project ID as the config. ${details}`,
    );
  }
}
