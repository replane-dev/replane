'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {ConfigMemberList} from '@/components/config-member-list';
import {ConfigMetadataHeader} from '@/components/config-metadata-header';
import {ConfigVariantFields} from '@/components/config-variant-fields';
import {SchemaDiffWarning} from '@/components/schema-diff-warning';
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
import {Input} from '@/components/ui/input';
import {Separator} from '@/components/ui/separator';
import {Textarea} from '@/components/ui/textarea';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import type {Override} from '@/engine/core/override-evaluator';
import {ConfigOverrides} from '@/engine/core/stores/config-store';
import {isValidJsonSchema, validateAgainstJsonSchema} from '@/engine/core/utils';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {useSchemaDiffCheck} from '@/hooks/use-schema-diff-check';
import {zodResolver} from '@hookform/resolvers/zod';
import {CircleHelp} from 'lucide-react';
import * as React from 'react';
import {useForm, useWatch} from 'react-hook-form';
import {z} from 'zod';

type Mode = 'new' | 'edit' | 'proposal';

export interface Environment {
  id: string;
  name: string;
}

export interface ConfigVariantData {
  configVariantId?: string; // undefined for new configs
  environmentId: string;
  value: unknown;
  schema: unknown | null;
  overrides: Override[];
  useDefaultSchema?: boolean; // Whether to inherit schema from default variant
}

export interface ConfigFormProps {
  mode: Mode;
  role: 'viewer' | 'maintainer' | 'editor';
  currentName?: string; // used in edit mode (read-only display)
  environments: Environment[]; // Available environments
  defaultVariant?: {
    value: unknown;
    schema: unknown | null;
    overrides: Override[];
  };
  environmentVariants: ConfigVariantData[]; // Environment-specific variants (can be empty or partial)
  defaultDescription?: string;
  defaultMaintainerEmails?: string[];
  defaultEditorEmails?: string[];
  proposing?: boolean;
  saving?: boolean;
  editorIdPrefix?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  currentVersion?: number;
  currentPendingProposalsCount?: number;
  versionsLink?: string; // link to versions page
  onCancel?: () => void;
  onDelete?: () => Promise<void> | void;
  onSubmit: (data: {
    action: 'save' | 'propose';
    name: string;
    defaultVariant?: {
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
    };
    environmentVariants: Array<{
      configVariantId?: string;
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
      useDefaultSchema: boolean;
    }>;
    description: string;
    maintainerEmails: string[];
    editorEmails: string[];
  }) => Promise<void> | void;
  onValuesChange?: (values: {value: string; overrides: Override[]}) => void;
  onTestOverrides?: () => void;
}

