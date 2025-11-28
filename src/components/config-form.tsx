'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {ConfigMemberList} from '@/components/config-member-list';
import {ConfigMetadataHeader} from '@/components/config-metadata-header';
import {ConfigVariantFields} from '@/components/config-variant-fields';
import {SchemaDiffWarning} from '@/components/schema-diff-warning';
import {Button} from '@/components/ui/button';
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
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Textarea} from '@/components/ui/textarea';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {ConfigOverrides} from '@/engine/core/config-store';
import type {Override} from '@/engine/core/override-evaluator';
import {isValidJsonSchema, validateAgainstJsonSchema} from '@/engine/core/utils';
import {useSchemaDiffCheck} from '@/hooks/use-schema-diff-check';
import {zodResolver} from '@hookform/resolvers/zod';
import {CircleHelp} from 'lucide-react';
import * as React from 'react';
import {useForm, useWatch} from 'react-hook-form';
import {z} from 'zod';

type Mode = 'new' | 'edit' | 'proposal';

export interface ConfigVariantData {
  configVariantId?: string; // undefined for new configs
  environmentId: string;
  environmentName: string;
  value: unknown;
  schema: unknown | null;
  overrides: Override[];
  version?: number; // undefined for new configs
}

export interface ConfigFormProps {
  mode: Mode;
  role: 'viewer' | 'maintainer' | 'editor';
  currentName?: string; // used in edit mode (read-only display)
  variants: ConfigVariantData[]; // Array of variants, one per environment
  initialEnvironmentId?: string; // Initial environment tab to select
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
  onEnvironmentChange?: (environmentId: string) => void;
  onSubmit: (data: {
    action: 'save' | 'propose';
    name: string;
    variants: Array<{
      configVariantId?: string;
      environmentId: string;
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
      version?: number;
    }>;
    description: string;
    maintainerEmails: string[];
    editorEmails: string[];
  }) => Promise<void> | void;
  onValuesChange?: (environmentId: string, values: {value: string; overrides: Override[]}) => void;
  onTestOverrides?: (environmentId: string) => void;
}

