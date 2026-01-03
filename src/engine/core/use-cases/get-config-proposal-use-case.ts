import assert from 'assert';
import type {ConfigProposalRejectionReason} from '../db';
import {BadRequestError} from '../errors';
import type {Identity} from '../identity';
import type {Override} from '../override-evaluator';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue} from '../zod';

export interface GetConfigProposalRequest {
  proposalId: string;
  identity: Identity;
  projectId: string;
}

export interface ConfigSnapshot {
  description: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  members: Array<{email: string; role: 'maintainer' | 'editor'}>;
  variants: Array<{
    environmentId: string;
    environmentName: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
  }>;
  authorEmail: string | null;
}

export interface ConfigProposalDetails {
  id: string;
  configId: string;
  configName: string;
  authorId: number | null;
  authorEmail: string | null;
  createdAt: Date;
  rejectedAt: Date | null;
  approvedAt: Date | null;
  reviewerId: number | null;
  reviewerEmail: string | null;
  rejectedInFavorOfProposalId: string | null;
  rejectionReason: ConfigProposalRejectionReason | null;
  baseConfigVersion: number;
  proposedDelete: boolean;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approverRole: 'maintainers' | 'maintainers_and_editors';
  approverEmails: string[];
  approverReason: string;
  base: ConfigSnapshot;
  proposed: ConfigSnapshot;
}

export interface GetConfigProposalResponse {
  proposal: ConfigProposalDetails;
  proposalsRejectedByThisApproval: Array<{
    id: string;
    authorEmail: string | null;
  }>;
}

export interface GetConfigProposalUseCaseDeps {}

export function createGetConfigProposalUseCase({}: GetConfigProposalUseCaseDeps): TransactionalUseCase<
  GetConfigProposalRequest,
  GetConfigProposalResponse
