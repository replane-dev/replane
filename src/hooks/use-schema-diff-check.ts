import {deepEquals} from '@/lib/deep-equals';
import {useMemo} from 'react';

interface VariantWithSchema {
  schemaEnabled?: boolean;
  schema?: string;
}

/**
 * Check if schemas differ across environments
 * Uses deep equality to ignore property order
 */
export function useSchemaDiffCheck(watchedVariants: VariantWithSchema[] | undefined): boolean {
  return useMemo(() => {
    if (!watchedVariants || watchedVariants.length < 2) return false;

    const firstEnabled = watchedVariants[0]?.schemaEnabled ?? false;
    const firstSchemaText = (watchedVariants[0]?.schema ?? '').trim();

    let firstSchemaParsed: unknown = null;
    if (firstEnabled && firstSchemaText) {
      try {
        firstSchemaParsed = JSON.parse(firstSchemaText);
      } catch {
        // If first schema is invalid JSON, still compare as text
      }
    }

    for (let i = 1; i < watchedVariants.length; i++) {
      const currentEnabled = watchedVariants[i]?.schemaEnabled ?? false;
      const currentSchemaText = (watchedVariants[i]?.schema ?? '').trim();

      // Different enabled states = different
      if (firstEnabled !== currentEnabled) return true;

      // Both disabled = same
      if (!firstEnabled && !currentEnabled) continue;

      // Compare schemas using deep equality
      let currentSchemaParsed: unknown = null;
      if (currentSchemaText) {
        try {
          currentSchemaParsed = JSON.parse(currentSchemaText);
        } catch {
          // If can't parse, compare as text
          if (firstSchemaText !== currentSchemaText) return true;
          continue;
        }
      }

      // One is null/empty and the other isn't
      if ((firstSchemaParsed == null) !== (currentSchemaParsed == null)) return true;

      // Deep compare parsed schemas
      if (firstSchemaParsed != null && currentSchemaParsed != null) {
        if (!deepEquals(firstSchemaParsed, currentSchemaParsed)) return true;
      }
    }

    return false;
  }, [watchedVariants]);
}