export function ConfigForm(props: ConfigFormProps) {
  const {
    mode,
    role: rawRole,
    currentName,
    currentPendingProposalsCount,
    variants,
    initialEnvironmentId,
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
    onEnvironmentChange,
  } = props;

  const defaultName = currentName ?? '';

  const projectId = useProjectId();

  // State for active tab (environment)
  const [activeEnvironmentId, setActiveEnvironmentId] = React.useState<string>(
    initialEnvironmentId ?? variants[0]?.environmentId ?? '',
  );

  // Update activeEnvironmentId when initialEnvironmentId changes (e.g., from URL)
  React.useEffect(() => {
    if (initialEnvironmentId && initialEnvironmentId !== activeEnvironmentId) {
      setActiveEnvironmentId(initialEnvironmentId);
    }
  }, [initialEnvironmentId, activeEnvironmentId]);

  // Notify parent when environment changes
  const handleEnvironmentChange = React.useCallback(
    (environmentId: string) => {
      setActiveEnvironmentId(environmentId);
      onEnvironmentChange?.(environmentId);
    },
    [onEnvironmentChange],
  );

  // Normalize role, tolerate common typo "editor"
  const role: 'viewer' | 'maintainer' | 'editor' = rawRole === 'editor' ? 'editor' : rawRole;

  // Permissions
  // - new: fully editable
  // - edit: respect role-based restrictions
  // - proposal: allow proposing value/description/schema and members regardless of role
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
  });

  const baseSchema = {
    description: z.string().optional(),
    variants: z.array(variantSchema),
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
      variants: variants.map(v => ({
        environmentId: v.environmentId,
        value: JSON.stringify(v.value, null, 2),
        schemaEnabled: v.schema !== null,
        schema: v.schema ? JSON.stringify(v.schema, null, 2) : '',
        overrides: v.overrides,
      })),
      members: [
        ...defaultMaintainerEmails.map(email => ({email, role: 'maintainer' as const})),
        ...defaultEditorEmails.map(email => ({email, role: 'editor' as const})),
      ],
    },
    mode: 'onTouched',
  });

  async function handleSubmit(values: FormValues) {
    // Process each variant
    const processedVariants = [];
    for (let i = 0; i < values.variants.length; i++) {
      const variant = values.variants[i];
      const originalVariant = variants[i];

      const payloadValue = JSON.parse(variant.value);
      let parsedSchema: any | null = null;

      if (variant.schemaEnabled) {
        try {
          parsedSchema = JSON.parse(variant.schema || '');
        } catch {
          form.setError(`variants.${i}.schema`, {message: 'Schema must be valid JSON'});
          // Switch to the tab with the error
          setActiveEnvironmentId(variant.environmentId);
          return;
        }

        // Validate that the schema itself is a valid JSON Schema
        if (!isValidJsonSchema(parsedSchema)) {
          form.setError(`variants.${i}.schema`, {message: 'Invalid JSON Schema'});
          setActiveEnvironmentId(variant.environmentId);
          return;
        }

        // Validate the value against the schema
        const validationResult = validateAgainstJsonSchema(payloadValue, parsedSchema);
        if (!validationResult.ok) {
          const errors = validationResult.errors.join('; ');
          form.setError(`variants.${i}.value`, {
            message: `Does not match schema: ${errors || 'Invalid value'}`,
          });
          setActiveEnvironmentId(variant.environmentId);
          return;
        }
      }

      processedVariants.push({
        configVariantId: originalVariant?.configVariantId,
        environmentId: variant.environmentId,
        value: payloadValue,
        schema: variant.schemaEnabled ? parsedSchema : null,
        overrides: variant.overrides as Override[],
        version: originalVariant?.version,
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
      variants: processedVariants,
      description: values.description ?? '',
      maintainerEmails: maintainerEmails,
      editorEmails,
    });

    // Reset action ref after submission
    submitActionRef.current = null;
  }

  // Track all form values to detect changes and for reactive schema
  const watchedName = useWatch({control: form.control, name: 'name'});
  const watchedDescription = useWatch({control: form.control, name: 'description'});
  const watchedVariants = useWatch({control: form.control, name: 'variants'});
  const watchedMembers = useWatch({control: form.control, name: 'members'});

  // Get current active variant
  const activeVariantIndex = variants.findIndex(v => v.environmentId === activeEnvironmentId);
  const activeVariant = watchedVariants?.[activeVariantIndex];

  const overrideBuilderDefaultValue = React.useMemo(() => {
    if (!activeVariant?.value) return null;
    try {
      return JSON.parse(activeVariant.value);
    } catch {
      return null;
    }
  }, [activeVariant?.value]);

  // Notify parent of value changes for live testing (for active environment)
  React.useEffect(() => {
    if (onValuesChange && activeVariant) {
      onValuesChange(activeEnvironmentId, {
        value: activeVariant.value ?? '',
        overrides: (activeVariant.overrides ?? []) as Override[],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVariant?.value, activeVariant?.overrides, activeEnvironmentId]);

  // Reactive schema for Value editor (for active environment)
  const enabled = activeVariant?.schemaEnabled ?? false;
  const schemaText = (activeVariant?.schema ?? '').toString().trim();
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
      // For new configs, check if name and at least one variant value are filled
      const name = (watchedName ?? '').trim();
      const hasValue = watchedVariants?.some(v => (v.value ?? '').trim().length > 0);
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

    // Compare variants
    let variantsChanged = false;
    if (watchedVariants && variants.length === watchedVariants.length) {
      for (let i = 0; i < watchedVariants.length; i++) {
        const current = watchedVariants[i];
        const original = variants[i];

        const currentValue = (current.value ?? '').trim();
        const originalValue = JSON.stringify(original.value, null, 2).trim();
        const currentSchemaEnabled = current.schemaEnabled ?? false;
        const originalSchemaEnabled = original.schema !== null;
        const currentSchema = (current.schema ?? '').trim();
        const originalSchema = original.schema
          ? JSON.stringify(original.schema, null, 2).trim()
          : '';
        const currentOverrides = current.overrides ?? [];
        const originalOverrides = original.overrides ?? [];

        if (
          currentValue !== originalValue ||
          currentSchemaEnabled !== originalSchemaEnabled ||
          currentSchema !== originalSchema ||
          JSON.stringify(currentOverrides) !== JSON.stringify(originalOverrides)
        ) {
          variantsChanged = true;
          break;
        }
      }
    } else {
      variantsChanged = true;
    }

    return descriptionChanged || variantsChanged || membersChanged;
  }, [
    mode,
    watchedName,
    watchedDescription,
    watchedVariants,
    watchedMembers,
    variants,
    defaultDescription,
    defaultMaintainerEmails,
    defaultEditorEmails,
  ]);

  // Check if schemas differ across environments
  const hasDifferentSchemas = useSchemaDiffCheck(watchedVariants);

  // Determine if we should use tabs or dropdown based on total character count
  const maxEnvNameChars = Math.max(...variants.map(v => v.environmentName.length));
  const useTabs = maxEnvNameChars * variants.length <= 85;

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
                    placeholder="e.g. FeatureFlag-1"
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

        {/* Warning for different schemas across environments */}
        {hasDifferentSchemas && <SchemaDiffWarning />}

        {/* Environment-specific configuration (variants) */}
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/10 space-y-4">
          {useTabs ? (
            <div className="p-6">
              <Tabs value={activeEnvironmentId} onValueChange={handleEnvironmentChange}>
                <TabsList
                  className="grid w-full"
                  style={{gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))`}}
                >
                  {variants.map(variant => (
                    <TabsTrigger key={variant.environmentId} value={variant.environmentId}>
                      {variant.environmentName}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {variants.map((variant, variantIndex) => (
                  <TabsContent
                    key={variant.environmentId}
                    value={variant.environmentId}
                    className="space-y-6 mt-6"
                  >
                    <ConfigVariantFields
                      control={form.control}
                      variantIndex={variantIndex}
                      environmentId={variant.environmentId}
                      environmentName={variant.environmentName}
                      editorIdPrefix={editorIdPrefix}
                      mode={mode}
                      projectId={projectId}
                      canEditValue={canEditValue}
                      canEditSchema={canEditSchema}
                      canEditOverrides={canEditOverrides}
                      watchedVariants={watchedVariants}
                      overrideBuilderDefaultValue={overrideBuilderDefaultValue}
                      liveSchema={liveSchema}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          ) : (
            <div className="space-y-0">
              <div className="border-b bg-muted/30 px-4 py-3 flex items-center gap-3">
                <Label htmlFor="environment-select" className="text-sm font-medium shrink-0">
                  Environment:
                </Label>
                <Select value={activeEnvironmentId} onValueChange={handleEnvironmentChange}>
                  <SelectTrigger id="environment-select" className="w-[240px] h-8 bg-background">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map(variant => (
                      <SelectItem key={variant.environmentId} value={variant.environmentId}>
                        {variant.environmentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-6">
                {variants.map((variant, variantIndex) => (
                  <div
                    key={variant.environmentId}
                    className={
                      activeEnvironmentId === variant.environmentId ? 'space-y-6' : 'hidden'
                    }
                  >
                    <ConfigVariantFields
                      control={form.control}
                      variantIndex={variantIndex}
                      environmentId={variant.environmentId}
                      environmentName={variant.environmentName}
                      editorIdPrefix={editorIdPrefix}
                      mode={mode}
                      projectId={projectId}
                      canEditValue={canEditValue}
                      canEditSchema={canEditSchema}
                      canEditOverrides={canEditOverrides}
                      watchedVariants={watchedVariants}
                      overrideBuilderDefaultValue={overrideBuilderDefaultValue}
                      liveSchema={liveSchema}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* End of environment-specific section */}

        {showMembers && (
          <FormField
            control={form.control}
            name="members"
            render={({field}) => (
              <FormItem>
                <div className="flex items-center gap-1.5">
                  <FormLabel>Members (can approve proposals)</FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        Config-level members who can approve proposals for this config. Project
                        members (admins and maintainers) can also approve proposals and are treated
                        like config members.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FormControl>
                  <ConfigMemberList
                    members={field.value ?? []}
                    onChange={field.onChange}
                    disabled={!canEditMembers}
                    errors={form.formState.errors.members as any}
                  />
                </FormControl>
                {mode === 'edit' && !canEditMembers && (
                  <FormDescription>Only maintainers can modify maintainers.</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
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
            activeVariant?.overrides &&
            (activeVariant.overrides as any[])?.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onTestOverrides(activeEnvironmentId)}
              >
                Test Overrides (
                {variants.find(v => v.environmentId === activeEnvironmentId)?.environmentName})
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
