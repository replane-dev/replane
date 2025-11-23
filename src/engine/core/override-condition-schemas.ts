import {z} from 'zod';

// Property-based condition schemas
const PropertyConditionBase = z.object({
  property: z.string(),
  value: z.unknown(),
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

export const ContainsConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('contains'),
});

export const NotContainsConditionSchema = PropertyConditionBase.extend({
  operator: z.literal('not_contains'),
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
export type ContainsCondition = z.infer<typeof ContainsConditionSchema>;
export type NotContainsCondition = z.infer<typeof NotContainsConditionSchema>;
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
  | ContainsCondition
  | NotContainsCondition
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
    ContainsConditionSchema,
    NotContainsConditionSchema,
    LessThanConditionSchema,
    LessThanOrEqualConditionSchema,
    GreaterThanConditionSchema,
    GreaterThanOrEqualConditionSchema,
    AndConditionSchema as any,
    OrConditionSchema as any,
    NotConditionSchema as any,
  ]),
) as any;

export function ConfigOverrideCondition(): z.ZodType<Condition> {
  return ConfigOverrideConditionSchema;
}
