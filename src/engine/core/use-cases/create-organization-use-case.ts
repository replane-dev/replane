import assert from 'assert';
import {AuditLogStore, createAuditLogId} from '../audit-log-store';
import type {OrganizationMemberStore} from '../organization-member-store';
import {createOrganizationId, Organization, OrganizationStore} from '../organization-store';
import type {ProjectEnvironmentStore} from '../project-environment-store';
import {createProjectId, Project, ProjectStore} from '../project-store';
import type {ProjectUserStore} from '../project-user-store';
import type {TransactionalUseCase} from '../use-case';
import type {UserStore} from '../user-store';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateOrganizationRequest {
  currentUserEmail: NormalizedEmail;
  name: string;
}

export interface CreateOrganizationResponse {
  organizationId: string;
  projectId: string;
}

export function createCreateOrganizationUseCase(): TransactionalUseCase<
  CreateOrganizationRequest,
  CreateOrganizationResponse
> {
  return async (ctx, tx, req) => {
    const now = new Date();

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    const {organization, project} = await createOrganization({
      currentUserEmail: req.currentUserEmail,
      name: req.name,
      organizationStore: tx.organizations,
      organizationMemberStore: tx.organizationMembers,
      projectStore: tx.projects,
      projectUserStore: tx.projectUsers,
      projectEnvironmentStore: tx.projectEnvironments,
      users: tx.users,
      auditLogs: tx.auditLogs,
      now,
    });
    return {organizationId: organization.id, projectId: project.id};
  };
}

export async function createOrganization(params: {
  currentUserEmail: NormalizedEmail;
  name: string;
  organizationStore: OrganizationStore;
  organizationMemberStore: OrganizationMemberStore;
  projectStore: ProjectStore;
  projectUserStore: ProjectUserStore;
  projectEnvironmentStore: ProjectEnvironmentStore;
  users: UserStore;
  auditLogs: AuditLogStore;
  now: Date;
}) {
  const {
    currentUserEmail,
    name,
    organizationStore,
    organizationMemberStore,
    projectStore,
    projectUserStore,
    projectEnvironmentStore,
    auditLogs,
    now,
    users,
  } = params;

  const organization: Organization = {
    id: createOrganizationId(),
    name,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await organizationStore.create(organization);
  await organizationMemberStore.create([
    {
      organizationId: organization.id,
      email: currentUserEmail,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const project: Project = {
    id: createProjectId(),
    name: 'First project',
    description: 'This is your personal project.',
    organizationId: organization.id,
    requireProposals: false,
    allowSelfApprovals: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    isExample: false,
  };
  await projectStore.create(project);
  await projectUserStore.create([
    {
      projectId: project.id,
      email: currentUserEmail,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  await projectEnvironmentStore.create({
    projectId: project.id,
    name: 'Production',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    id: createUuidV7(),
  });
  await projectEnvironmentStore.create({
    projectId: project.id,
    name: 'Development',
    order: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    id: createUuidV7(),
  });

  const currentUser = await users.getByEmail(currentUserEmail);
  assert(currentUser, 'Current user not found');

  await auditLogs.create({
    id: createAuditLogId(),
    createdAt: now,
    projectId: null,
    userId: currentUser.id,
    configId: null,
    payload: {
      type: 'organization_created',
      organization: {
        id: organization.id,
        name: name,
      },
    },
  });

  return {organization, project};
}
