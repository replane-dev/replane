import {z} from 'zod';
import {ConfigName} from './config-store';
import {JsonPathSchema} from './json-path';

const LiteralValueSchema = z.object({
  type: z.literal('literal'),
  value: z.unknown(),
});

const ReferenceValueSchema = z.object({
  type: z.literal('reference'),
  projectId: z.string(),
  configName: ConfigName(),
  path: JsonPathSchema,
});

const ValueSchema = z.discriminatedUnion('type', [LiteralValueSchema, ReferenceValueSchema]);

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
  percentage: z.number().min(0).max(100),
  salt: z.string(),
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
    conditions: z.array(ConfigOverrideConditionSchema),
  }),
);

export const OrConditionSchema: z.ZodType<OrCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('or'),
    conditions: z.array(ConfigOverrideConditionSchema),
  }),
);

export const NotConditionSchema: z.ZodType<NotCondition> = z.lazy(() =>
  z.object({
    operator: z.literal('not'),
    condition: ConfigOverrideConditionSchema,
  }),
);

// Main condition schema using discriminated union for better performance
export const ConfigOverrideConditionSchema: z.ZodType<Condition> = z.lazy(() =>
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
) as any;

export function ConfigOverrideCondition(): z.ZodType<Condition> {
  return ConfigOverrideConditionSchema;
}
