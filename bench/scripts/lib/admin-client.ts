/**
 * Admin API Client for k6
 *
 * A lightweight admin client similar to @replanejs/admin but designed for k6 load tests.
 * Uses types from @replanejs/admin package.
 */

import type {
  Config,
  CreateConfigRequest,
  CreateConfigResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateSdkKeyRequest,
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  DeleteConfigRequest,
  DeleteProjectRequest,
  DeleteSdkKeyRequest,
  DeleteWorkspaceRequest,
  GetConfigRequest,
  GetProjectRequest,
  GetWorkspaceRequest,
  // Config types
  ListConfigsRequest,
  ListConfigsResponse,
  // Environment types
  ListEnvironmentsRequest,
  ListEnvironmentsResponse,
  // Member types
  ListMembersRequest,
  ListMembersResponse,
  ListProjectsResponse,
  // SDK Key types
  ListSdkKeysRequest,
  ListSdkKeysResponse,
  ListWorkspacesResponse,
  // Project types
  Project,
  SdkKeyWithToken,
  UpdateConfigRequest,
  UpdateConfigResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  // Workspace types
  Workspace,
} from '@replanejs/admin';
import {check} from 'k6';
import http from 'k6/http';
import {failure, type Result, success} from './result.ts';

// ============= Client Options =============

export interface AdminClientOptions {
  baseUrl: string;
  apiKey: string;
}

// ============= Helper Functions =============

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function getHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function parseResponse<T>(
  res: {status: number; body: string | ArrayBuffer | null},
  checkName: string,
): Result<T> {
  check(res, {
    [`${checkName} status is 2xx`]: r => isSuccessStatus(r.status),
  });

  const bodyStr = typeof res.body === 'string' ? res.body : '';

  if (isSuccessStatus(res.status)) {
    try {
      const data = JSON.parse(bodyStr || '{}') as T;
      return success(res.status, data);
    } catch {
      return failure(res.status, 'Failed to parse response body');
    }
  }

  return failure(res.status, bodyStr || 'Unknown error');
}

function parseEmptyResponse(
  res: {status: number; body: string | ArrayBuffer | null},
  checkName: string,
): Result<void> {
  check(res, {
    [`${checkName} status is 2xx`]: r => isSuccessStatus(r.status),
  });

  if (isSuccessStatus(res.status)) {
    return success(res.status, undefined);
  }

  const bodyStr = typeof res.body === 'string' ? res.body : '';
  return failure(res.status, bodyStr || 'Unknown error');
}

// ============= API Classes =============

class WorkspacesApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  list(): Result<ListWorkspacesResponse> {
    const res = http.get(`${this.baseUrl}/api/admin/v1/workspaces`, {
      headers: getHeaders(this.apiKey),
    });

    return parseResponse<ListWorkspacesResponse>(res, 'list workspaces');
  }

  get(request: GetWorkspaceRequest): Result<Workspace> {
    const res = http.get(`${this.baseUrl}/api/admin/v1/workspaces/${request.workspaceId}`, {
      headers: getHeaders(this.apiKey),
    });

    return parseResponse<Workspace>(res, 'get workspace');
  }

  create(request: CreateWorkspaceRequest): Result<CreateWorkspaceResponse> {
    const res = http.post(
      `${this.baseUrl}/api/admin/v1/workspaces`,
      JSON.stringify({name: request.name}),
      {headers: getHeaders(this.apiKey)},
    );

    return parseResponse<CreateWorkspaceResponse>(res, 'create workspace');
  }

  delete(request: DeleteWorkspaceRequest): Result<void> {
    const res = http.del(`${this.baseUrl}/api/admin/v1/workspaces/${request.workspaceId}`, null, {
      headers: getHeaders(this.apiKey),
    });

    return parseEmptyResponse(res, 'delete workspace');
  }
}

class ProjectsApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  list(): Result<ListProjectsResponse> {
    const res = http.get(`${this.baseUrl}/api/admin/v1/projects`, {
      headers: getHeaders(this.apiKey),
    });

    return parseResponse<ListProjectsResponse>(res, 'list projects');
  }

  get(request: GetProjectRequest): Result<Project> {
    const res = http.get(`${this.baseUrl}/api/admin/v1/projects/${request.projectId}`, {
      headers: getHeaders(this.apiKey),
    });

    return parseResponse<Project>(res, 'get project');
  }

  create(request: CreateProjectRequest): Result<CreateProjectResponse> {
    const res = http.post(
      `${this.baseUrl}/api/admin/v1/workspaces/${request.workspaceId}/projects`,
      JSON.stringify({name: request.name, description: request.description}),
      {headers: getHeaders(this.apiKey)},
    );

    return parseResponse<CreateProjectResponse>(res, 'create project');
  }

  update(request: UpdateProjectRequest): Result<UpdateProjectResponse> {
    const res = http.patch(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}`,
      JSON.stringify({name: request.name, description: request.description}),
      {headers: getHeaders(this.apiKey)},
    );

    return parseResponse<UpdateProjectResponse>(res, 'update project');
  }

  delete(request: DeleteProjectRequest): Result<void> {
    const res = http.del(`${this.baseUrl}/api/admin/v1/projects/${request.projectId}`, null, {
      headers: getHeaders(this.apiKey),
    });

    return parseEmptyResponse(res, 'delete project');
  }
}

class EnvironmentsApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  list(request: ListEnvironmentsRequest): Result<ListEnvironmentsResponse> {
    const res = http.get(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}/environments`,
      {headers: getHeaders(this.apiKey)},
    );

    return parseResponse<ListEnvironmentsResponse>(res, 'list environments');
  }
}

class SdkKeysApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  list(request: ListSdkKeysRequest): Result<ListSdkKeysResponse> {
    const res = http.get(`${this.baseUrl}/api/admin/v1/projects/${request.projectId}/sdk-keys`, {
      headers: getHeaders(this.apiKey),
    });

    return parseResponse<ListSdkKeysResponse>(res, 'list sdk keys');
  }

  create(request: CreateSdkKeyRequest): Result<SdkKeyWithToken> {
    const res = http.post(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}/sdk-keys`,
      JSON.stringify({
        environmentId: request.environmentId,
        name: request.name,
        description: request.description,
      }),
      {headers: getHeaders(this.apiKey)},
    );

    return parseResponse<SdkKeyWithToken>(res, 'create sdk key');
  }

  delete(request: DeleteSdkKeyRequest): Result<void> {
    const res = http.del(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}/sdk-keys/${request.sdkKeyId}`,
      null,
      {headers: getHeaders(this.apiKey)},
    );

    return parseEmptyResponse(res, 'delete sdk key');
  }
}

class ConfigsApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  list(request: ListConfigsRequest): Result<ListConfigsResponse> {
    const res = http.get(`${this.baseUrl}/api/admin/v1/projects/${request.projectId}/configs`, {
      headers: getHeaders(this.apiKey),
      tags: {type: 'admin', operation: 'list'},
    });

    return parseResponse<ListConfigsResponse>(res, 'list configs');
  }

  get(request: GetConfigRequest): Result<Config> {
    const res = http.get(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}/configs/${request.configName}`,
      {
        headers: getHeaders(this.apiKey),
        tags: {type: 'admin', operation: 'read'},
      },
    );

    return parseResponse<Config>(res, 'get config');
  }

  create(request: CreateConfigRequest): Result<CreateConfigResponse> {
    const res = http.post(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}/configs`,
      JSON.stringify({
        name: request.name,
        description: request.description,
        editors: request.editors,
        maintainers: request.maintainers,
        base: request.base,
        variants: request.variants,
      }),
      {
        headers: getHeaders(this.apiKey),
        tags: {type: 'admin', operation: 'create'},
      },
    );

    return parseResponse<CreateConfigResponse>(res, 'create config');
  }

  update(request: UpdateConfigRequest): Result<UpdateConfigResponse> {
    const res = http.put(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}/configs/${request.configName}`,
      JSON.stringify({
        description: request.description,
        editors: request.editors,
        base: request.base,
        variants: request.variants,
      }),
      {
        headers: getHeaders(this.apiKey),
        tags: {type: 'admin', operation: 'update'},
      },
    );

    return parseResponse<UpdateConfigResponse>(res, 'update config');
  }

  delete(request: DeleteConfigRequest): Result<void> {
    const res = http.del(
      `${this.baseUrl}/api/admin/v1/projects/${request.projectId}/configs/${request.configName}`,
      null,
      {
        headers: getHeaders(this.apiKey),
        tags: {type: 'admin', operation: 'delete'},
      },
    );

    return parseEmptyResponse(res, 'delete config');
  }
}

class MembersApi {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  list(request: ListMembersRequest): Result<ListMembersResponse> {
    const res = http.get(`${this.baseUrl}/api/admin/v1/projects/${request.projectId}/members`, {
      headers: getHeaders(this.apiKey),
    });

    return parseResponse<ListMembersResponse>(res, 'list members');
  }
}

/**
 * Admin API client for k6 load tests
 */
export class AdminClient {
  public readonly workspaces: WorkspacesApi;
  public readonly projects: ProjectsApi;
  public readonly environments: EnvironmentsApi;
  public readonly sdkKeys: SdkKeysApi;
  public readonly configs: ConfigsApi;
  public readonly members: MembersApi;

  constructor(options: AdminClientOptions) {
    this.workspaces = new WorkspacesApi(options.baseUrl, options.apiKey);
    this.projects = new ProjectsApi(options.baseUrl, options.apiKey);
    this.environments = new EnvironmentsApi(options.baseUrl, options.apiKey);
    this.sdkKeys = new SdkKeysApi(options.baseUrl, options.apiKey);
    this.configs = new ConfigsApi(options.baseUrl, options.apiKey);
    this.members = new MembersApi(options.baseUrl, options.apiKey);
  }
}

/**
 * Create an admin client instance
 */
export function createAdminClient(options: AdminClientOptions): AdminClient {
  return new AdminClient(options);
}