export function ConfigForm(props: ConfigFormProps) {
  const {
    mode,
    role: rawRole,
    currentName,
    currentPendingProposalsCount,
    environments,
    defaultVariant,
    environmentVariants,
    defaultDescription = '',
    defaultMaintainerEmails = [],
    defaultEditorEmails = [],
    proposing,
    saving,
    editorIdPrefix,
    createdAt,
    updatedAt,
    currentVersion,
    versionsLink,
    onCancel,
    onDelete,
    onSubmit,
    onValuesChange,
    onTestOverrides,
  } = props;

  const defaultName = currentName ?? '';

  const projectId = useProjectId();

  // Normalize role
  const role: 'viewer' | 'maintainer' | 'editor' = rawRole === 'editor' ? 'editor' : rawRole;

  // Permissions
  const isProposal = mode === 'proposal';
  const canEditDescription = mode === 'new' ? true : isProposal ? true : role === 'maintainer';
  const canEditValue = mode === 'new' ? true : isProposal ? true : role !== 'viewer';
  const canEditSchema = mode === 'new' ? true : isProposal ? true : role === 'maintainer';
  const canEditOverrides = mode === 'new' ? true : isProposal ? true : role === 'maintainer';
  const canEditMembers = mode === 'new' ? true : isProposal ? true : role === 'maintainer';
  const canSubmit = mode === 'new' ? true : isProposal ? true : role !== 'viewer';
  const showMembers = true;

  // Track which action button was clicked
  const submitActionRef = React.useRef<'save' | 'propose' | null>(null);

  // Create variant-specific schema
  const variantSchema = z.object({
    environmentId: z.string(),
    enabled: z.boolean().default(false),
    value: z
      .string()
      .min(1, 'Value is required')
      .refine(val => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      }, 'Must be valid JSON'),
    useDefaultSchema: z.boolean(), // Inherit schema from default variant
    schemaEnabled: z.boolean().default(false),
    schema: z
      .string()
      .optional()
      .transform(s => (s ?? '').trim())
      .superRefine((val, ctx) => {
        const parent = (ctx as any).parent;
        const useDefaultSchema = parent?.useDefaultSchema ?? false;
        const enabled = parent?.schemaEnabled ?? false;
        // Skip validation if using default schema
        if (useDefaultSchema || !enabled) return;
        if (!val) {
          ctx.addIssue({code: 'custom', message: 'Schema is required when enabled'});
          return;
        }
        try {
          JSON.parse(val);
        } catch {
          ctx.addIssue({code: 'custom', message: 'Schema must be valid JSON'});
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
        .min(1, 'Default value is required')
        .refine(val => {
          try {
            JSON.parse(val);
            return true;
          } catch {
            return false;
          }
        }, 'Must be valid JSON'),
      schemaEnabled: z.boolean().default(false),
      schema: z
        .string()
        .optional()
        .transform(s => (s ?? '').trim())
        .superRefine((val, ctx) => {
          const enabled = (ctx as any).parent?.schemaEnabled ?? false;
          if (!enabled) return;
          if (!val) {
            ctx.addIssue({code: 'custom', message: 'Schema is required when enabled'});
            return;
          }
          try {
            JSON.parse(val);
          } catch {
            ctx.addIssue({code: 'custom', message: 'Schema must be valid JSON'});
          }
        }),
      overrides: ConfigOverrides(),
    }),
    // Environment variants
    environmentVariants: z.array(variantSchema),
    members: z
      .array(
        z.object({
          email: z.string().min(1, 'Email is required'),
          role: z.enum(['maintainer', 'editor']),
        }),
      )
      .default([])
      .superRefine((members, ctx) => {
        // Validate email format
        for (let i = 0; i < members.length; i++) {
          const member = members[i];
          if (!member.email) continue;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim())) {
            ctx.addIssue({
              code: 'custom',
              message: `Invalid email: ${member.email}`,
              path: [i, 'email'],
            });
          }
        }

        // Check for duplicates
        const emailSet = new Set<string>();
        for (let i = 0; i < members.length; i++) {
          const email = members[i].email.trim().toLowerCase();
          if (!email) continue;
          if (emailSet.has(email)) {
            ctx.addIssue({
              code: 'custom',
              message: `Duplicate email: ${email}`,
              path: [i, 'email'],
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
            .regex(/^[A-Za-z0-9_-]{1,100}$/i, 'Use 1-100 letters, numbers, underscores or hyphens'),
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
        value: defaultVariant ? JSON.stringify(defaultVariant.value, null, 2) : '{}',
        schemaEnabled: defaultVariant?.schema !== null && defaultVariant?.schema !== undefined,
        schema: defaultVariant?.schema ? JSON.stringify(defaultVariant.schema, null, 2) : '',
        overrides: defaultVariant?.overrides ?? [],
      },
      environmentVariants: environments.map(env => {
        const existingVariant = environmentVariants.find(v => v.environmentId === env.id);
        return {
          environmentId: env.id,
          enabled: !!existingVariant,
          value: existingVariant ? JSON.stringify(existingVariant.value, null, 2) : '{}',
          useDefaultSchema: existingVariant?.useDefaultSchema ?? false,
          schemaEnabled: existingVariant?.schema !== null && existingVariant?.schema !== undefined,
          schema: existingVariant?.schema ? JSON.stringify(existingVariant.schema, null, 2) : '',
          overrides: existingVariant?.overrides ?? [],
        };
      }),
      members: [
        ...defaultMaintainerEmails.map(email => ({email, role: 'maintainer' as const})),
        ...defaultEditorEmails.map(email => ({email, role: 'editor' as const})),
      ],
    },
    mode: 'onTouched',
  });

  async function handleSubmit(values: FormValues) {
    // Process default variant
    let processedDefaultVariant: any = undefined;
    const defaultValue = JSON.parse(values.defaultVariant.value);
    let defaultParsedSchema: any | null = null;

    if (values.defaultVariant.schemaEnabled) {
      try {
        defaultParsedSchema = JSON.parse(values.defaultVariant.schema || '');
      } catch {
        form.setError('defaultVariant.schema', {message: 'Schema must be valid JSON'});
        return;
      }

      // Validate that the schema itself is a valid JSON Schema
      if (!isValidJsonSchema(defaultParsedSchema)) {
        form.setError('defaultVariant.schema', {message: 'Invalid JSON Schema'});
        return;
      }

      // Validate the value against the schema
      const validationResult = validateAgainstJsonSchema(defaultValue, defaultParsedSchema);
      if (!validationResult.ok) {
        const errors = validationResult.errors.join('; ');
        form.setError('defaultVariant.value', {
          message: `Does not match schema: ${errors || 'Invalid value'}`,
        });
        return;
      }
    }

    processedDefaultVariant = {
      value: defaultValue,
      schema: values.defaultVariant.schemaEnabled ? defaultParsedSchema : null,
      overrides: values.defaultVariant.overrides as Override[],
    };

    // Process environment variants (only enabled ones)
    const processedEnvVariants: Array<{
      configVariantId?: string;
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
      useDefaultSchema: boolean;
    }> = [];
    for (let i = 0; i < values.environmentVariants.length; i++) {
      const variant = values.environmentVariants[i];
      if (!variant.enabled) continue; // Skip disabled environments

      const originalVariant = environmentVariants.find(
        v => v.environmentId === variant.environmentId,
      );

      const payloadValue = JSON.parse(variant.value);
      let parsedSchema: any | null = null;

      // Determine which schema to use for validation
      if (variant.useDefaultSchema) {
        // Use default schema for validation if available
        if (defaultParsedSchema) {
          const validationResult = validateAgainstJsonSchema(payloadValue, defaultParsedSchema);
          if (!validationResult.ok) {
            const errors = validationResult.errors.join('; ');
            form.setError(`environmentVariants.${i}.value`, {
              message: `Does not match default schema: ${errors || 'Invalid value'}`,
            });
            return;
          }
        }
        // Schema will be null - backend will use default schema via COALESCE
        parsedSchema = null;
      } else if (variant.schemaEnabled) {
        try {
          parsedSchema = JSON.parse(variant.schema || '');
        } catch {
          form.setError(`environmentVariants.${i}.schema`, {message: 'Schema must be valid JSON'});
          return;
        }

        // Validate that the schema itself is a valid JSON Schema
        if (!isValidJsonSchema(parsedSchema)) {
          form.setError(`environmentVariants.${i}.schema`, {message: 'Invalid JSON Schema'});
          return;
        }

        // Validate the value against the schema
        const validationResult = validateAgainstJsonSchema(payloadValue, parsedSchema);
        if (!validationResult.ok) {
          const errors = validationResult.errors.join('; ');
          form.setError(`environmentVariants.${i}.value`, {
            message: `Does not match schema: ${errors || 'Invalid value'}`,
          });
          return;
        }
      }

      processedEnvVariants.push({
        configVariantId: originalVariant?.configVariantId,
        environmentId: variant.environmentId,
        value: payloadValue,
        schema: parsedSchema,
        overrides: variant.overrides as Override[],
        useDefaultSchema: variant.useDefaultSchema,
      });
    }

    // Determine action: use tracked action, or default based on mode
    const action: 'save' | 'propose' =
      submitActionRef.current ?? (mode === 'proposal' ? 'propose' : 'save');

    // Transform member array back to maintainerEmails and editorEmails
    const members = (values.members ?? []).filter(m => m.email.trim());
    const maintainerEmails = members
      .filter(m => m.role === 'maintainer')
      .map(m => m.email.trim().toLowerCase());
    const editorEmails = members
      .filter(m => m.role === 'editor')
      .map(m => m.email.trim().toLowerCase());

    await onSubmit({
      action,
      name: values.name ?? defaultName,
      defaultVariant: processedDefaultVariant,
      environmentVariants: processedEnvVariants,
      description: values.description ?? '',
      maintainerEmails: maintainerEmails,
      editorEmails,
    });

    // Reset action ref after submission
    submitActionRef.current = null;
  }

  // Track all form values to detect changes
  const watchedName = useWatch({control: form.control, name: 'name'});
  const watchedDescription = useWatch({control: form.control, name: 'description'});
  const watchedDefaultVariant = useWatch({control: form.control, name: 'defaultVariant'});
  const watchedEnvVariants = useWatch({control: form.control, name: 'environmentVariants'});
  const watchedMembers = useWatch({control: form.control, name: 'members'});

  const overrideBuilderDefaultValue = React.useMemo(() => {
    if (!watchedDefaultVariant?.value) return null;
    try {
      return JSON.parse(watchedDefaultVariant.value);
    } catch {
      return null;
    }
  }, [watchedDefaultVariant?.value]);

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
    const currentMembers = (watchedMembers ?? []).filter(m => m.email.trim());

    // Normalize members for comparison
    const normalizeMembers = (members: typeof currentMembers) => {
      const normalized = members
        .filter(m => m.email.trim())
        .map(m => ({email: m.email.trim().toLowerCase(), role: m.role}))
        .sort((a, b) => {
          if (a.email !== b.email) return a.email.localeCompare(b.email);
          return a.role.localeCompare(b.role);
        });
      return normalized;
    };

    const defaultMembers = [
      ...defaultMaintainerEmails.map(email => ({
        email: email.toLowerCase(),
        role: 'maintainer' as const,
      })),
      ...defaultEditorEmails.map(email => ({
        email: email.toLowerCase(),
        role: 'editor' as const,
      })),
    ].sort((a, b) => {
      if (a.email !== b.email) return a.email.localeCompare(b.email);
      return a.role.localeCompare(b.role);
    });

    const normalizedCurrent = normalizeMembers(currentMembers);
    const normalizedDefault = normalizeMembers(defaultMembers);

    // Compare members
    const membersChanged =
      normalizedCurrent.length !== normalizedDefault.length ||
      normalizedCurrent.some(
        (m, i) => m.email !== normalizedDefault[i]?.email || m.role !== normalizedDefault[i]?.role,
      );

    // Compare description
    const descriptionChanged = currentDescription !== (defaultDescription ?? '').trim();

    // Check for changes in default variant or environment variants
    return descriptionChanged || membersChanged || true; // TODO: implement proper change detection
  }, [
    mode,
    watchedName,
    watchedDescription,
    watchedDefaultVariant,
    watchedEnvVariants,
    watchedMembers,
    defaultDescription,
    defaultMaintainerEmails,
    defaultEditorEmails,
  ]);

  // Check if schemas differ across variants
  const allVariantsForDiffCheck = [
    watchedDefaultVariant,
    ...(watchedEnvVariants?.filter((v: any) => v.enabled) ?? []),
  ];
  const hasDifferentSchemas = useSchemaDiffCheck(allVariantsForDiffCheck);

  return (
    <Form {...form}>
      <form id="config-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {mode === 'new' ? (
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <div className="flex items-center gap-1.5">
                  <FormLabel>Name</FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        A unique identifier for this config. Use 1-100 letters, numbers,
                        underscores, or hyphens.
                      </p>
                    </TooltipContent>
                  </Tooltip>
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
        ) : (
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Optional human-readable description explaining what this config is used for.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Optional description"
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
            <div>
              <h3 className="text-lg font-semibold">Environment Overrides</h3>
              <p className="text-sm text-muted-foreground">
                Customize values for specific environments
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <CircleHelp className="h-4 w-4 text-muted-foreground cursor-help ml-auto" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p>
                  Enable an environment to customize its configuration. Disabled environments will
                  use the base configuration below.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-3">
            {environments.map((env, envIndex) => {
              const envVariant = watchedEnvVariants?.[envIndex];
              const envVariantDefaultValue = React.useMemo(() => {
                if (!envVariant?.value) return null;
                try {
                  return JSON.parse(envVariant.value);
                } catch {
                  return null;
                }
              }, [envVariant?.value]);

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
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border/50 bg-muted/30 hover:border-border'
                  }`}
                >
                  <FormField
                    control={form.control}
                    name={`environmentVariants.${envIndex}.enabled`}
                    render={({field}) => (
                      <FormItem className="flex items-center justify-between p-4 space-y-0">
                        <div className="flex items-center gap-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!canEditValue}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          </FormControl>
                          <div>
                            <FormLabel className="font-semibold cursor-pointer text-base">
                              {env.name}
                            </FormLabel>
                            <p className="text-xs text-muted-foreground">
                              {isCustomized ? 'Custom configuration' : 'Using base configuration'}
                            </p>
                          </div>
                        </div>
                        {isCustomized && (
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                            Customized
                          </span>
                        )}
                      </FormItem>
                    )}
                  />

                  {envVariant?.enabled && (
                    <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-6">
                      <ConfigVariantFields
                        control={form.control}
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
                        defaultSchemaAvailable={watchedDefaultVariant?.schemaEnabled ?? false}
                        defaultSchema={liveSchema}
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
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Base Configuration</h3>
              <p className="text-sm text-muted-foreground">The foundation for all environments</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <CircleHelp className="h-4 w-4 text-muted-foreground cursor-help ml-auto" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p>
                  Define the base value, schema, and overrides here. Environments without custom
                  settings above will use these values.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          <ConfigVariantFields
            control={form.control}
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
            overrideBuilderDefaultValue={overrideBuilderDefaultValue}
            liveSchema={liveSchema}
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
              <div>
                <h3 className="text-lg font-semibold">Access Control</h3>
                <p className="text-sm text-muted-foreground">
                  Manage who can edit and approve changes
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleHelp className="h-4 w-4 text-muted-foreground cursor-help ml-auto" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Config-level members who can approve proposals. Project admins and maintainers
                    automatically have approval rights.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            <FormField
              control={form.control}
              name="members"
              render={({field}) => (
                <FormItem>
                  <FormControl>
                    <ConfigMemberList
                      members={field.value ?? []}
                      onChange={field.onChange}
                      disabled={!canEditMembers}
                      errors={form.formState.errors.members as any}
                    />
                  </FormControl>
                  {mode === 'edit' && !canEditMembers && (
                    <FormDescription>Only maintainers can modify access control.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Spacer to prevent content from being hidden behind sticky buttons */}
        <div className="h-20" />
      </form>

      {/* Sticky button panel */}
      <div className="sticky bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-3">
        <div className="flex gap-2">
          {(mode === 'new' || mode === 'edit') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="submit"
                    form="config-form"
                    disabled={!!saving || !canSubmit || !hasChanges}
                    onClick={() => {
                      submitActionRef.current = 'save';
                    }}
                  >
                    {saving
                      ? mode === 'new'
                        ? 'Creating…'
                        : 'Saving…'
                      : mode === 'new'
                        ? 'Create Config'
                        : 'Save Changes'}
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasChanges && !saving && canSubmit && (
                <TooltipContent>
                  <p>No changes have been made to save.</p>
                </TooltipContent>
              )}
            </Tooltip>
          )}
          {(mode === 'edit' || mode === 'proposal') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="submit"
                    form="config-form"
                    variant={mode === 'edit' ? 'outline' : 'default'}
                    disabled={!!proposing || !canSubmit || !hasChanges}
                    onClick={() => {
                      submitActionRef.current = 'propose';
                    }}
                  >
                    {proposing ? 'Proposing…' : 'Create Proposal'}
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasChanges && !proposing && canSubmit && (
                <TooltipContent>
                  <p>No changes have been made to propose.</p>
                </TooltipContent>
              )}
            </Tooltip>
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
                Test Overrides
              </Button>
            )}
          {mode !== 'proposal' && onDelete && role === 'maintainer' && (
            <div className="ml-auto">
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={e => {
                  e.preventDefault();
                  if (
                    !confirm('Are you sure you want to delete this config? This cannot be undone.')
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
    </Form>
  );
}
