'use client';

import {JsonEditor} from '@/components/json-editor';
import {OverrideBuilder} from '@/components/override-builder';
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
import {CircleHelp} from 'lucide-react';
import type {Control} from 'react-hook-form';

interface ConfigVariantFieldsProps {
  control: Control<any>;
  variantIndex: number;
  environmentId: string;
  environmentName: string;
  editorIdPrefix?: string;
  mode: 'new' | 'edit' | 'proposal';
  projectId: string;
  canEditValue: boolean;
  canEditSchema: boolean;
  canEditOverrides: boolean;
  watchedVariants?: any[];
  overrideBuilderDefaultValue: unknown;
  liveSchema: any | undefined;
}

export function ConfigVariantFields({
  control,
  variantIndex,
  environmentId,
  environmentName,
  editorIdPrefix,
  mode,
  projectId,
  canEditValue,
  canEditSchema,
  canEditOverrides,
  watchedVariants,
  overrideBuilderDefaultValue,
  liveSchema,
}: ConfigVariantFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name={`variants.${variantIndex}.overrides`}
        render={({field}) => (
          <FormItem>
            <div className="flex items-center gap-1.5">
              <FormLabel>Value overrides</FormLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <div className="space-y-2">
                    <p className="text-sm">
                      Overrides allow you to conditionally return different values based on context
                      properties like user email, tier, country, etc.
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-medium">Examples:</p>
                      <ul className="space-y-1 list-disc pl-4 text-muted-foreground">
                        <li>Premium users get higher rate limits</li>
                        <li>VIP customers see beta features</li>
                        <li>Regional pricing based on country</li>
                        <li>A/B testing by user ID</li>
                        <li>Internal employees bypass restrictions</li>
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

      <FormField
        control={control}
        name={`variants.${variantIndex}.value`}
        render={({field}) => (
          <FormItem>
            <div className="flex items-center gap-1.5">
              <FormLabel>
                {(watchedVariants?.[variantIndex]?.overrides?.length ?? 0) > 0
                  ? 'Default Value'
                  : 'Value'}
              </FormLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    The configuration value as valid JSON. This is the actual data that will be
                    stored and retrieved for this config in the {environmentName} environment.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <FormControl>
              <JsonEditor
                id={`${editorIdPrefix ?? 'config'}-value-${environmentId}`}
                height={mode === 'new' ? 300 : 360}
                value={field.value}
                onChange={field.onChange}
                aria-label={`Config JSON for ${environmentName}`}
                schema={liveSchema}
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
        <FormField
          control={control}
          name={`variants.${variantIndex}.schemaEnabled`}
          render={({field}) => (
            <FormItem>
              <div className="flex items-center justify-between space-x-2">
                <div className="flex items-center gap-1.5">
                  <Label
                    htmlFor={`${editorIdPrefix ?? 'config'}-use-schema-${environmentId}`}
                    className="text-sm font-medium cursor-pointer gap-1"
                  >
                    Enforce{' '}
                    <a
                      href="https://json-schema.org/"
                      target="_blank"
                      className="text-primary underline"
                    >
                      JSON schema
                    </a>
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        When enabled, the config value must validate against the JSON Schema before
                        it can be saved. This helps ensure data consistency and catch errors early.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  <Switch
                    id={`${editorIdPrefix ?? 'config'}-use-schema-${environmentId}`}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!canEditSchema}
                  />
                </FormControl>
              </div>
              {!canEditSchema && (
                <p className="text-xs text-muted-foreground">
                  Only maintainers can change schema enforcement.
                </p>
              )}
            </FormItem>
          )}
        />

        {watchedVariants?.[variantIndex]?.schemaEnabled && (
          <FormField
            control={control}
            name={`variants.${variantIndex}.schema`}
            render={({field}) => (
              <FormItem className="space-y-2">
                <FormControl>
                  <JsonEditor
                    id={`${editorIdPrefix ?? 'config'}-schema-${environmentId}`}
                    height={mode === 'new' ? 300 : 360}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    aria-label={`Config JSON Schema for ${environmentName}`}
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
