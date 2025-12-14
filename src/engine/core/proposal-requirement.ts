import type {Override} from './override-condition-schemas';

export interface ProposalRequirementParams {
  /** Whether the project requires proposals */
  projectRequiresProposals: boolean;
  /** Environments with their requireProposals settings */
  environments: Array<{
    id: string;
    requireProposals: boolean;
  }>;
  /** Current config state */
  current: {
    defaultVariant: {
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
    };
    environmentVariants: Array<{
      environmentId: string;
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
    }>;
    editorEmails: string[];
    maintainerEmails: string[];
  };
  /** Proposed config state */
  proposed: {
    defaultVariant: {
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
    };
    environmentVariants: Array<{
      environmentId: string;
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
    }>;
    editorEmails: string[];
    maintainerEmails: string[];
  };
}

export interface ProposalRequirementResult {
  required: boolean;
  reason?: string;
  affectedEnvironmentIds?: string[];
}

/**
 * Pure function to determine if a proposal is required for config changes.
 * Can be used on both server and client side.
 *
 * Proposal is required when:
 * 1. The project has requireProposals enabled AND
 * 2. Either:
 *    - Members have changed
 *    - Default value/schema/overrides have changed
 *    - An environment with requireProposals enabled has changes
 */
export function isProposalRequired(params: ProposalRequirementParams): ProposalRequirementResult {
  const {projectRequiresProposals, environments, current, proposed} = params;

  // If the project doesn't require proposals, no proposal needed
  if (!projectRequiresProposals) {
    return {required: false};
  }

  // Check if members have changed
  const currentEditors = [...current.editorEmails].sort();
  const proposedEditors = [...proposed.editorEmails].sort();
  const currentMaintainers = [...current.maintainerEmails].sort();
  const proposedMaintainers = [...proposed.maintainerEmails].sort();

  const membersChanged =
    JSON.stringify(currentEditors) !== JSON.stringify(proposedEditors) ||
    JSON.stringify(currentMaintainers) !== JSON.stringify(proposedMaintainers);

  if (membersChanged) {
    return {
      required: true,
      reason: 'Config members changed',
      affectedEnvironmentIds: environments.map(e => e.id),
    };
  }

  // Check if default value has changed
  const defaultValueChanged =
    JSON.stringify(proposed.defaultVariant.value) !==
      JSON.stringify(current.defaultVariant.value) ||
    JSON.stringify(proposed.defaultVariant.schema) !==
      JSON.stringify(current.defaultVariant.schema) ||
    JSON.stringify(proposed.defaultVariant.overrides) !==
      JSON.stringify(current.defaultVariant.overrides);

  if (defaultValueChanged) {
    return {
      required: true,
      reason: 'Default value changed',
      affectedEnvironmentIds: environments.map(e => e.id),
    };
  }

  // Check which environment variants have changed
  const affectedEnvIds: string[] = [];
  for (const proposedVariant of proposed.environmentVariants) {
    const env = environments.find(e => e.id === proposedVariant.environmentId);
    if (!env || !env.requireProposals) {
      // Environment doesn't require proposals, skip
      continue;
    }

    const existingVariant = current.environmentVariants.find(
      v => v.environmentId === proposedVariant.environmentId,
    );

    if (!existingVariant) {
      // New variant for an environment that requires proposals
      affectedEnvIds.push(proposedVariant.environmentId);
      continue;
    }

    // Check if the variant has changed
    const variantChanged =
      JSON.stringify(proposedVariant.value) !== JSON.stringify(existingVariant.value) ||
      JSON.stringify(proposedVariant.schema) !== JSON.stringify(existingVariant.schema) ||
      JSON.stringify(proposedVariant.overrides) !== JSON.stringify(existingVariant.overrides);

    if (variantChanged) {
      affectedEnvIds.push(proposedVariant.environmentId);
    }
  }

  // Check for deleted variants in environments that require proposals
  for (const existingVariant of current.environmentVariants) {
    const env = environments.find(e => e.id === existingVariant.environmentId);
    if (!env || !env.requireProposals) {
      continue;
    }

    const stillExists = proposed.environmentVariants.some(
      v => v.environmentId === existingVariant.environmentId,
    );

    if (!stillExists) {
      affectedEnvIds.push(existingVariant.environmentId);
    }
  }

  if (affectedEnvIds.length > 0) {
    return {
      required: true,
      reason: 'Changes affect environments that require proposals',
      affectedEnvironmentIds: [...new Set(affectedEnvIds)],
    };
  }

  return {required: false};
}
