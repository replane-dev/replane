import {z} from 'zod';
import {JsonPathSchema} from './json-path';
import {ConfigName} from './stores/config-store';
import {ConfigValue} from './zod';

const PrimitiveValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const LiteralValueSchema = z.object({
  type: z.literal('literal'),
  value: z.union([PrimitiveValueSchema, z.array(PrimitiveValueSchema)]),
});

const ReferenceValueSchema = z.object({
  type: z.literal('reference'),
  projectId: z.string(),
  configName: ConfigName(),
  path: JsonPathSchema,
});

export const ValueSchema = z.discriminatedUnion('type', [LiteralValueSchema, ReferenceValueSchema]);

export type Value = z.infer<typeof ValueSchema>;

// Property-based condition schemas
const PropertyConditionBase = z.object({
  property: z.string(),
  value: ValueSchema,
});

export const EqualsConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('equals'),
});

export const InConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('in'),
});

export const NotInConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('not_in'),
});

export const LessThanConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('less_than'),
});

export const LessThanOrEqualConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('less_than_or_equal'),
});

export const GreaterThanConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('greater_than'),
});

export const GreaterThanOrEqualConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('greater_than_or_equal'),
});

const SegmentationConditionSchema = z.object({
  operator: z.literal('segmentation'),
  property: z.string(),
  fromPercentage: z.number().min(0).max(100),
  toPercentage: z.number().min(0).max(100),
  seed: z.string(),
});

// Infer property-based condition types
export type EqualsCondition = z.infer<typeof EqualsConditionSchema>;
export type InCondition = z.infer<typeof InConditionSchema>;
export type NotInCondition = z.infer<typeof NotInConditionSchema>;
export type LessThanCondition = z.infer<typeof LessThanConditionSchema>;
export type LessThanOrEqualCondition = z.infer<typeof LessThanOrEqualConditionSchema>;
export type GreaterThanCondition = z.infer<typeof GreaterThanConditionSchema>;
export type GreaterThanOrEqualCondition = z.infer<typeof GreaterThanOrEqualConditionSchema>;
export type SegmentationCondition = z.infer<typeof SegmentationConditionSchema>;

// TypeScript types for composite conditions (defined before schemas for proper typing)
export type AndCondition = {
  operator: 'and';
  conditions: Condition[];
};

export type OrCondition = {
  operator: 'or';
  conditions: Condition[];
};

export type NotCondition = {
  operator: 'not';
  condition: Condition;
};

// Union of all condition types
export type Condition =
  | EqualsCondition
  | InCondition
  | NotInCondition
  | LessThanCondition
  | LessThanOrEqualCondition
  | GreaterThanCondition
  | GreaterThanOrEqualCondition
  | SegmentationCondition
  | AndCondition
  | OrCondition
  | NotCondition;

// Composite condition schemas with proper typing
export const AndConditionSchema: z.ZodType<AndCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('and'),
    conditions: z.array(ConditionSchema),
  }),
);

export const OrConditionSchema: z.ZodType<OrCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('or'),
    conditions: z.array(ConditionSchema),
  }),
);

export const NotConditionSchema: z.ZodType<NotCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('not'),
    condition: ConditionSchema,
  }),
);

// Main condition schema using discriminated union for better performance
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('operator', [
    EqualsConditionSchema,
    InConditionSchema,
    NotInConditionSchema,
    LessThanConditionSchema,
    LessThanOrEqualConditionSchema,
    GreaterThanConditionSchema,
    GreaterThanOrEqualConditionSchema,
    SegmentationConditionSchema,
    AndConditionSchema as any,
    OrConditionSchema as any,
    NotConditionSchema as any,
  ]),
);

export const OverrideSchema = z.object({
  name: z.string(),
  conditions: z.array(ConditionSchema),
  value: ConfigValue(),
});

export type Override = z.infer<typeof OverrideSchema>;

// ========================================
// Rendered Condition Schemas (after resolving references)
// ========================================

// Rendered property-based condition schemas (value is resolved to unknown)
const RenderedPropertyConditionBase = z.object({
  property: z.string(),
  value: z.unknown(),
});

export const RenderedEqualsConditionSchema = RenderedPropertyConditionBase.extend({
  operator: z.literal('equals'),
});

export const RenderedInConditionSchema = RenderedPropertyConditionBase.extend({
  operator: z.literal('in'),
});

export const RenderedNotInConditionSchema = RenderedPropertyConditionBase.extend({
  operator: z.literal('not_in'),
});

export const RenderedLessThanConditionSchema = RenderedPropertyConditionBase.extend({
  operator: z.literal('less_than'),
});

