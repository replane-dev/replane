import assert from 'assert';
import type {ConfigProposalRejectionReason} from '../db';
import {BadRequestError} from '../errors';
import type {Override} from '../override-evaluator';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigProposalRequest {
  proposalId: string;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface ProposedVariantDetails {
  configVariantId: string;
  environmentId: string;
  environmentName: string;
  baseVariantVersion: number;
  proposedValue: unknown | undefined;
  proposedSchema: unknown | undefined;
  proposedOverrides: Override[] | undefined;
  // Current values for comparison
  currentValue: unknown;
  currentSchema: unknown | null;
  currentOverrides: Override[];
}

export interface ConfigProposalDetails {
  id: string;
  configId: string;
  configName: string;
  proposerId: number | null;
  proposerEmail: string | null;
  createdAt: Date;
  rejectedAt: Date | null;
  approvedAt: Date | null;
  reviewerId: number | null;
  reviewerEmail: string | null;
  rejectedInFavorOfProposalId: string | null;
  rejectionReason: ConfigProposalRejectionReason | null;
  baseConfigVersion: number;
  proposedDelete: boolean;
  proposedDescription: string | null;
  proposedMembers: {newMembers: Array<{email: string; role: string}>} | null;
  proposedVariants: ProposedVariantDetails[];
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approverRole: 'maintainers' | 'maintainers_and_editors';
  approverEmails: string[];
  approverReason: string;
  baseDescription: string;
  baseMaintainerEmails: string[];
  baseEditorEmails: string[];
}

export interface GetConfigProposalResponse {
  proposal: ConfigProposalDetails;
  proposalsRejectedByThisApproval: Array<{
    id: string;
    proposerEmail: string | null;
  }>;
}

export interface GetConfigProposalUseCaseDeps {}

export function createGetConfigProposalUseCase({}: GetConfigProposalUseCaseDeps): TransactionalUseCase<
  GetConfigProposalRequest,
  GetConfigProposalResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanViewProject(req.projectId, req.currentUserEmail);

    const proposal = await tx.configProposals.getById({
      id: req.proposalId,
      projectId: req.projectId,
    });
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    // Get the config to retrieve its name
    const config = await tx.configs.getById(proposal.configId);
    assert(config, 'Config not found');

    // Get proposer details
    let proposerEmail: string | null = null;
    if (proposal.proposerId) {
      const proposer = await tx.users.getById(proposal.proposerId);
      proposerEmail = proposer?.email ?? null;
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

    // Fetch variant changes for approval logic
    const proposalVariantChanges = await tx.configProposals.getVariantsByProposalId(proposal.id);
    const hasSchemaChanges = proposalVariantChanges.some(vc => vc.proposedSchema !== undefined);

    // Determine approval policy and eligible approvers
    const maintainerEmails = await tx.permissionService.getConfigOwners(proposal.configId);
    const editorEmails = await tx.permissionService.getConfigEditors(proposal.configId);

    // Maintainers only: delete, description, members, schema changes, or overrides changes
    const maintainersOnly =
      proposal.proposedDelete ||
      proposal.proposedDescription !== null ||
      proposal.proposedMembers !== null ||
      hasSchemaChanges;

    let approverReason = '';
    if (proposal.proposedDelete) {
      approverReason = 'Deletion requests require maintainer approval.';
    } else if (proposal.proposedDescription !== null) {
      approverReason = 'Description changes require maintainer approval.';
    } else if (proposal.proposedMembers !== null) {
      approverReason = 'Membership changes require maintainer approval.';
    } else if (hasSchemaChanges) {
      approverReason = 'Schema changes require maintainer approval.';
    } else if (proposalVariantChanges.length > 0) {
      approverReason = 'Value changes can be approved by editors or maintainers.';
    } else {
      approverReason = 'Config changes require approval.';
    }

    const approverRole: 'maintainers' | 'maintainers_and_editors' = maintainersOnly
      ? 'maintainers'
      : 'maintainers_and_editors';
    const approverEmails = maintainersOnly ? maintainerEmails : editorEmails;

    // Use original description from proposal snapshot
    const baseDescription = proposal.originalDescription;

    // Get base members from the proposal's originalMembers
    const baseMaintainerEmails = proposal.originalMembers
      .filter(m => m.role === 'maintainer')
      .map(m => m.email);
    const baseEditorEmails = proposal.originalMembers
      .filter(m => m.role === 'editor')
      .map(m => m.email);

    // Fetch proposals that were rejected because of this approval
    let proposalsRejectedByThisApproval: Array<{id: string; proposerEmail: string | null}> = [];
    if (status === 'approved') {
      const rejectedProposals = await tx.configProposals.getRejectedByApprovalId({
        approvalId: proposal.id,
      });
      proposalsRejectedByThisApproval = rejectedProposals.map(p => ({
        id: p.id,
        proposerEmail: p.proposerEmail,
      }));
    }

    // Fetch variant changes
    const variantChanges = await tx.configProposals.getVariantsByProposalId(proposal.id);
    const proposedVariants: ProposedVariantDetails[] = [];
    for (const vc of variantChanges) {
      const variant = await tx.configVariants.getById(vc.configVariantId);
      if (variant) {
        proposedVariants.push({
          configVariantId: vc.configVariantId,
          environmentId: vc.environmentId,
          environmentName: vc.environmentName,
          baseVariantVersion: vc.baseVariantVersion,
          proposedValue: vc.proposedValue,
          proposedSchema: vc.proposedSchema,
          proposedOverrides: vc.proposedOverrides,
          currentValue: variant.value,
          currentSchema: variant.schema,
          currentOverrides: variant.overrides,
        });
      }
    }

    return {
      proposal: {
        id: proposal.id,
        configId: proposal.configId,
        configName: config.name,
        proposerId: proposal.proposerId,
        proposerEmail,
        createdAt: proposal.createdAt,
        rejectedAt: proposal.rejectedAt,
        approvedAt: proposal.approvedAt,
        reviewerId: proposal.reviewerId,
        reviewerEmail,
        rejectedInFavorOfProposalId: proposal.rejectedInFavorOfProposalId,
        rejectionReason: proposal.rejectionReason,
        baseConfigVersion: proposal.baseConfigVersion,
        proposedDelete: proposal.proposedDelete,
        proposedDescription: proposal.proposedDescription,
        proposedMembers: proposal.proposedMembers ?? null,
        proposedVariants,
        message: proposal.message,
        status,
        approverRole,
        approverEmails,
        approverReason,
        baseDescription,
        baseMaintainerEmails,
        baseEditorEmails,
      },
      proposalsRejectedByThisApproval,
    };
  };
}
