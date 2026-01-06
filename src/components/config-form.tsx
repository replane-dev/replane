'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {EditorList} from '@/components/config-member-list';
import {ConfigMetadataHeader} from '@/components/config-metadata-header';
import {ConfigVariantFields} from '@/components/config-variant-fields';
import {SchemaDiffWarning} from '@/components/schema-diff-warning';
import {useSettings} from '@/components/settings-context';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {Help} from '@/components/ui/help';
import {Input} from '@/components/ui/input';
import {Separator} from '@/components/ui/separator';
import {Textarea} from '@/components/ui/textarea';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import type {Override} from '@/engine/core/override-evaluator';
import {
  getProtectedEnvironmentsAffectedByBaseConfig,
  isProposalRequired,
} from '@/engine/core/proposal-requirement';
import {ConfigOverrides} from '@/engine/core/stores/config-store';
import {
  formatJsonc,
  isValidJsonSchema,
  parseJsonc,
  validateAgainstJsonSchema,
} from '@/engine/core/utils';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {useSchemaDiffCheck} from '@/hooks/use-schema-diff-check';
import {zodResolver} from '@hookform/resolvers/zod';
import {Layers, ShieldCheck} from 'lucide-react';
import * as React from 'react';
import {useForm, useWatch, type FieldErrors} from 'react-hook-form';
import {toast} from 'sonner';
import {z} from 'zod';

type Mode = 'new' | 'edit' | 'view';

export interface Environment {
  id: string;
  name: string;
  requireProposals: boolean;
}

export interface ConfigVariantData {
  configVariantId?: string; // undefined for new configs
  environmentId: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  useBaseSchema?: boolean; // Whether to inherit schema from default variant
}

export interface ConfigFormSubmitData {
  name: string;
  defaultVariant: {
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
  };
  environmentVariants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useBaseSchema: boolean;
  }>;
  description: string;
  maintainerEmails: string[];
  editorEmails: string[];
}