export const RenderedLessThanOrEqualConditionSchema = RenderedPropertyConditionBase.extend({
  operator: z.literal('less_than_or_equal'),
});

export const RenderedGreaterThanConditionSchema = RenderedPropertyConditionBase.extend({
  operator: z.literal('greater_than'),
});

export const RenderedGreaterThanOrEqualConditionSchema = RenderedPropertyConditionBase.extend({
  operator: z.literal('greater_than_or_equal'),
});

export const RenderedSegmentationConditionSchema = z.object({
  operator: z.literal('segmentation'),
  property: z.string(),
  fromPercentage: z.number().min(0).max(100),
  toPercentage: z.number().min(0).max(100),
  seed: z.string(),
});

// Infer rendered property-based condition types
export type RenderedEqualsCondition = z.infer<typeof RenderedEqualsConditionSchema>;
export type RenderedInCondition = z.infer<typeof RenderedInConditionSchema>;
export type RenderedNotInCondition = z.infer<typeof RenderedNotInConditionSchema>;
export type RenderedLessThanCondition = z.infer<typeof RenderedLessThanConditionSchema>;
export type RenderedLessThanOrEqualCondition = z.infer<
  typeof RenderedLessThanOrEqualConditionSchema
>;
export type RenderedGreaterThanCondition = z.infer<typeof RenderedGreaterThanConditionSchema>;
export type RenderedGreaterThanOrEqualCondition = z.infer<
  typeof RenderedGreaterThanOrEqualConditionSchema
>;
export type RenderedSegmentationCondition = z.infer<typeof RenderedSegmentationConditionSchema>;

// TypeScript types for rendered composite conditions
export type RenderedAndCondition = {
  operator: 'and';
  conditions: RenderedCondition[];
};

export type RenderedOrCondition = {
  operator: 'or';
  conditions: RenderedCondition[];
};

export type RenderedNotCondition = {
  __sentinel: undefined;
  operator: 'not';
  condition: RenderedCondition;
};

// Union of all rendered condition types
export type RenderedCondition =
  | RenderedEqualsCondition
  | RenderedInCondition
  | RenderedNotInCondition
  | RenderedLessThanCondition
  | RenderedLessThanOrEqualCondition
  | RenderedGreaterThanCondition
  | RenderedGreaterThanOrEqualCondition
  | RenderedSegmentationCondition
  | RenderedAndCondition
  | RenderedOrCondition
  | RenderedNotCondition;

// Rendered composite condition schemas
export const RenderedAndConditionSchema: z.ZodType<RenderedAndCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('and'),
    conditions: z.array(RenderedConditionSchema),
  }),
);

export const RenderedOrConditionSchema: z.ZodType<RenderedOrCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('or'),
    conditions: z.array(RenderedConditionSchema),
  }),
);

export const RenderedNotConditionSchema: z.ZodType<RenderedNotCondition> = z.lazy(() =>
  z.object({
    __sentinel: z.undefined(),
    operator: z.literal('not'),
    condition: RenderedConditionSchema,
  }),
);

// Main rendered condition schema
export const RenderedConditionSchema: z.ZodType<RenderedCondition> = z.lazy(() =>
  z.discriminatedUnion('operator', [
    RenderedEqualsConditionSchema,
    RenderedInConditionSchema,
    RenderedNotInConditionSchema,
    RenderedLessThanConditionSchema,
    RenderedLessThanOrEqualConditionSchema,
    RenderedGreaterThanConditionSchema,
    RenderedGreaterThanOrEqualConditionSchema,
    RenderedSegmentationConditionSchema,
    RenderedAndConditionSchema as any,
    RenderedOrConditionSchema as any,
    RenderedNotConditionSchema as any,
  ]),
);

export const RenderedOverrideSchema = z.object({
  name: z.string(),
  conditions: z.array(RenderedConditionSchema),
  value: z.unknown(),
});

export type RenderedOverride = z.infer<typeof RenderedOverrideSchema>;

// ========================================
// Admin api override schemas
// ========================================

const AdminApiPrimitiveValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const AdminApiLiteralValueSchema = z.object({
  type: z.literal('literal'),
  value: z.union([PrimitiveValueSchema, z.array(PrimitiveValueSchema)]),
});

const AdminApiReferenceValueSchema = z.object({
  type: z.literal('reference'),
  projectId: z.string(),
  configName: ConfigName(),
  path: JsonPathSchema,
});

export const AdminApiValueSchema = z.discriminatedUnion('type', [
  AdminApiLiteralValueSchema,
  AdminApiReferenceValueSchema,
]);

export type AdminApiValue = z.infer<typeof AdminApiValueSchema>;

