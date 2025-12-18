'use client';

import {JsonEditor} from '@/components/json-editor';
import {OverrideBuilder} from '@/components/override-builder';
import {Button} from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {Help} from '@/components/ui/help';
import {Label} from '@/components/ui/label';
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs';
import type {Override} from '@/engine/core/override-evaluator';
import {asConfigValue} from '@/engine/core/zod';
import {createSchemaFromValue} from '@/lib/json-schema-utils';
import {Sparkles} from 'lucide-react';
import type {Control, UseFormGetValues, UseFormSetValue} from 'react-hook-form';
import {toast} from 'sonner';

// Default empty JSON schema to use when enforcement is enabled
const DEFAULT_EMPTY_SCHEMA = JSON.stringify(
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  null,
  2,
);

interface ConfigVariantFieldsProps {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  getValues: UseFormGetValues<any>;
  variantIndex: number;
  fieldPrefix: string; // e.g., 'defaultVariant' or 'environmentVariants'
  environmentId: string;
  environmentName: string;
  editorIdPrefix?: string;
  mode: 'new' | 'edit' | 'view';
  projectId: string;
  canEditValue: boolean;
  canEditSchema: boolean;
  canEditOverrides: boolean;
  watchedVariant?: any;
  overrideBuilderDefaultValue: unknown;
  liveSchema: any | undefined;
  // For schema inheritance
  isEnvironmentVariant?: boolean;
  hasDefaultVariant?: boolean; // Whether a default variant exists at all
  defaultSchema?: any; // The actual default schema for validation
  configName?: string; // The config name to display in editor titles
}