export interface ConfigFormProps {
  mode: Mode;
  role: 'viewer' | 'maintainer' | 'editor';
  currentName?: string; // used in edit mode (read-only display)
  environments: Environment[]; // Available environments
  requireProposals: boolean; // Whether the project requires proposals
  defaultVariant?: {
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
  };
  environmentVariants: ConfigVariantData[]; // Environment-specific variants (can be empty or partial)
  defaultDescription?: string;
  defaultMaintainerEmails?: string[];
  defaultEditorEmails?: string[];
  submitting?: boolean;
  editorIdPrefix?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  currentVersion?: number;
  currentPendingProposalsCount?: number;
  versionsLink?: string; // link to versions page
  onCancel?: () => void;
  onDelete?: () => Promise<void> | void;
  /** Called when creating a new config */
  onCreate?: (data: ConfigFormSubmitData) => Promise<void> | void;
  /** Called when saving changes directly */
  onSave?: (data: ConfigFormSubmitData) => Promise<void> | void;
  /** Called when proposing changes */
  onPropose?: (data: ConfigFormSubmitData) => Promise<void> | void;
  onValuesChange?: (values: {value: string; overrides: Override[]}) => void;
  onTestOverrides?: () => void;
  projectUsers: Array<{email: string; role: 'admin' | 'maintainer'}>;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function ConfigForm(props: ConfigFormProps) {
  const {
    mode,
    role: rawRole,
    currentName,
    currentPendingProposalsCount,
    environments,
    requireProposals,
    defaultVariant,
    environmentVariants,
    defaultDescription = '',
    defaultMaintainerEmails = [],
    defaultEditorEmails = [],
    submitting,
    editorIdPrefix,
    createdAt,
    updatedAt,
    currentVersion,
    versionsLink,
    onCancel,
    onDelete,
    onCreate,
    onSave,
    onPropose,
    onValuesChange,
    onTestOverrides,
    onDirtyChange,
  } = props;

  const defaultName = currentName ?? '';

  const projectId = useProjectId();
  const {showSettings} = useSettings();

  // View mode = read-only
  const isViewMode = mode === 'view';

  // Normalize role
  const role: 'viewer' | 'maintainer' | 'editor' = rawRole === 'editor' ? 'editor' : rawRole;

  // Permissions - all disabled in view mode
  const canEditDescription = isViewMode ? false : mode === 'new' ? true : role === 'maintainer';
  const canEditValue = isViewMode
    ? false
    : mode === 'new'
      ? true
      : role === 'maintainer' || role === 'editor';
  const canEditSchema = isViewMode ? false : mode === 'new' ? true : role === 'maintainer';
  const canEditOverrides = isViewMode
    ? false
    : mode === 'new'
      ? true
      : role === 'maintainer' || role === 'editor';
  const canEditMembers = isViewMode ? false : mode === 'new' ? true : role === 'maintainer';
  const canSubmit = isViewMode ? false : mode === 'new' ? true : role !== 'viewer';
  const showMembers = true;

  // Track which action button was clicked
  const submitActionRef = React.useRef<'save' | 'propose' | null>(null);

  // Track if we've successfully submitted to prevent useEffect from re-dirtying
  const hasSubmittedRef = React.useRef(false);

  // Create variant-specific schema
  const variantSchema = z.object({
    environmentId: z.string(),
    enabled: z.boolean().default(false),
    value: z
      .string()
      .min(1, 'Please enter a configuration value')
      .refine(val => {
        try {
          parseJsonc(val);
          return true;
        } catch {
          return false;
        }
      }, 'Invalid JSON — check for missing quotes, brackets, or commas'),
    useBaseSchema: z.boolean(), // Inherit schema from default variant
    schemaEnabled: z.boolean().default(false),
    schema: z
      .string()
      .optional()
      .transform(s => (s ?? '').trim())
      .superRefine((val, ctx) => {
        const parent = (ctx as any).parent;
        const useBaseSchema = parent?.useBaseSchema ?? false;
        const enabled = parent?.schemaEnabled ?? false;
        // Skip validation if using default schema
        if (useBaseSchema || !enabled) return;
        if (!val) {
          ctx.addIssue({
            code: 'custom',
            message: 'Please provide a JSON Schema or disable schema validation',
          });
          return;
        }
        try {
          parseJsonc(val);
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid JSON Schema — check for missing quotes, brackets, or commas',
          });
        }
      }),
    overrides: ConfigOverrides(),
  });

  const baseSchema = {
    description: z.string().optional(),
    // Default variant
    defaultVariant: z.object({
      value: z
        .string()
        .min(1, 'Please enter a base configuration value')
        .refine(val => {
          try {
            parseJsonc(val);
            return true;
          } catch {
            return false;
          }
        }, 'Invalid JSON — check for missing quotes, brackets, or commas'),
      schemaEnabled: z.boolean().default(false),
      schema: z
        .string()
        .optional()
        .transform(s => (s ?? '').trim())
        .superRefine((val, ctx) => {
          const enabled = (ctx as any).parent?.schemaEnabled ?? false;
          if (!enabled) return;
          if (!val) {
            ctx.addIssue({
              code: 'custom',
              message: 'Please provide a JSON Schema or disable schema validation',
            });
            return;
          }
          try {
            parseJsonc(val);
          } catch {
            ctx.addIssue({
              code: 'custom',
              message: 'Invalid JSON Schema — check for missing quotes, brackets, or commas',
            });
          }
        }),
      overrides: ConfigOverrides(),
    }),
    // Environment variants
    environmentVariants: z.array(variantSchema),
    editors: z
      .array(z.string())
      .default([])
      .superRefine((editors, ctx) => {
        // Validate email format
        for (let i = 0; i < editors.length; i++) {
          const email = editors[i];
          if (!email) continue;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            ctx.addIssue({
              code: 'custom',
              message: 'Please enter a valid email address',
              path: [i],
            });
          }
        }

        // Check for duplicates
        const emailSet = new Set<string>();
        for (let i = 0; i < editors.length; i++) {
          const email = editors[i].trim().toLowerCase();
          if (!email) continue;
          if (emailSet.has(email)) {
            ctx.addIssue({
              code: 'custom',
              message: 'This email has already been added',
              path: [i],
            });
          }
          emailSet.add(email);
        }
      }),
  } as const;

  const fullSchemaBase =
    mode === 'new'
      ? z.object({
          name: z
            .string()
            .regex(
              /^[A-Za-z0-9_-]{1,100}$/i,
              'Name must be 1–100 characters using only letters, numbers, underscores, or hyphens',
            ),
          ...baseSchema,
        })
      : z.object({...baseSchema});

  const fullSchema = fullSchemaBase;

  type FormValues = z.input<typeof fullSchema> & {name?: string};

  const form = useForm<FormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      ...(mode === 'new' ? {name: defaultName} : {}),
      description: defaultDescription,
      defaultVariant: {
        value: defaultVariant?.value ? formatJsonc(defaultVariant.value) : '{}',
        schemaEnabled: defaultVariant?.schema !== null && defaultVariant?.schema !== undefined,
        schema: defaultVariant?.schema ? formatJsonc(defaultVariant.schema) : '',
        overrides: defaultVariant?.overrides ?? [],
      },
      environmentVariants: environments.map(env => {
        const existingVariant = environmentVariants.find(v => v.environmentId === env.id);
        return {
          environmentId: env.id,
          enabled: !!existingVariant,
          value: existingVariant ? formatJsonc(existingVariant.value) : '{}',
          useBaseSchema: existingVariant?.useBaseSchema ?? true,
          schemaEnabled: existingVariant?.schema !== null && existingVariant?.schema !== undefined,
          schema: existingVariant?.schema ? formatJsonc(existingVariant.schema) : '',
          overrides: existingVariant?.overrides ?? [],
        };
      }),
      editors: defaultEditorEmails,
    },
    mode: 'onTouched',
  });

  async function handleSubmit(values: FormValues) {
    // Process default variant
    const defaultValue = parseJsonc(values.defaultVariant.value);
    let defaultParsedSchema: unknown | undefined = undefined;

    if (values.defaultVariant.schemaEnabled) {
      try {
        defaultParsedSchema = parseJsonc(values.defaultVariant.schema || '');
      } catch {
        form.setError('defaultVariant.schema', {
          message: 'Invalid JSON Schema — check for missing quotes, brackets, or commas',
        });
        return;
      }

      // Validate that the schema itself is a valid JSON Schema
      if (!isValidJsonSchema(defaultParsedSchema)) {
        form.setError('defaultVariant.schema', {
          message: 'This is not a valid JSON Schema — please check the structure',
        });
        return;
      }

      // Validate the value against the schema
      const validationResult = validateAgainstJsonSchema(defaultValue, defaultParsedSchema as any);
      if (!validationResult.ok) {
        const errors = validationResult.errors.join('; ');
        form.setError('defaultVariant.value', {
          message: `Value doesn't match the schema: ${errors || 'please check the value'}`,
        });
        return;
      }
    }

    // Process environment variants (only enabled ones)
    const processedEnvVariants: Array<{
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
      useBaseSchema: boolean;
    }> = [];
    for (let i = 0; i < values.environmentVariants.length; i++) {
      const variant = values.environmentVariants[i];
      if (!variant.enabled) continue; // Skip disabled environments

      const payloadValue = parseJsonc(variant.value);
      let parsedSchema: unknown | undefined;

      // Determine which schema to use for validation
      if (variant.useBaseSchema) {
        // Use default schema for validation if available
        if (defaultParsedSchema !== undefined && defaultParsedSchema !== null) {
          const validationResult = validateAgainstJsonSchema(
            payloadValue,
            defaultParsedSchema as any,
          );
          if (!validationResult.ok) {
            const errors = validationResult.errors.join('; ');
            form.setError(`environmentVariants.${i}.value`, {
              message: `Value doesn't match the base schema: ${errors || 'please check the value'}`,
            });
            return;
          }
        }

        parsedSchema = undefined;
      } else if (variant.schemaEnabled) {
        try {
          parsedSchema = parseJsonc(variant.schema || '');
        } catch {
          form.setError(`environmentVariants.${i}.schema`, {
            message: 'Invalid JSON Schema — check for missing quotes, brackets, or commas',
          });
          return;
        }

        // Validate that the schema itself is a valid JSON Schema
        if (!isValidJsonSchema(parsedSchema)) {
          form.setError(`environmentVariants.${i}.schema`, {
            message: 'This is not a valid JSON Schema — please check the structure',
          });
          return;
        }

        // Validate the value against the schema
        const validationResult = validateAgainstJsonSchema(payloadValue, parsedSchema as any);
        if (!validationResult.ok) {
          const errors = validationResult.errors.join('; ');
          form.setError(`environmentVariants.${i}.value`, {
            message: `Value doesn't match the schema: ${errors || 'please check the value'}`,
          });
          return;
        }
      }

      processedEnvVariants.push({
        environmentId: variant.environmentId,
        value: variant.value as ConfigValue,
        schema: variant.schema as ConfigSchema | null,
        overrides: variant.overrides as Override[],
        useBaseSchema: variant.useBaseSchema,
      });
    }

    // Transform editors array to editorEmails (no maintainers from config form)
    const editorEmails = (values.editors ?? [])
      .filter(e => e.trim())
      .map(e => e.trim().toLowerCase());

    const submitData: ConfigFormSubmitData = {
      name: values.name ?? defaultName,
      defaultVariant: {
        value: values.defaultVariant.value as ConfigValue,
        schema: values.defaultVariant.schemaEnabled
          ? (values.defaultVariant.schema as ConfigSchema | null)
          : null,
        overrides: values.defaultVariant.overrides as Override[],
      },
      environmentVariants: processedEnvVariants,
      description: values.description ?? '',
      maintainerEmails: [],
      editorEmails,
    };

    // Mark as submitted to prevent useEffect from re-dirtying during async operations
    hasSubmittedRef.current = true;

    // Reset the form's dirty state before calling callbacks
    // (callbacks may close the sheet, so we need to clear dirty state first)
    form.reset(values, {keepValues: true});
    onDirtyChange?.(false);

    // Call the appropriate callback based on action
    const action = submitActionRef.current;
    if (mode === 'new' && onCreate) {
      await onCreate(submitData);
    } else if (action === 'propose' && onPropose) {
      await onPropose(submitData);
    } else if (onSave) {
      await onSave(submitData);
    }

    // Reset action ref after submission
    submitActionRef.current = null;
  }

  function handleInvalidSubmit(errors: FieldErrors<FormValues>) {
    // Count total errors
    let errorCount = 0;
    const errorMessages: string[] = [];

    // Check for name error
    if (errors.name) {
      errorCount++;
      errorMessages.push('Name');
    }

    // Check for default variant errors
    if (errors.defaultVariant) {
      if ((errors.defaultVariant as any).value) {
        errorCount++;
        errorMessages.push('Base value');
      }
      if ((errors.defaultVariant as any).schema) {
        errorCount++;
        errorMessages.push('Base schema');
      }
    }

    // Check for environment variant errors
    if (errors.environmentVariants && Array.isArray(errors.environmentVariants)) {
      errors.environmentVariants.forEach((variantError: any, index: number) => {
        if (variantError?.value) {
          errorCount++;
          const envName = environments[index]?.name || `Environment ${index + 1}`;
          errorMessages.push(`${envName} value`);
        }
        if (variantError?.schema) {
          errorCount++;
          const envName = environments[index]?.name || `Environment ${index + 1}`;
          errorMessages.push(`${envName} schema`);
        }
      });
    }

    // Check for editor errors
    if (errors.editors) {
      errorCount++;
      errorMessages.push('Editors');
    }

    toast.error('Unable to save — please fix the highlighted errors', {
      description:
        errorMessages.length > 0
          ? `Check: ${errorMessages.slice(0, 3).join(', ')}${errorMessages.length > 3 ? ` (+${errorMessages.length - 3} more)` : ''}`
          : undefined,
    });
  }

  // Track all form values to detect changes
  const watchedName = useWatch({control: form.control, name: 'name'});
  const watchedDescription = useWatch({control: form.control, name: 'description'});
  const watchedDefaultVariant = useWatch({control: form.control, name: 'defaultVariant'});
  const watchedEnvVariants = useWatch({control: form.control, name: 'environmentVariants'});
  const watchedEditors = useWatch({control: form.control, name: 'editors'});

  // Notify parent of value changes for live testing
  React.useEffect(() => {
    if (onValuesChange && watchedDefaultVariant) {
      onValuesChange({
        value: watchedDefaultVariant.value ?? '',
        overrides: (watchedDefaultVariant.overrides ?? []) as Override[],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedDefaultVariant?.value, watchedDefaultVariant?.overrides]);

  // Notify parent when form dirty state changes
  React.useEffect(() => {
    // Skip if we've already submitted successfully - prevents race condition
    // where useEffect fires with stale isDirty value during async submission
    if (hasSubmittedRef.current) {
      return;
    }
    if (onDirtyChange) {
      onDirtyChange(form.formState.isDirty);
    }
  }, [onDirtyChange, form.formState.isDirty]);

  // Reactive schema for Value editor
  const enabled = watchedDefaultVariant?.schemaEnabled ?? false;
  const schemaText = (watchedDefaultVariant?.schema ?? '').toString().trim();
  let liveSchema: any | undefined = undefined;
  if (enabled && schemaText) {
    try {
      const parsed = JSON.parse(schemaText);
      if (isValidJsonSchema(parsed)) {
        liveSchema = parsed;
      }
    } catch {}
  }

  // Check if there are any changes
  const hasChanges = React.useMemo(() => {
    if (mode === 'new') {
      // For new configs, check if name and default value are filled
      const name = (watchedName ?? '').trim();
      const hasValue = (watchedDefaultVariant?.value ?? '').trim().length > 0;
      return name.length > 0 && hasValue;
    }

    // For edit/proposal modes, compare with defaults
    const currentDescription = (watchedDescription ?? '').trim();
    const currentEditors = (watchedEditors ?? [])
      .filter(e => e.trim())
      .map(e => e.trim().toLowerCase())
      .sort();

    const defaultEditorsNormalized = defaultEditorEmails.map(e => e.toLowerCase()).sort();

    // Compare editors
    const editorsChanged =
      currentEditors.length !== defaultEditorsNormalized.length ||
      currentEditors.some((e, i) => e !== defaultEditorsNormalized[i]);

    // Compare description
    const descriptionChanged = currentDescription !== (defaultDescription ?? '').trim();

    // Check for changes in default variant or environment variants
    return descriptionChanged || editorsChanged || true; // TODO: implement proper change detection
  }, [
    mode,
    watchedName,
    watchedDescription,
    watchedDefaultVariant,
    watchedEditors,
    defaultDescription,
    defaultEditorEmails,
  ]);

  // Check if schemas differ across variants
  const allVariantsForDiffCheck = [
    watchedDefaultVariant,
    ...(watchedEnvVariants?.filter((v: any) => v.enabled) ?? []),
  ];
  const hasDifferentSchemas = useSchemaDiffCheck(allVariantsForDiffCheck);

  // Determine if a proposal is required for the current changes
  const proposalRequiredResult = React.useMemo(() => {
    if (mode === 'new' || !requireProposals) {
      return {required: false};
    }

    // Parse current form values to compare with defaults
    const proposalCurrentEditors = (watchedEditors ?? [])
      .filter(e => e.trim())
      .map(e => e.trim().toLowerCase());

    // Parse default variant values
    let proposedDefaultValue: unknown = null;
    let proposedDefaultSchema: unknown = null;
    let proposedDefaultOverrides: Override[] = [];
    try {
      proposedDefaultValue = watchedDefaultVariant?.value
        ? JSON.parse(watchedDefaultVariant.value)
        : null;
    } catch {}
    try {
      proposedDefaultSchema =
        watchedDefaultVariant?.schemaEnabled && watchedDefaultVariant?.schema
          ? JSON.parse(watchedDefaultVariant.schema)
          : null;
    } catch {}
    proposedDefaultOverrides = (watchedDefaultVariant?.overrides ?? []) as Override[];

    // Parse environment variants
    const proposedEnvVariants = (watchedEnvVariants ?? [])
      .filter((v: any) => v.enabled)
      .map((v: any) => {
        let value: unknown = null;
        let schema: unknown = null;
        try {
          value = v.value ? JSON.parse(v.value) : null;
        } catch {}
        try {
          schema = v.schemaEnabled && v.schema ? JSON.parse(v.schema) : null;
        } catch {}
        return {
          environmentId: v.environmentId,
          value,
          schema,
          overrides: (v.overrides ?? []) as Override[],
        };
      });

    return isProposalRequired({
      projectRequiresProposals: requireProposals,
      environments: environments.map(e => ({
        id: e.id,
        requireProposals: e.requireProposals,
      })),
      current: {
        defaultVariant: {
          value: defaultVariant?.value ?? null,
          schema: defaultVariant?.schema ?? null,
          overrides: defaultVariant?.overrides ?? [],
        },
        environmentVariants: environmentVariants.map(v => ({
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema,
          overrides: v.overrides,
        })),
        editorEmails: defaultEditorEmails,
        maintainerEmails: defaultMaintainerEmails,
      },
      proposed: {
        defaultVariant: {
          value: proposedDefaultValue,
          schema: proposedDefaultSchema,
          overrides: proposedDefaultOverrides,
        },
        environmentVariants: proposedEnvVariants,
        editorEmails: proposalCurrentEditors,
        maintainerEmails: [],
      },
    });
  }, [
    mode,
    requireProposals,
    environments,
    defaultVariant,
    environmentVariants,
    defaultEditorEmails,
    defaultMaintainerEmails,
    watchedDefaultVariant,
    watchedEnvVariants,
    watchedEditors,
  ]);

  // Check if base configuration changes affect any protected environments
  const baseConfigAffectsProtectedEnvs = React.useMemo(() => {
    if (!requireProposals) {
      return false;
    }

    // Get environment IDs that have overrides (enabled variants)
    const enabledEnvIds = (watchedEnvVariants ?? [])
      .filter(v => v.enabled)
      .map(v => v.environmentId);

    const affectedEnvIds = getProtectedEnvironmentsAffectedByBaseConfig({
      environments: environments.map(e => ({
        id: e.id,
        requireProposals: e.requireProposals,
      })),
      environmentVariants: enabledEnvIds.map((id: string) => ({environmentId: id})),
    });

    return affectedEnvIds.length > 0;
  }, [requireProposals, environments, watchedEnvVariants]);

  return (
    <Form {...form}>
      <form
        id="config-form"
        onSubmit={form.handleSubmit(handleSubmit, handleInvalidSubmit)}
        className="space-y-6"
      >
        {mode === 'new' && (
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <div className="flex items-center gap-1.5">
                  <FormLabel>Name</FormLabel>
                  <Help>
                    <p>
                      A unique identifier for this config. Use 1-100 letters, numbers, underscores,
                      or hyphens.
                    </p>
                  </Help>
                </div>
                <FormControl>
                  <Input
                    placeholder="e.g. some-config-name"
                    autoCapitalize="none"
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {mode === 'edit' && (
          <ConfigMetadataHeader
            name={defaultName}
            version={currentVersion}
            createdAt={createdAt}
            updatedAt={updatedAt}
            pendingProposalsCount={currentPendingProposalsCount}
            versionsLink={versionsLink}
            projectId={projectId}
          />
        )}

        <FormField
          control={form.control}
          name="description"
          render={({field}) => (
            <FormItem>
              <div className="flex items-center gap-1.5">
                <FormLabel>Description</FormLabel>
                <Help>
                  <p>
                    Optional human-readable description explaining what this config is used for.
                  </p>
                </Help>
              </div>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Describe what this config controls..."
                  readOnly={!canEditDescription}
                  {...field}
                />
              </FormControl>
              {!canEditDescription && (
                <FormDescription>
                  You don&apos;t have permission to edit the description.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Warning for different schemas across variants */}
        {hasDifferentSchemas && <SchemaDiffWarning />}

        {/* Environment Overrides Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">Environment Overrides</h3>
              <p className="text-sm text-muted-foreground">
                Customize values for specific environments
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isViewMode && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => showSettings('project-environments')}
                  className="text-xs"
                >
                  Manage environments
                </Button>
              )}
              <Help className="max-w-sm">
                <p>
                  Enable an environment to customize its configuration. Disabled environments will
                  use the base configuration below.
                </p>
              </Help>
            </div>
          </div>

          <div className="space-y-3">
            {environments.map((env, envIndex) => {
              const envVariant = watchedEnvVariants?.[envIndex];
              const envVariantDefaultValue = (() => {
                if (!envVariant?.value) return null;
                try {
                  return JSON.parse(envVariant.value);
                } catch {
                  return null;
                }
              })();

              const envEnabled = envVariant?.schemaEnabled ?? false;
              const envSchemaText = (envVariant?.schema ?? '').toString().trim();
              let envLiveSchema: any | undefined = undefined;
              if (envEnabled && envSchemaText) {
                try {
                  const parsed = JSON.parse(envSchemaText);
                  if (isValidJsonSchema(parsed)) {
                    envLiveSchema = parsed;
                  }
                } catch {}
              }

              const isCustomized = envVariant?.enabled;

              return (
                <div
                  key={env.id}
                  className={`rounded-lg border transition-all ${
                    isCustomized
                      ? 'border-primary/30 '
                      : 'border-border/50 bg-muted/30 hover:border-border'
                  }`}
                >
                  <FormField
                    control={form.control}
                    name={`environmentVariants.${envIndex}.enabled`}
                    render={({field}) => (
                      <FormItem className="flex items-center justify-between px-4 py-2 space-y-0">
                        <div className="flex items-center gap-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEditValue}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          </FormControl>
                          <FormLabel className="font-semibold cursor-pointer text-base flex items-center gap-2">
                            {env.name}
                            <span className="text-xs text-muted-foreground font-normal">
                              · {isCustomized ? 'Custom' : 'Using base configuration'}
                            </span>
                          </FormLabel>
                        </div>
                        <div className="flex items-center gap-2">
                          {requireProposals && env.requireProposals && (
                            <ChangesRequireProposalsBadge
                              tooltip={`This environment requires approval for changes. Create a proposal to modify ${env.name}.`}
                              onClick={() => showSettings('project-general')}
                            />
                          )}
                        </div>
                      </FormItem>
                    )}
                  />

                  {envVariant?.enabled && (
                    <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-6">
                      <ConfigVariantFields
                        control={form.control}
                        setValue={form.setValue}
                        getValues={form.getValues}
                        variantIndex={envIndex}
                        fieldPrefix="environmentVariants"
                        environmentId={env.id}
                        environmentName={env.name}
                        editorIdPrefix={editorIdPrefix}
                        mode={mode}
                        projectId={projectId}
                        canEditValue={canEditValue}
                        canEditSchema={canEditSchema}
                        canEditOverrides={canEditOverrides}
                        watchedVariant={envVariant}
                        overrideBuilderDefaultValue={envVariantDefaultValue}
                        liveSchema={envLiveSchema}
                        isEnvironmentVariant={true}
                        hasDefaultVariant={true}
                        defaultSchema={liveSchema}
                        configName={watchedName || currentName}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Base Configuration Section */}
        <div className="rounded-xl border p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Base Configuration</h3>
              <p className="text-sm text-muted-foreground">The foundation for all environments</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {baseConfigAffectsProtectedEnvs && (
                <ChangesRequireProposalsBadge
                  tooltip="Base configuration changes affect environments that require review. Create a proposal to modify the base configuration."
                  onClick={() => showSettings('project-general')}
                />
              )}
              <Help className="max-w-sm">
                <p>
                  Define the base value, schema, and overrides here. Environments without custom
                  settings above will use these values.
                </p>
              </Help>
            </div>
          </div>

          <ConfigVariantFields
            control={form.control}
            setValue={form.setValue}
            getValues={form.getValues}
            variantIndex={-1}
            fieldPrefix="defaultVariant"
            environmentId="default"
            environmentName="base"
            editorIdPrefix={editorIdPrefix}
            mode={mode}
            projectId={projectId}
            canEditValue={canEditValue}
            canEditSchema={canEditSchema}
            canEditOverrides={canEditOverrides}
            watchedVariant={watchedDefaultVariant}
            overrideBuilderDefaultValue={watchedDefaultVariant.value}
            liveSchema={liveSchema}
            configName={watchedName || currentName}
          />
        </div>

        <Separator />

        {showMembers && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Editors</h3>
                <p className="text-sm text-muted-foreground">
                  Users who can edit this config&apos;s value and overrides, but can&apos;t edit the
                  schema.
                </p>
              </div>
              <Help>
                <p>
                  Add users who need to change config values without full maintainer access. They
                  can edit value and overrides, but not the schema or other editors.
                </p>
              </Help>
            </div>

            <FormField
              control={form.control}
              name="editors"
              render={({field}) => (
                <FormItem>
                  <FormControl>
                    <EditorList
                      editors={field.value ?? []}
                      onChange={field.onChange}
                      disabled={!canEditMembers}
                      errors={form.formState.errors.editors as any}
                    />
                  </FormControl>
                  {mode === 'edit' && !canEditMembers && (
                    <FormDescription>Only maintainers can modify editors.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Spacer to prevent content from being hidden behind sticky buttons */}
        {!isViewMode && <div className="h-20" />}
      </form>

      {/* Sticky button panel - hidden in view mode */}
      {!isViewMode && (
        <div className="sticky bottom-0 z-5 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 py-3">
          <div className="flex gap-2">
            {mode === 'new' && onCreate && (
              <Button
                type="submit"
                form="config-form"
                disabled={!!submitting || !canSubmit}
                onClick={() => {
                  submitActionRef.current = 'save';
                }}
              >
                {submitting ? 'Creating…' : 'Create config'}
              </Button>
            )}
            {mode === 'edit' && !proposalRequiredResult.required && onSave && (
              <Button
                type="submit"
                form="config-form"
                disabled={!!submitting || !canSubmit}
                onClick={() => {
                  submitActionRef.current = 'save';
                }}
              >
                {submitting ? 'Saving…' : 'Save changes'}
              </Button>
            )}
            {mode === 'edit' && proposalRequiredResult.required && onPropose && (
              <Button
                type="submit"
                form="config-form"
                disabled={!!submitting || !canSubmit}
                onClick={() => {
                  submitActionRef.current = 'propose';
                }}
              >
                {submitting ? 'Proposing…' : 'Propose changes'}
              </Button>
            )}
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {onTestOverrides &&
              watchedDefaultVariant?.overrides &&
              (watchedDefaultVariant.overrides as any[])?.length > 0 && (
                <Button type="button" variant="outline" onClick={() => onTestOverrides()}>
                  Evaluate
                </Button>
              )}
            {onDelete && role === 'maintainer' && (
              <div className="ml-auto">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={e => {
                    e.preventDefault();
                    if (
                      !confirm(
                        'Are you sure you want to delete this config? This cannot be undone.',
                      )
                    )
                      return;
                    onDelete();
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Form>
  );
}

function ChangesRequireProposalsBadge({tooltip, onClick}: {tooltip: string; onClick?: () => void}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={`flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/50 px-2 py-1 rounded-full ${
            onClick
              ? 'cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-950/70'
              : 'cursor-default'
          }`}
        >
          <ShieldCheck className="h-3 w-3" />
          Changes require review
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
