import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-evaluator';
import {createAuditLogId} from '../stores/audit-log-store';
import {
  createConfigProposalId,
  createConfigProposalMemberId,
  createConfigProposalVariantId,
  type ConfigProposalId,
} from '../stores/config-proposal-store';
import type {TransactionalUseCase, UseCaseTransaction} from '../use-case';
import type {ConfigSchema, ConfigValue, NormalizedEmail} from '../zod';

export interface CreateConfigProposalRequest {
  projectId: string;
  configId: string;
  baseVersion: number;
  proposedDelete: boolean;
  // Full proposed state (required unless proposedDelete is true)
  description: string;
  editorEmails: string[];
  maintainerEmails: string[];
  defaultVariant: {value: ConfigValue; schema: ConfigSchema | null; overrides: Override[]};
  environmentVariants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useDefaultSchema: boolean;
  }>;
  message: string | null;
  currentUserEmail: NormalizedEmail;
}

export interface CreateConfigProposalResponse {
  configProposalId: ConfigProposalId;
}

export interface CreateConfigProposalUseCaseDeps {
  dateProvider: DateProvider;
  baseUrl?: string;
}

export function createCreateConfigProposalUseCase(
  deps: CreateConfigProposalUseCaseDeps,
): TransactionalUseCase<CreateConfigProposalRequest, CreateConfigProposalResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.isWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Check if config version matches the base version
    if (config.version !== req.baseVersion) {
      throw new BadRequestError('Config was edited by another user. Please, refresh the page.', {
        code: 'CONFIG_VERSION_MISMATCH',
      });
    }

    // Validate the proposed state
    await tx.configService.validate(ctx, {
      projectId: config.projectId,
      description: req.description,
      defaultVariant: req.defaultVariant,
      environmentVariants: req.environmentVariants,
    });

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configProposalId = createConfigProposalId();
    const currentMembers = await tx.configUsers.getByConfigId(config.id);

    if (req.proposedDelete) {
      await tx.configProposals.create({
        id: configProposalId,
        configId: req.configId,
        authorId: currentUser.id,
        createdAt: deps.dateProvider.now(),
        rejectedAt: null,
        approvedAt: null,
        reviewerId: null,
        rejectionReason: null,
        rejectedInFavorOfProposalId: null,
        baseConfigVersion: config.version,
        isDelete: true,
        description: config.description,
        value: config.value,
        schema: config.schema,
        overrides: config.overrides,
        message: req.message ?? null,
        variants: req.environmentVariants.map(x => ({
          id: createConfigProposalVariantId(),
          environmentId: x.environmentId,
          value: x.value,
          schema: x.schema,
          overrides: x.overrides,
          useDefaultSchema: x.useDefaultSchema,
        })),
        members: currentMembers.map(m => ({
          id: createConfigProposalMemberId(),
          email: m.user_email_normalized,
          role: m.role,
        })),
      });

      await tx.auditLogs.create({
        id: createAuditLogId(),
        createdAt: deps.dateProvider.now(),
        projectId: config.projectId,
        userId: currentUser.id,
        configId: config.id,
        payload: {
          type: 'config_proposal_created',
          proposalId: configProposalId,
          configId: config.id,
          proposedDelete: true,
          proposedDescription: undefined,
          proposedMembers: undefined,
          message: req.message,
        },
      });
    } else {
      // Normal proposal with full proposed state
      const proposedMembers = [
        ...req.editorEmails!.map(email => ({email, role: 'editor' as const})),
        ...req.maintainerEmails!.map(email => ({email, role: 'maintainer' as const})),
      ];

      await tx.configProposals.create({
        id: configProposalId,
        configId: req.configId,
        authorId: currentUser.id,
        createdAt: deps.dateProvider.now(),
        rejectedAt: null,
        approvedAt: null,
        reviewerId: null,
        rejectionReason: null,
        rejectedInFavorOfProposalId: null,
        baseConfigVersion: config.version,
        isDelete: false,
        description: req.description!,
        value: req.defaultVariant.value,
        schema: req.defaultVariant.schema,
        overrides: req.defaultVariant.overrides,
        message: req.message ?? null,
        variants: req.environmentVariants.map(v => ({
          id: createConfigProposalVariantId(),
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema ?? null,
          overrides: v.overrides,
          useDefaultSchema: v.useDefaultSchema ?? false,
        })),
        members: proposedMembers.map(m => ({
          id: createConfigProposalMemberId(),
          ...m,
        })),
      });

      await tx.auditLogs.create({
        id: createAuditLogId(),
        createdAt: deps.dateProvider.now(),
        projectId: config.projectId,
        userId: currentUser.id,
        configId: config.id,
        payload: {
          type: 'config_proposal_created',
          proposalId: configProposalId,
          configId: config.id,
          proposedDelete: false,
          proposedDescription: req.description!,
          proposedMembers: proposedMembers,
          proposedVariants: req.environmentVariants.map(v => ({
            environmentId: v.environmentId,
            proposedValue: v.value,
            proposedSchema: v.schema,
            proposedOverrides: v.overrides,
          })),
          message: req.message,
        },
      });
    }

    // Send email notifications to approvers
    await scheduleProposalCreatedNotification({
      tx,
      deps,
      config,
      currentUser,
      configProposalId,
      req,
    });

    return {
      configProposalId,
    };
  };
}