export function ConfigVariantFields({
  control,
  setValue,
  getValues,
  variantIndex,
  fieldPrefix,
  environmentId,
  environmentName,
  editorIdPrefix,
  mode,
  projectId,
  canEditValue,
  canEditSchema,
  canEditOverrides,
  watchedVariant,
  overrideBuilderDefaultValue,
  liveSchema,
  isEnvironmentVariant = false,
  hasDefaultVariant = true,
  configName,
  defaultSchema,
}: ConfigVariantFieldsProps) {
  // Build field name based on whether this is default variant or environment variant
  const getFieldName = (field: string) => {
    if (fieldPrefix === 'defaultVariant') {
      return `defaultVariant.${field}`;
    }
    return `${fieldPrefix}.${variantIndex}.${field}`;
  };

  // Determine which schema to use for the JSON editor
  const effectiveSchema = watchedVariant?.useDefaultSchema ? defaultSchema : liveSchema;

  // Handler for schema enabled toggle
  const handleSchemaEnabledChange = (checked: boolean, fieldOnChange: (value: boolean) => void) => {
    fieldOnChange(checked);

    // If enabling schema and current schema is empty, set default empty schema
    if (checked && !watchedVariant?.schema?.trim()) {
      const schemaFieldName = getFieldName('schema') as any;
      setValue(schemaFieldName, DEFAULT_EMPTY_SCHEMA);
    }
  };

  // Handler for inferring schema from value
  const handleInferSchema = () => {
    const valueFieldName = getFieldName('value') as any;
    const schemaFieldName = getFieldName('schema') as any;
    const currentValue = getValues(valueFieldName);

    try {
      const parsedValue = JSON.parse(currentValue);
      const inferredSchema = createSchemaFromValue(parsedValue);
      setValue(schemaFieldName, JSON.stringify(inferredSchema, null, 2));

      toast.success('Schema inferred from value', {
        description: 'The schema has been inferred from the value and set in the schema field.',
      });
    } catch (error) {
      toast.error('Unable to infer schema — the value contains invalid JSON', {
        description: 'Please fix the JSON syntax errors first, then try again.',
      });
      // If value is not valid JSON, do nothing or show error
      console.error('Cannot infer schema from invalid JSON', error);
    }
  };

  // Handler for adding the first override
  const handleAddFirstOverride = () => {
    const overridesFieldName = getFieldName('overrides') as any;
    const currentOverrides = getValues(overridesFieldName) || [];

    // Add a default empty override
    setValue(overridesFieldName, [
      ...currentOverrides,
      {
        name: 'Override 1',
        conditions: [
          {
            operator: 'equals',
            property: '',
            value: {type: 'literal', value: asConfigValue('')},
          },
        ],
        value: overrideBuilderDefaultValue,
      },
    ]);
  };

  const hasOverrides = (watchedVariant?.overrides?.length ?? 0) > 0;

  return (
    <>
      {/* Show Conditional Overrides section only when there are overrides */}
      {hasOverrides && (
        <FormField
          control={control}
          name={getFieldName('overrides')}
          render={({field}) => (
            <FormItem>
              <div className="flex items-center gap-1.5">
                <FormLabel>Conditional Overrides</FormLabel>
                <Help className="max-w-sm">
                  <div className="space-y-2">
                    <p className="text-sm">
                      Return different values based on runtime context like user attributes, feature
                      flags, or request properties.
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-medium">Common use cases:</p>
                      <ul className="space-y-1 list-disc pl-4 text-muted-foreground">
                        <li>Premium users get higher rate limits</li>
                        <li>Beta features for specific users</li>
                        <li>Regional pricing by country</li>
                        <li>A/B testing variations</li>
                        <li>Staff access to internal features</li>
                      </ul>
                    </div>
                  </div>
                </Help>
              </div>
              <FormControl>
                <OverrideBuilder
                  overrides={field.value as Override[]}
                  onChange={field.onChange}
                  readOnly={!canEditOverrides}
                  schema={liveSchema}
                  projectId={projectId}
                  defaultValue={overrideBuilderDefaultValue}
                  configName={configName}
                />
              </FormControl>
              {!canEditOverrides && (
                <FormDescription>You do not have permission to edit overrides.</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={control}
        name={getFieldName('value')}
        render={({field, fieldState}) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FormLabel>
                  {hasOverrides
                    ? 'Base Value'
                    : isEnvironmentVariant
                      ? 'Value'
                      : 'Configuration Value'}
                </FormLabel>
                <Help>
                  <p>
                    {isEnvironmentVariant
                      ? `The configuration value for the ${environmentName} environment. This overrides the base configuration.`
                      : hasOverrides
                        ? 'The default value returned when no override conditions match.'
                        : 'The configuration value as valid JSON. This will be used by all environments unless overridden.'}
                  </p>
                </Help>
              </div>
              {/* Show "Add Override" button when there are no overrides */}
              {!hasOverrides && canEditOverrides && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={handleAddFirstOverride}
                  className="h-7 text-xs"
                >
                  + Add conditional override
                </Button>
              )}
            </div>
            <FormControl>
              <JsonEditor
                id={`${editorIdPrefix ?? 'config'}-value-${environmentId}`}
                editorName={
                  configName
                    ? `${configName} - ${
                        hasOverrides
                          ? 'Base Value'
                          : isEnvironmentVariant
                            ? `${environmentName} Value`
                            : 'Value'
                      }`
                    : hasOverrides
                      ? 'Base Value'
                      : isEnvironmentVariant
                        ? `Value - ${environmentName}`
                        : 'Configuration Value'
                }
                height={mode === 'new' ? 300 : 360}
                value={field.value}
                onChange={field.onChange}
                aria-label={`Config JSON for ${environmentName}`}
                schema={effectiveSchema}
                readOnly={!canEditValue}
                error={!!fieldState.error}
              />
            </FormControl>
            {!canEditValue && (
              <FormDescription>
                You are in view-only mode and cannot modify the value.
              </FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-4">
        {/* Schema Mode Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium">Schema Validation</Label>
              <Help>
                <p>
                  Control how this configuration value is validated using{' '}
                  <a
                    href="https://json-schema.org/"
                    target="_blank"
                    className="underline hover:no-underline"
                  >
                    JSON Schema
                  </a>
                  .
                </p>
                <div className="mt-2 space-y-1">
                  {isEnvironmentVariant && hasDefaultVariant && (
                    <p>
                      <strong>Base:</strong> Use base configuration&apos;s schema
                    </p>
                  )}
                  <p>
                    <strong>None:</strong> No validation
                  </p>
                  <p>
                    <strong>Custom:</strong> Define custom schema
                  </p>
                </div>
              </Help>
            </div>

            <div className="flex items-center gap-2">
              {canEditSchema &&
                watchedVariant?.schemaEnabled &&
                !watchedVariant?.useDefaultSchema && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleInferSchema}
                    className="h-7 text-xs"
                  >
                    <Sparkles className="h-3 w-3 mr-1.5" />
                    Infer Schema from Value
                  </Button>
                )}

              <Tabs
                value={
                  watchedVariant?.useDefaultSchema
                    ? 'inherit'
                    : watchedVariant?.schemaEnabled
                      ? 'custom'
                      : 'none'
                }
                onValueChange={mode => {
                  if (!canEditSchema) return;

                  const useDefaultSchemaField = getFieldName('useDefaultSchema') as any;
                  const schemaEnabledField = getFieldName('schemaEnabled') as any;
                  const schemaField = getFieldName('schema') as any;

                  if (mode === 'inherit') {
                    setValue(useDefaultSchemaField, true);
                    setValue(schemaEnabledField, false);
                  } else if (mode === 'none') {
                    setValue(useDefaultSchemaField, false);
                    setValue(schemaEnabledField, false);
                  } else if (mode === 'custom') {
                    setValue(useDefaultSchemaField, false);
                    setValue(schemaEnabledField, true);
                    // If enabling custom schema and current schema is empty, set default empty schema
                    if (!watchedVariant?.schema?.trim()) {
                      setValue(schemaField, DEFAULT_EMPTY_SCHEMA);
                    }
                  }
                }}
              >
                <TabsList className="h-8">
                  {isEnvironmentVariant && hasDefaultVariant && (
                    <TabsTrigger
                      value="inherit"
                      disabled={!canEditSchema}
                      className="h-7 text-xs px-3"
                    >
                      Base
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="none" disabled={!canEditSchema} className="h-7 text-xs px-3">
                    None
                  </TabsTrigger>
                  <TabsTrigger
                    value="custom"
                    disabled={!canEditSchema}
                    className="h-7 text-xs px-3"
                  >
                    Custom
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {!canEditSchema && (
            <p className="text-xs text-muted-foreground">
              Only maintainers can change schema settings.
            </p>
          )}
        </div>

        {/* Schema editor - shown when schema is enabled and not using inherited schema */}
        {watchedVariant?.schemaEnabled && !watchedVariant?.useDefaultSchema && (
          <FormField
            control={control}
            name={getFieldName('schema')}
            render={({field, fieldState}) => (
              <FormItem>
                <FormControl>
                  <JsonEditor
                    id={`${editorIdPrefix ?? 'config'}-schema-${environmentId}`}
                    editorName={
                      configName
                        ? `${configName} - ${isEnvironmentVariant ? `${environmentName} Schema` : 'Schema'}`
                        : isEnvironmentVariant
                          ? `Schema - ${environmentName}`
                          : 'Configuration Schema'
                    }
                    height={mode === 'new' ? 300 : 360}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    aria-label={`JSON Schema for ${environmentName}`}
                    readOnly={!canEditSchema}
                    error={!!fieldState.error}
                  />
                </FormControl>
                {!canEditSchema && (
                  <FormDescription>You do not have permission to edit the schema.</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </>
  );
}
