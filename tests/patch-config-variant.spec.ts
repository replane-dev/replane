import type {ConfigVariantUpdatedAuditLogPayload} from '@/engine/core/audit-log-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import type {Override} from '@/engine/core/override-condition-schemas';
import {normalizeEmail} from '@/engine/core/utils';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');

const OTHER_USER_ID = 2;

describe('patchConfigVariant', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other', $2, NOW())`,
        [OTHER_USER_ID, OTHER_USER_EMAIL],
      );
    } finally {
      connection.release();
    }
  });

  async function createConfigWithVariant(options?: {
    maintainerEmails?: string[];
    editorEmails?: string[];
    value?: unknown;
    schema?: unknown;
    overrides?: Override[];
  }) {
    // If maintainerEmails is specified and includes CURRENT_USER, don't also add to editors
    const editorEmails =
      options?.editorEmails !== undefined
        ? options.editorEmails
        : options?.maintainerEmails?.includes(CURRENT_USER_EMAIL)
          ? []
          : [CURRENT_USER_EMAIL];

    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: `test_config_${Date.now()}`,
      value: options?.value ?? {enabled: false},
      schema: options?.schema ?? null,
      overrides: options?.overrides ?? [],
      description: 'Test config',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails,
      maintainerEmails: options?.maintainerEmails ?? [],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId, 'Config variant should exist');

    return {configId, configVariantId, variant: variants[0]};
  }

  it('should patch value (editor permission)', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {flag: true},
      editorEmails: [CURRENT_USER_EMAIL],
    });

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {flag: false}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({flag: false});
    expect(updatedVariant.version).toBe(2);
  });

  it('should patch schema (manage permission required)', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      maintainerEmails: [CURRENT_USER_EMAIL],
    });

    const newSchema = {
      type: 'object',
      properties: {count: {type: 'number'}, extra: {type: 'string'}},
    };

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      schema: {newSchema},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.schema).toEqual(newSchema);
    expect(updatedVariant.version).toBe(2);
  });

  it('should patch overrides (editor permission)', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {maxItems: 10},
      editorEmails: [CURRENT_USER_EMAIL],
    });

    const newOverrides: Override[] = [
      {
        name: 'Premium Users',
        conditions: [
          {
            operator: 'equals',
            property: 'tier',
            value: {type: 'literal', value: 'premium'},
          },
        ],
        value: {maxItems: 100},
      },
    ];

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      overrides: {newOverrides},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.overrides).toEqual(newOverrides);
    expect(updatedVariant.version).toBe(2);
  });

  it('should patch value and schema when both valid', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      maintainerEmails: [CURRENT_USER_EMAIL],
    });

    const newSchema = {
      type: 'object',
      properties: {count: {type: 'number'}, extra: {type: 'string'}},
    };

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {count: 2, extra: 'ok'}},
      schema: {newSchema},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({count: 2, extra: 'ok'});
    expect(updatedVariant.schema).toEqual(newSchema);
    expect(updatedVariant.version).toBe(2);
  });

  it('should fail when provided value does not match new schema', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      maintainerEmails: [CURRENT_USER_EMAIL],
    });

    await expect(
      fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
        configVariantId,
        value: {newValue: {flag: 'nope'}}, // string instead of boolean
        schema: {newSchema: {type: 'object', properties: {flag: {type: 'boolean'}}}},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should fail with version mismatch', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: 1,
      schema: {type: 'number'},
      editorEmails: [CURRENT_USER_EMAIL],
    });

    await expect(
      fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
        configVariantId,
        value: {newValue: 2},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 999, // wrong prev version
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should enforce manage permission when changing schema', async () => {
    // Create config where OTHER_USER is editor but not maintainer
    const {configVariantId} = await createConfigWithVariant({
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      editorEmails: [OTHER_USER_EMAIL], // OTHER_USER is only editor
      maintainerEmails: [CURRENT_USER_EMAIL], // CURRENT_USER is maintainer
    });

    // OTHER_USER (editor only) should not be able to change schema
    await expect(
      fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
        configVariantId,
        schema: {
          newSchema: {
            type: 'object',
            properties: {flag: {type: 'boolean'}, extra: {type: 'string'}},
          },
        },
        currentUserEmail: OTHER_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should allow editor to change value without manage permission', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {flag: true},
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
    });

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {flag: false}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({flag: false});
    expect(updatedVariant.version).toBe(2);
  });

  it('should allow removing schema (set to null) without validation', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      maintainerEmails: [CURRENT_USER_EMAIL],
    });

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      schema: {newSchema: null},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.schema).toBeNull();
    expect(updatedVariant.version).toBe(2);
  });

  it('creates audit message (config_variant_updated)', async () => {
    const {configId, configVariantId} = await createConfigWithVariant({
      value: {a: 1},
      schema: {type: 'object', properties: {a: {type: 'number'}}},
      editorEmails: [CURRENT_USER_EMAIL],
    });

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {a: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type);
    expect(types).toContain('config_variant_updated');

    const updated = messages.find(m => m.payload.type === 'config_variant_updated')
      ?.payload as ConfigVariantUpdatedAuditLogPayload;
    expect(updated.before.value).toEqual({a: 1});
    expect(updated.after.value).toEqual({a: 2});
    expect(updated.after.version).toBe(updated.before.version + 1);
    expect(updated.before.configId).toBe(configId);
    expect(updated.after.configId).toBe(configId);
  });

  // Note: Tests for rejecting variant proposals when patching have been removed
  // because variant proposals are now unified into config proposals.
  // The behavior of rejecting pending proposals is tested in approve-config-proposal.spec.ts

  it('should reject all pending config proposals when patching variant', async () => {
    const {configId, configVariantId} = await createConfigWithVariant({
      value: {x: 1},
      editorEmails: [CURRENT_USER_EMAIL],
    });

    // Create a pending config proposal (base version is 1 for newly created config)
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      baseVersion: 1,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal is pending
    const proposalBefore = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(proposalBefore);
    expect(proposalBefore.approvedAt).toBeNull();
    expect(proposalBefore.rejectedAt).toBeNull();

    // Patch the variant directly
    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {x: 10}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Verify proposal was rejected
    const proposalAfter = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(proposalAfter);
    expect(proposalAfter.approvedAt).toBeNull();
    expect(proposalAfter.rejectedAt).not.toBeNull();
    expect(proposalAfter.rejectionReason).toBe('config_edited');
  });

  it('should throw ForbiddenError when user is not an editor', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {flag: true},
      editorEmails: [CURRENT_USER_EMAIL], // OTHER_USER is not an editor
      maintainerEmails: [],
    });

    await expect(
      fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
        configVariantId,
        value: {newValue: {flag: false}},
        currentUserEmail: OTHER_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should update updatedAt timestamp', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {flag: true},
      editorEmails: [CURRENT_USER_EMAIL],
    });

    const initialVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(initialVariant);
    const initialUpdatedAt = initialVariant.updatedAt;

    // Advance time
    fixture.setNow(new Date('2020-01-02T00:00:00Z'));

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {flag: false}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
  });

  it('should create version history entry', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      editorEmails: [CURRENT_USER_EMAIL],
    });

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {count: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Check version history was created
    const versions = await fixture.engine.testing.pool.query(
      `SELECT * FROM config_variant_versions WHERE config_variant_id = $1 ORDER BY version ASC`,
      [configVariantId],
    );

    expect(versions.rows).toHaveLength(2);
    expect(versions.rows[0].version).toBe(1);
    expect(versions.rows[1].version).toBe(2);
  });

  it('should patch multiple fields at once (value, schema, overrides)', async () => {
    const {configVariantId} = await createConfigWithVariant({
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      overrides: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
    });

    const newSchema = {
      type: 'object',
      properties: {count: {type: 'number'}, active: {type: 'boolean'}},
    };

    const newOverrides: Override[] = [
      {
        name: 'Test Override',
        conditions: [
          {
            operator: 'equals',
            property: 'region',
            value: {type: 'literal', value: 'US'},
          },
        ],
        value: {count: 100, active: true},
      },
    ];

    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {count: 5, active: true}},
      schema: {newSchema},
      overrides: {newOverrides},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({count: 5, active: true});
    expect(updatedVariant.schema).toEqual(newSchema);
    expect(updatedVariant.overrides).toEqual(newOverrides);
    expect(updatedVariant.version).toBe(2);
  });
});

describe('patchConfigVariant with requireProposals enabled', () => {
  const fixture = useAppFixture({
    authEmail: CURRENT_USER_EMAIL,
    requireProposals: true,
  });

  it('should throw BadRequestError when direct changes are disabled', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: `require_proposals_${Date.now()}`,
      value: {x: 1},
      schema: null,
      overrides: [],
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    await expect(
      fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
        configVariantId,
        value: {newValue: {x: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toThrow(BadRequestError);

    // Verify variant was not changed
    const variant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(variant);
    expect(variant.value).toEqual({x: 1});
    expect(variant.version).toBe(1);
  });
});