> {
  return async (ctx, tx, req): Promise<GetConfigProposalResponse> => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const proposal = await tx.configProposals.getById({
      id: req.proposalId,
      projectId: req.projectId,
    });
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    // Get the config to retrieve its name
    const config = await tx.configs.getById({
      id: proposal.configId,
      projectId: req.projectId,
    });
    assert(config, 'Config not found');

    // Get the base config version to retrieve original values
    const baseVersion = await tx.configVersions.getByConfigIdAndVersion({
      configId: proposal.configId,
      version: proposal.baseConfigVersion,
      projectId: req.projectId,
    });

    assert(baseVersion, 'Base version not found');

    // Get author details
    let authorEmail: string | null = null;
    if (proposal.authorId) {
      const author = await tx.users.getById(proposal.authorId);
      authorEmail = author?.email ?? null;
    }

    // Get reviewer details
    let reviewerEmail: string | null = null;
    if (proposal.reviewerId) {
      const reviewer = await tx.users.getById(proposal.reviewerId);
      reviewerEmail = reviewer?.email ?? null;
    }

    const status: 'pending' | 'approved' | 'rejected' = proposal.approvedAt
      ? 'approved'
      : proposal.rejectedAt
        ? 'rejected'
        : 'pending';

    // Check for schema changes in environment variants or default variant
    const hasEnvSchemaChanges = proposal.variants.some(vc => {
      const variant = baseVersion.variants.find(v => v.environmentId === vc.environmentId);
      assert(variant, 'Variant not found');
      return JSON.stringify(vc.schema) !== JSON.stringify(variant.schema);
    });
    const hasDefaultSchemaChange =
      JSON.stringify(proposal.schema) !== JSON.stringify(baseVersion.schema);
    const hasSchemaChanges = hasEnvSchemaChanges || hasDefaultSchemaChange;

    // Determine approval policy and eligible approvers
    const maintainerEmails = await tx.permissionService.getConfigMaintainers(proposal.configId);
    const editorEmails = await tx.permissionService.getConfigEditors(proposal.configId);

    // Determine what actually changed by comparing proposed vs original
    const descriptionChanged = proposal.description !== baseVersion.description;

    // Get original members from base version or current members
    const membersChanged =
      JSON.stringify(
        proposal.members
          .map(m => ({email: m.email, role: m.role}))
          .sort((a, b) => a.email.localeCompare(b.email)),
      ) !==
      JSON.stringify(
        baseVersion.members
          .map(m => ({email: m.email, role: m.role}))
          .sort((a, b) => a.email.localeCompare(b.email)),
      );

    // Maintainers only: delete, description, members, schema changes, or overrides changes
    const maintainersOnly =
      proposal.isDelete || descriptionChanged || membersChanged || hasSchemaChanges;

    let approverReason = '';
    if (proposal.isDelete) {
      approverReason = 'Deletion requests require maintainer approval.';
    } else if (membersChanged) {
      approverReason = 'Membership changes require maintainer approval.';
    } else if (hasSchemaChanges) {
      approverReason = 'Schema changes require maintainer approval.';
    } else if (descriptionChanged) {
      approverReason = 'Description changes require maintainer approval.';
    } else if (proposal.variants.length > 0) {
      approverReason = 'Value changes can be approved by editors or maintainers.';
    } else {
      approverReason = 'Config changes require review.';
    }

    const approverRole: 'maintainers' | 'maintainers_and_editors' = maintainersOnly
      ? 'maintainers'
      : 'maintainers_and_editors';
    const approverEmails = maintainersOnly ? maintainerEmails : editorEmails;

    // Fetch proposals that were rejected because of this approval
    let proposalsRejectedByThisApproval: Array<{id: string; authorEmail: string | null}> = [];
    if (status === 'approved') {
      const rejectedProposals = await tx.configProposals.getRejectedByApprovalId({
        approvalId: proposal.id,
        projectId: req.projectId,
      });
      proposalsRejectedByThisApproval = rejectedProposals.map(p => ({
        id: p.id,
        authorEmail: p.authorEmail,
      }));
    }

    const environments = await tx.projectEnvironments.getByProjectId(req.projectId);

    const getEnvironmentName = (environmentId: string) => {
      const environment = environments.find(e => e.id === environmentId);
      assert(environment, 'Environment not found');
      return environment.name;
    };

    return {
      proposal: {
        id: proposal.id,
        configId: proposal.configId,
        configName: config.name,
        authorId: proposal.authorId,
        authorEmail,
        createdAt: proposal.createdAt,
        rejectedAt: proposal.rejectedAt,
        approvedAt: proposal.approvedAt,
        reviewerId: proposal.reviewerId,
        reviewerEmail,
        rejectedInFavorOfProposalId: proposal.rejectedInFavorOfProposalId,
        rejectionReason: proposal.rejectionReason,
        baseConfigVersion: proposal.baseConfigVersion,
        proposedDelete: proposal.isDelete,
        message: proposal.message,
        status,
        approverRole,
        approverEmails,
        approverReason,
        base: {
          description: baseVersion.description,
          value: baseVersion.value,
          schema: baseVersion.schema,
          overrides: baseVersion.overrides,
          members: baseVersion.members.map(m => ({email: m.email, role: m.role})),
          variants: baseVersion.variants.map(v => ({
            environmentId: v.environmentId,
            environmentName: getEnvironmentName(v.environmentId),
            value: v.value,
            schema: v.schema,
            overrides: v.overrides,
          })),
          authorEmail: baseVersion.authorId
            ? ((await tx.users.getById(baseVersion.authorId))?.email ?? null)
            : null,
        },
        proposed: {
          description: proposal.description,
          value: proposal.value,
          schema: proposal.schema,
          overrides: proposal.overrides,
          members: proposal.members.map(m => ({email: m.email, role: m.role})),
          variants: proposal.variants.map(v => ({
            environmentId: v.environmentId,
            environmentName: getEnvironmentName(v.environmentId),
            value: v.value,
            schema: v.schema,
            overrides: v.overrides,
          })),
          authorEmail: proposal.authorId
            ? ((await tx.users.getById(proposal.authorId))?.email ?? null)
            : null,
        },
      },
      proposalsRejectedByThisApproval,
    };
  };
}
