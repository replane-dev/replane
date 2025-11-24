import {BadRequestError} from './errors';
import type {Condition, Override} from './override-condition-schemas';
import {assertNever} from './utils';

/**
 * Recursively extracts all reference projectIds from conditions
 */
function extractReferenceProjectIds(condition: Condition): string[] {
  const projectIds: string[] = [];

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
      projectIds.push(condition.value.projectId);
    }
  } else if (operator === 'segmentation') {
    // Segmentation conditions don't have values that can reference other configs
  } else if (operator === 'and') {
    for (const subCondition of condition.conditions) {
      projectIds.push(...extractReferenceProjectIds(subCondition));
    }
  } else if (operator === 'or') {
    for (const subCondition of condition.conditions) {
      projectIds.push(...extractReferenceProjectIds(subCondition));
    }
  } else if (operator === 'not') {
    projectIds.push(...extractReferenceProjectIds(condition.condition));
  } else {
    assertNever(operator, 'Unexpected operator in extractReferenceProjectIds');
  }

  return projectIds;
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
    referencedProjectId: string;
  }> = [];

  for (const override of params.overrides) {
    for (const condition of override.conditions) {
      const projectIds = extractReferenceProjectIds(condition);
      for (const projectId of projectIds) {
        if (projectId !== params.configProjectId) {
          invalidReferences.push({
            overrideName: override.name,
            referencedProjectId: projectId,
          });
        }
      }
    }
  }

  if (invalidReferences.length > 0) {
    const details = invalidReferences
      .map(ref => `Override "${ref.overrideName}" references project ${ref.referencedProjectId}`)
      .join('; ');
    throw new BadRequestError(
      `Override references must use the same project ID as the config. ${details}`,
    );
  }
}
