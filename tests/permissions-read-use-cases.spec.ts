import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {asConfigValue} from '@/engine/core/zod';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OUTSIDER_USER_EMAIL = normalizeEmail('outsider@example.com');
const OUTSIDER_USER_ID = 999;

describe('Read Use Cases - Permission Checks', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    // Create an outsider user who is NOT a member of the workspace
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Outsider', $2, NOW())`,
        [OUTSIDER_USER_ID, OUTSIDER_USER_EMAIL],
      );
    } finally {
      connection.release();
    }
  });

  describe('getConfig', () => {
    it('should prevent non-org member from viewing config', async () => {
      const {configId} = await fixture.createConfig({
        name: 'secret_config',
        value: {secret: true},
        schema: null,
        overrides: [],
        description: 'Secret config',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      await expect(
        fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
          name: 'secret_config',
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getConfigList', () => {
    it('should prevent non-org member from listing configs', async () => {
      await expect(
        fixture.engine.useCases.getConfigList(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getProjectEnvironments', () => {
    it('should prevent non-org member from listing environments', async () => {
      await expect(
        fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getProjectUsers', () => {
    it('should prevent non-org member from listing project members', async () => {
      await expect(
        fixture.engine.useCases.getProjectUsers(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getSdkKeyList', () => {
    it('should prevent non-org member from listing SDK keys', async () => {
      await expect(
        fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getSdkKey', () => {
    it('should prevent non-org member from viewing SDK key details', async () => {
      // Create an SDK key first
      const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        name: 'Test Key',
        description: 'Test',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      await expect(
        fixture.engine.useCases.getSdkKey(GLOBAL_CONTEXT, {
          id: sdkKey.id,
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getAuditLog', () => {
    it('should prevent non-org member from viewing audit logs', async () => {
      await expect(
        fixture.engine.useCases.getAuditLog(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
          from: new Date('2020-01-01'),
          to: new Date('2030-01-01'),
          limit: 10,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getConfigProposalList', () => {
    it('should prevent non-org member from listing proposals', async () => {
      await expect(
        fixture.engine.useCases.getConfigProposalList(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getConfigProposal', () => {
    it('should prevent non-org member from viewing proposal details', async () => {
      // Create a config and proposal first
      const {configId} = await fixture.createConfig({
        name: 'test_config',
        value: {test: true},
        schema: null,
        overrides: [],
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      const {configProposalId} = await fixture.engine.useCases.createConfigProposal(
        GLOBAL_CONTEXT,
        {
          baseVersion: 1,
          configId,
          projectId: fixture.projectId,
          description: 'Updated',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({test: true}),
              schema: null,
              overrides: [],
              useDefaultSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({test: true}),
              schema: null,
              overrides: [],
              useDefaultSchema: false,
            },
          ],
          currentUserEmail: CURRENT_USER_EMAIL,
          proposedDelete: false,
          defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
          message: null,
        },
      );

      await expect(
        fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
          proposalId: configProposalId,
          projectId: fixture.projectId,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getAuditLogMessage', () => {
    it('should prevent non-org member from viewing audit log message', async () => {
      // Create a config to generate an audit log
      await fixture.createConfig({
        name: 'audit_test_config',
        value: {test: true},
        schema: null,
        overrides: [],
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Get an audit log entry
      const auditLogs = await fixture.engine.useCases.getAuditLog(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        currentUserEmail: CURRENT_USER_EMAIL,
        from: new Date('2020-01-01'),
        to: new Date('2030-01-01'),
        limit: 10,
      });

      const firstLog = auditLogs.messages[0];
      if (!firstLog) {
        throw new Error('No audit log found');
      }

      await expect(
        fixture.engine.useCases.getAuditLogMessage(GLOBAL_CONTEXT, {
          id: firstLog.id,
          currentUserEmail: OUTSIDER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
