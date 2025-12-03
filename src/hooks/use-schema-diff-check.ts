import {deepEquals} from '@/lib/deep-equals';
import {useMemo} from 'react';

interface VariantWithSchema {
  schemaEnabled?: boolean;
  schema?: string;
  useDefaultSchema?: boolean;
}

interface DefaultVariantSchema {
  schemaEnabled?: boolean;
  schema?: string;
}

/**
 * Get the effective schema for a variant, considering useDefaultSchema
 */
function getEffectiveSchema(
  variant: VariantWithSchema,
  defaultVariant: DefaultVariantSchema | undefined,
): {enabled: boolean; schemaText: string; parsed: unknown} {
  // If using default schema, use the default variant's schema
  if (variant.useDefaultSchema && defaultVariant) {
    const enabled = defaultVariant.schemaEnabled ?? false;
    const schemaText = (defaultVariant.schema ?? '').trim();
    let parsed: unknown = null;
    if (enabled && schemaText) {
      try {
        parsed = JSON.parse(schemaText);
      } catch {
        // Keep as null
      }
    }
    return {enabled, schemaText, parsed};
  }

  // Otherwise use the variant's own schema
  const enabled = variant.schemaEnabled ?? false;
  const schemaText = (variant.schema ?? '').trim();
  let parsed: unknown = null;
  if (enabled && schemaText) {
    try {
      parsed = JSON.parse(schemaText);
    } catch {
      // Keep as null
    }
  }
  return {enabled, schemaText, parsed};
}

/**
 * Check if schemas differ across environments
 * Uses deep equality to ignore property order
 * Considers useDefaultSchema - variants that inherit from default are treated as having the default schema
 */
export function useSchemaDiffCheck(watchedVariants: VariantWithSchema[] | undefined): boolean {
  return useMemo(() => {
    if (!watchedVariants || watchedVariants.length < 2) return false;

    // First variant is assumed to be the default variant
    const defaultVariant = watchedVariants[0];
    const firstSchema = getEffectiveSchema(watchedVariants[0], defaultVariant);

    for (let i = 1; i < watchedVariants.length; i++) {
      const currentSchema = getEffectiveSchema(watchedVariants[i], defaultVariant);

      // Different enabled states = different
      if (firstSchema.enabled !== currentSchema.enabled) return true;

      // Both disabled = same
      if (!firstSchema.enabled && !currentSchema.enabled) continue;

      // One is null/empty and the other isn't
      if ((firstSchema.parsed == null) !== (currentSchema.parsed == null)) return true;

      // Deep compare parsed schemas
      if (firstSchema.parsed != null && currentSchema.parsed != null) {
        if (!deepEquals(firstSchema.parsed, currentSchema.parsed)) return true;
      }

      // If both parsed are null but we got here, compare text
      if (firstSchema.parsed == null && currentSchema.parsed == null) {
        if (firstSchema.schemaText !== currentSchema.schemaText) return true;
      }
    }

    return false;
  }, [watchedVariants]);
}
