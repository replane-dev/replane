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
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import type {Override} from '@/engine/core/override-evaluator';
import {createSchemaFromValue} from '@/lib/json-schema-utils';
import {CircleHelp, Sparkles} from 'lucide-react';
import type {Control, UseFormGetValues, UseFormSetValue} from 'react-hook-form';
import {toast} from 'sonner';

// Default empty JSON schema to use when enforcement is enabled
const DEFAULT_EMPTY_SCHEMA = JSON.stringify(
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {},
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
  mode: 'new' | 'edit' | 'proposal';
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
  defaultSchemaAvailable?: boolean; // Whether default variant has a schema enabled
  defaultSchema?: any; // The actual default schema for validation
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
  defaultSchemaAvailable = false,
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
      toast.error('Cannot infer schema from invalid JSON', {
        description: error instanceof Error ? error.message : String(error),
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
        conditions: [],
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <div className="space-y-2">
                      <p className="text-sm">
                        Return different values based on runtime context like user attributes,
                        feature flags, or request properties.
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
                  </TooltipContent>
                </Tooltip>
              </div>
              <FormControl>
                <OverrideBuilder
                  overrides={field.value as Override[]}
                  onChange={field.onChange}
                  readOnly={!canEditOverrides}
                  schema={liveSchema}
                  projectId={projectId}
                  defaultValue={overrideBuilderDefaultValue}
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
        render={({field}) => (
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      {isEnvironmentVariant
                        ? `The configuration value for the ${environmentName} environment. This overrides the base configuration.`
                        : hasOverrides
                          ? 'The default value returned when no override conditions match.'
                          : 'The configuration value as valid JSON. This will be used by all environments unless overridden.'}
                    </p>
                  </TooltipContent>
                </Tooltip>
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
                  + Add Conditional Override
                </Button>
              )}
            </div>
            <FormControl>
              <JsonEditor
                id={`${editorIdPrefix ?? 'config'}-value-${environmentId}`}
                height={mode === 'new' ? 300 : 360}
                value={field.value}
                onChange={field.onChange}
                aria-label={`Config JSON for ${environmentName}`}
                schema={effectiveSchema}
                readOnly={!canEditValue}
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
        {/* Inherit Base Schema toggle - shown for environment variants when default variant exists */}
        {isEnvironmentVariant && hasDefaultVariant && (
          <FormField
            control={control}
            name={getFieldName('useDefaultSchema')}
            render={({field}) => (
              <FormItem
                className={`rounded-lg border p-3 transition-colors ${
                  field.value ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-transparent'
                }`}
              >
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        id={`${editorIdPrefix ?? 'config'}-use-default-schema-${environmentId}`}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!canEditSchema}
                      />
                    </FormControl>
                    <div>
                      <Label
                        htmlFor={`${editorIdPrefix ?? 'config'}-use-default-schema-${environmentId}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        Inherit base schema
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {field.value
                          ? defaultSchemaAvailable
                            ? 'Using the same schema as base configuration'
                            : 'No schema enforcement (base has no schema)'
                          : 'Use custom schema for this environment'}
                      </p>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        When enabled, this environment inherits schema enforcement from the base
                        configuration.
                        {defaultSchemaAvailable
                          ? ' The base schema will be applied to this environment.'
                          : ' Since the base has no schema, this means no schema enforcement.'}
                      </p>
                      <p className="mt-2">
                        Disable to define a custom schema for this environment.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </FormItem>
            )}
          />
        )}

        {/* Schema enabled toggle - hidden when using inherited schema */}
        {!watchedVariant?.useDefaultSchema && (
          <FormField
            control={control}
            name={getFieldName('schemaEnabled')}
            render={({field}) => (
              <FormItem>
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex items-center gap-1.5">
                    <Label
                      htmlFor={`${editorIdPrefix ?? 'config'}-use-schema-${environmentId}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      Validate with{' '}
                      <a
                        href="https://json-schema.org/"
                        target="_blank"
                        className="text-primary underline hover:text-primary/80"
                      >
                        JSON Schema
                      </a>
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Enforce that the configuration value matches a JSON Schema. This helps
                          catch errors early and ensures data consistency.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <FormControl>
                    <Switch
                      id={`${editorIdPrefix ?? 'config'}-use-schema-${environmentId}`}
                      checked={field.value}
                      onCheckedChange={checked =>
                        handleSchemaEnabledChange(checked, field.onChange)
                      }
                      disabled={!canEditSchema}
                    />
                  </FormControl>
                </div>
                {!canEditSchema && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Only maintainers can change schema settings.
                  </p>
                )}
              </FormItem>
            )}
          />
        )}

        {/* Schema editor - shown when schema is enabled and not using inherited schema */}
        {watchedVariant?.schemaEnabled && !watchedVariant?.useDefaultSchema && (
          <FormField
            control={control}
            name={getFieldName('schema')}
            render={({field}) => (
              <FormItem className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-sm font-medium">Schema Definition</FormLabel>
                  {canEditSchema && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleInferSchema}
                      className="h-7 text-xs"
                    >
                      <Sparkles className="h-3 w-3 mr-1.5" />
                      Infer from Value
                    </Button>
                  )}
                </div>
                <FormControl>
                  <JsonEditor
                    id={`${editorIdPrefix ?? 'config'}-schema-${environmentId}`}
                    height={mode === 'new' ? 300 : 360}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    aria-label={`JSON Schema for ${environmentName}`}
                    readOnly={!canEditSchema}
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