// Property-based condition schemas
const AdminApiPropertyConditionBase = z.object({
  property: z.string(),
  value: AdminApiValueSchema,
});

export const AdminApiEqualsConditionSchema = AdminApiPropertyConditionBase.extend({
  operator: z.literal('equals'),
});

export const AdminApiInConditionSchema = AdminApiPropertyConditionBase.extend({
  operator: z.literal('in'),
});

export const AdminApiNotInConditionSchema = AdminApiPropertyConditionBase.extend({
  operator: z.literal('not_in'),
});

export const AdminApiLessThanConditionSchema = AdminApiPropertyConditionBase.extend({
  operator: z.literal('less_than'),
});

export const AdminApiLessThanOrEqualConditionSchema = AdminApiPropertyConditionBase.extend({
  operator: z.literal('less_than_or_equal'),
});

export const AdminApiGreaterThanConditionSchema = AdminApiPropertyConditionBase.extend({
  operator: z.literal('greater_than'),
});

export const AdminApiGreaterThanOrEqualConditionSchema = AdminApiPropertyConditionBase.extend({
  operator: z.literal('greater_than_or_equal'),
});

const AdminApiSegmentationConditionSchema = z.object({
  operator: z.literal('segmentation'),
  property: z.string(),
  fromPercentage: z.number().min(0).max(100),
  toPercentage: z.number().min(0).max(100),
  seed: z.string(),
});

// Infer property-based condition types
export type AdminApiEqualsCondition = z.infer<typeof AdminApiEqualsConditionSchema>;
export type AdminApiInCondition = z.infer<typeof AdminApiInConditionSchema>;
export type AdminApiNotInCondition = z.infer<typeof AdminApiNotInConditionSchema>;
export type AdminApiLessThanCondition = z.infer<typeof AdminApiLessThanConditionSchema>;
export type AdminApiLessThanOrEqualCondition = z.infer<
  typeof AdminApiLessThanOrEqualConditionSchema
>;
export type AdminApiGreaterThanCondition = z.infer<typeof AdminApiGreaterThanConditionSchema>;
export type AdminApiGreaterThanOrEqualCondition = z.infer<
  typeof AdminApiGreaterThanOrEqualConditionSchema
>;
export type AdminApiSegmentationCondition = z.infer<typeof AdminApiSegmentationConditionSchema>;

// TypeScript types for composite conditions (defined before schemas for proper typing)
export type AdminApiAndCondition = {
  operator: 'and';
  conditions: AdminApiCondition[];
};

export type AdminApiOrCondition = {
  operator: 'or';
  conditions: AdminApiCondition[];
};

export type AdminApiNotCondition = {
  operator: 'not';
  condition: AdminApiCondition;
};

// Union of all condition types
export type AdminApiCondition =
  | AdminApiEqualsCondition
  | AdminApiInCondition
  | AdminApiNotInCondition
  | AdminApiLessThanCondition
  | AdminApiLessThanOrEqualCondition
  | AdminApiGreaterThanCondition
  | AdminApiGreaterThanOrEqualCondition
  | AdminApiSegmentationCondition
  | AdminApiAndCondition
  | AdminApiOrCondition
  | AdminApiNotCondition;

// Composite condition schemas with proper typing
export const AdminApiAndConditionSchema: z.ZodType<AdminApiAndCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('and'),
    conditions: z.array(AdminApiConditionSchema),
  }),
);

export const AdminApiOrConditionSchema: z.ZodType<AdminApiOrCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('or'),
    conditions: z.array(AdminApiConditionSchema),
  }),
);

export const AdminApiNotConditionSchema: z.ZodType<AdminApiNotCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('not'),
    condition: AdminApiConditionSchema,
  }),
);

// Main condition schema using discriminated union for better performance
export const AdminApiConditionSchema: z.ZodType<AdminApiCondition> = z.lazy(() =>
  z.discriminatedUnion('operator', [
    AdminApiEqualsConditionSchema,
    AdminApiInConditionSchema,
    AdminApiNotInConditionSchema,
    AdminApiLessThanConditionSchema,
    AdminApiLessThanOrEqualConditionSchema,
    AdminApiGreaterThanConditionSchema,
    AdminApiGreaterThanOrEqualConditionSchema,
    AdminApiSegmentationConditionSchema,
    AdminApiAndConditionSchema as any,
    AdminApiOrConditionSchema as any,
    AdminApiNotConditionSchema as any,
  ]),
);

export const AdminApiOverrideSchema = z.object({
  name: z.string(),
  conditions: z.array(AdminApiConditionSchema),
  value: z.unknown(),
});

export type AdminApiOverride = z.infer<typeof AdminApiOverrideSchema>;
