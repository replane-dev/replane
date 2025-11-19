import assert from 'assert';
import type {ConfigProposalRejectionReason} from '../db';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigProposalRequest {
  proposalId: string;
  currentUserEmail: NormalizedEmail;
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
  proposedValue: {newValue: unknown} | null;
  proposedDescription: string | null;
  proposedSchema: {newSchema: unknown} | null;
  proposedMembers: {newMembers: Array<{email: string; role: string}>} | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approverRole: 'owners' | 'owners_and_editors';
  approverEmails: string[];
  approverReason: string;
  baseValue: unknown | null;
  baseDescription: string | null;
  baseSchema: unknown | null;
  baseOwnerEmails: string[];
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

export function createGetConfigProposalUseCase(
  deps: GetConfigProposalUseCaseDeps,
): TransactionalUseCase<GetConfigProposalRequest, GetConfigProposalResponse> {
  return async (ctx, tx, req) => {
    const proposal = await tx.configProposals.getById(req.proposalId);
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    // Get the config to retrieve its name
    const config = await tx.configs.getById(proposal.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

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

    // Determine approval policy and eligible approvers
    const ownerEmails = await tx.permissionService.getConfigOwners(proposal.configId);
    const editorEmails = await tx.permissionService.getConfigEditors(proposal.configId);

    const ownersOnly =
      proposal.proposedDelete ||
      proposal.proposedSchema !== null ||
      proposal.proposedDescription !== null ||
      proposal.proposedMembers !== null;

    let approverReason = '';
    if (proposal.proposedDelete) {
      approverReason = 'Deletion requests require owner approval.';
    } else if (proposal.proposedSchema !== null) {
      approverReason = 'Schema changes require owner approval.';
    } else if (proposal.proposedDescription !== null) {
      approverReason = 'Description changes require owner approval.';
    } else if (proposal.proposedMembers !== null) {
      approverReason = 'Membership changes require owner approval.';
    } else {
      approverReason = 'Value-only changes can be approved by editors or owners.';
    }

    const approverRole: 'owners' | 'owners_and_editors' = ownersOnly
      ? 'owners'
      : 'owners_and_editors';
    const approverEmails = ownersOnly ? ownerEmails : editorEmails;

    // Get the base version of the config to show the diff against the original state
    const baseVersion = await tx.configVersions.getByConfigIdAndVersion(
      proposal.configId,
      proposal.baseConfigVersion,
    );
    assert(
      baseVersion,
      `Base config version ${proposal.baseConfigVersion} not found for config ${proposal.configId}`,
    );

    // getByConfigIdAndVersion already extracts value and schema from JSON wrappers
    const baseValue = baseVersion.value ?? null;
    const baseDescription = baseVersion.description ?? null;
    const baseSchema = baseVersion.schema ?? null;

    // Get base members from the version snapshot, or fall back to current members if not versioned
    const baseOwnerEmails =
      baseVersion.members.length > 0
        ? baseVersion.members.filter(m => m.role === 'owner').map(m => m.normalizedEmail)
        : ownerEmails;
    const baseEditorEmails =
      baseVersion.members.length > 0
        ? baseVersion.members.filter(m => m.role === 'editor').map(m => m.normalizedEmail)
        : editorEmails;

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
        proposedValue: proposal.proposedValue,
        proposedDescription: proposal.proposedDescription,
        proposedSchema: proposal.proposedSchema,
        proposedMembers: proposal.proposedMembers ?? null,
        message: proposal.message,
        status,
        approverRole,
        approverEmails,
        approverReason,
        baseValue,
        baseDescription,
        baseSchema,
        baseOwnerEmails,
        baseEditorEmails,
      },
      proposalsRejectedByThisApproval,
    };
  };
}