async function scheduleProposalCreatedNotification(params: {
  tx: UseCaseTransaction;
  deps: CreateConfigProposalUseCaseDeps;
  config: {id: string; name: string; description: string};
  currentUser: {name: string | null; email: string | null};
  configProposalId: ConfigProposalId;
  req: CreateConfigProposalRequest;
}): Promise<void> {
  const {tx, deps, config, currentUser, configProposalId, req} = params;

  if (!tx.emailService || !deps.baseUrl) {
    return;
  }

  const project = await tx.projects.getById({
    id: req.projectId,
    currentUserEmail: req.currentUserEmail,
  });
  if (!project) {
    return;
  }

  // Get potential approvers (maintainers for most cases, editors + maintainers for value-only changes)
  const maintainerEmails = await tx.permissionService.getConfigMaintainers(config.id);
  const editorEmails = await tx.permissionService.getConfigEditors(config.id);

  // Determine who should be notified based on what changed
  let approverEmails: string[] = [];
  if (req.proposedDelete) {
    approverEmails = maintainerEmails;
  } else {
    // For simple value changes, both editors and maintainers can approve
    // For schema/member/description changes, only maintainers can approve
    const currentMembers = await tx.configUsers.getByConfigId(config.id);
    const membersChanged =
      JSON.stringify(
        [
          ...req.editorEmails.map(e => ({email: e, role: 'editor'})),
          ...req.maintainerEmails.map(e => ({email: e, role: 'maintainer'})),
        ].sort((a, b) => a.email.localeCompare(b.email)),
      ) !==
      JSON.stringify(
        currentMembers
          .map((m: any) => ({email: m.user_email_normalized, role: m.role}))
          .sort((a: any, b: any) => a.email.localeCompare(b.email)),
      );
    const descriptionChanged = req.description !== config.description;

    if (membersChanged || descriptionChanged) {
      approverEmails = maintainerEmails;
    } else {
      approverEmails = [...maintainerEmails, ...editorEmails];
    }
  }

  // Remove the author from the approver list
  approverEmails = approverEmails.filter(email => email !== req.currentUserEmail);

  if (approverEmails.length > 0) {
    const proposalUrl = `${deps.baseUrl}/app/projects/${project.id}/configs/${config.name}/proposals/${configProposalId}`;
    const configName = config.name;
    const projectName = project.name;
    const authorName = currentUser.name ?? (currentUser.email || 'Unknown');
    const emailService = tx.emailService;

    tx.scheduleOptimisticEffect(async () => {
      await emailService.sendProposalWaitingForReview({
        to: approverEmails,
        proposalUrl,
        configName,
        projectName,
        authorName,
      });
    });
  }
}
