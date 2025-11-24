'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {ConfigMemberList} from '@/components/config-member-list';
import {ConfigMetadataHeader} from '@/components/config-metadata-header';
import {JsonEditor} from '@/components/json-editor';
import {OverrideBuilder} from '@/components/override-builder';
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
import {Switch} from '@/components/ui/switch';
import {Textarea} from '@/components/ui/textarea';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {ConfigOverrides} from '@/engine/core/config-store';
import type {Override} from '@/engine/core/override-evaluator';
import {zodResolver} from '@hookform/resolvers/zod';
import Ajv from 'ajv';
import {CircleHelp} from 'lucide-react';
import * as React from 'react';
import {useForm, useWatch} from 'react-hook-form';
import {z} from 'zod';

type Mode = 'new' | 'edit' | 'proposal';

export interface ConfigFormProps {
  mode: Mode;
  role: 'viewer' | 'maintainer' | 'editor';
  currentName?: string; // used in edit mode (read-only display)
  defaultValue: string; // JSON string
  defaultDescription?: string;
  defaultSchemaEnabled?: boolean;
  defaultSchema?: string; // JSON string
  defaultOverrides?: Override[];
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
    value: unknown;
    schema: unknown | null;
    overrides: Override[];
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
    defaultValue,
    defaultDescription = '',
    defaultSchemaEnabled = false,
    defaultSchema = '',
    defaultOverrides = [],
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

  const ajv = React.useMemo(
    () => new Ajv({allErrors: true, strict: false, allowUnionTypes: true}),
    [],
  );

  // Track which action button was clicked
  const submitActionRef = React.useRef<'save' | 'propose' | null>(null);

  const baseSchema = {
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
    description: z.string().optional(),
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
      value: defaultValue,
      description: defaultDescription,
      schemaEnabled: defaultSchemaEnabled,
      schema: defaultSchema,
      overrides: defaultOverrides,
      members: [
        ...defaultMaintainerEmails.map(email => ({email, role: 'maintainer' as const})),
        ...defaultEditorEmails.map(email => ({email, role: 'editor' as const})),
      ],
    },
    mode: 'onTouched',
  });

  async function handleSubmit(values: FormValues) {
    const payloadValue = JSON.parse(values.value);
    let parsedSchema: any | null = null;
    if (values.schemaEnabled) {
      try {
        parsedSchema = JSON.parse(values.schema || '');
      } catch {
        form.setError('schema', {message: 'Schema must be valid JSON'});
        return;
      }
      if (!ajv.validateSchema(parsedSchema)) {
        form.setError('schema', {message: 'Invalid JSON Schema'});
        return;
      }
      let validateFn;
      try {
        validateFn = ajv.compile(parsedSchema);
      } catch {
        form.setError('schema', {message: 'Invalid JSON Schema'});
        return;
      }
      if (!validateFn(payloadValue)) {
        const errors = (validateFn.errors ?? [])
          .map(e => e?.message)
          .filter(Boolean)
          .join('; ');
        form.setError('value', {message: `Does not match schema: ${errors || 'Invalid value'}`});
        return;
      }
    }

    // Handle overrides - overrides are enabled if they exist
    const overrides = values.overrides;

    // Determine action: use tracked action, or default based on mode
    const action: 'save' | 'propose' =
      submitActionRef.current ?? (mode === 'proposal' ? 'propose' : 'save');

    // Transform member array back to maintainerEmails and editorEmails
    // Filter out entries with empty emails
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
      value: payloadValue,
      schema: values.schemaEnabled ? parsedSchema : null,
      overrides: overrides as Override[],
      description: values.description ?? '',
      maintainerEmails: maintainerEmails,
      editorEmails,
    });

    // Reset action ref after submission
    submitActionRef.current = null;
  }

  // Track all form values to detect changes and for reactive schema
  const watchedName = useWatch({control: form.control, name: 'name'});
  const watchedValue = useWatch({control: form.control, name: 'value'});
  const watchedDescription = useWatch({control: form.control, name: 'description'});
  const watchedSchemaEnabled = useWatch({control: form.control, name: 'schemaEnabled'});
  const watchedSchema = useWatch({control: form.control, name: 'schema'});
  const watchedOverrides = useWatch({control: form.control, name: 'overrides'}) as
    | Override[]
    | undefined;
  const watchedMembers = useWatch({control: form.control, name: 'members'});

  // Notify parent of value changes for live testing
  React.useEffect(() => {
    if (onValuesChange && watchedOverrides) {
      onValuesChange({
        value: watchedValue ?? defaultValue,
        overrides: watchedOverrides,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValue, watchedOverrides]);

  // Reactive schema for Value editor (useWatch ensures defaults are considered before inputs mount)
  const enabled = (watchedSchemaEnabled ?? form.getValues('schemaEnabled')) as boolean;
  const schemaText = (watchedSchema ?? form.getValues('schema') ?? '').toString().trim();
  let liveSchema: any | undefined = undefined;
  if (enabled && schemaText) {
    try {
      const parsed = JSON.parse(schemaText);
      if (ajv.validateSchema(parsed)) liveSchema = parsed;
    } catch {}
  }

  // Check if there are any changes
  const hasChanges = React.useMemo(() => {
    if (mode === 'new') {
      // For new configs, check if name and value are filled
      const name = (watchedName ?? '').trim();
      const value = (watchedValue ?? '').trim();
      return name.length > 0 && value.length > 0;
    }

    // For edit/proposal modes, compare with defaults
    const currentValue = (watchedValue ?? '').trim();
    const currentDescription = (watchedDescription ?? '').trim();
    const currentSchemaEnabled = watchedSchemaEnabled ?? false;
    const currentSchema = (watchedSchema ?? '').trim();
    const currentMembers = (watchedMembers ?? []).filter(m => m.email.trim());

    // Normalize maintainers for comparison
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

    // Compare other fields
    const valueChanged = currentValue !== defaultValue.trim();
    const descriptionChanged = currentDescription !== (defaultDescription ?? '').trim();
    const schemaEnabledChanged = currentSchemaEnabled !== defaultSchemaEnabled;
    const schemaChanged = currentSchema !== (defaultSchema ?? '').trim();

    // Compare overrides
    const currentOverrides = watchedOverrides ?? null;
    const overridesChanged = JSON.stringify(currentOverrides) !== JSON.stringify(defaultOverrides);

    return (
      valueChanged ||
      descriptionChanged ||
      schemaEnabledChanged ||
      schemaChanged ||
      overridesChanged ||
      membersChanged
    );
  }, [
    mode,
    watchedName,
    watchedValue,
    watchedDescription,
    watchedSchemaEnabled,
    watchedSchema,
    watchedOverrides,
    watchedMembers,
    defaultValue,
    defaultDescription,
    defaultSchemaEnabled,
    defaultSchema,
    defaultOverrides,
    defaultMaintainerEmails,
    defaultEditorEmails,
  ]);

  return (
    <Form {...form}>
      <form id="config-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {mode === 'new' ? (
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <FormLabel>Name</FormLabel>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      A unique identifier for this config. Use 1-100 letters, numbers, underscores,
                      or hyphens.
                    </p>
                  </TooltipContent>
                </Tooltip>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <FormLabel>Description</FormLabel>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Optional human-readable description explaining what this config is used for.
                  </p>
                </TooltipContent>
              </Tooltip>
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

        <FormField
          control={form.control}
          name="overrides"
          render={({field}) => (
            <FormItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <FormLabel>Value overrides</FormLabel>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Overrides allow you to conditionally return different values based on context
                    properties like user email, tier, country, etc.
                  </p>
                </TooltipContent>
              </Tooltip>
              <FormControl>
                <OverrideBuilder
                  overrides={field.value as Override[]}
                  onChange={field.onChange}
                  readOnly={!canEditOverrides}
                  schema={liveSchema}
                  projectId={projectId}
                  defaultValue={React.useMemo(() => {
                    try {
                      return JSON.parse(watchedValue ?? defaultValue);
                    } catch {
                      return null;
                    }
                  }, [watchedValue])}
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
          control={form.control}
          name="value"
          render={({field}) => (
            <FormItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <FormLabel>
                      {form.getValues('overrides').length > 0 ? 'Default Value' : 'Value'}
                    </FormLabel>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    The configuration value as valid JSON. This is the actual data that will be
                    stored and retrieved for this config.
                  </p>
                </TooltipContent>
              </Tooltip>
              <FormControl>
                <JsonEditor
                  id={`${editorIdPrefix ?? 'config'}-value`}
                  height={mode === 'new' ? 300 : 360}
                  value={field.value}
                  onChange={field.onChange}
                  aria-label="Config JSON"
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

        <div className="rounded-lg border bg-card/50 p-4 space-y-4">
          <FormField
            control={form.control}
            name="schemaEnabled"
            render={({field}) => (
              <FormItem>
                <div className="flex items-center justify-between space-x-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 cursor-help">
                        <Label
                          htmlFor={`${editorIdPrefix ?? 'config'}-use-schema`}
                          className="text-sm font-medium cursor-pointer gap-1"
                        >
                          Enforce
                          <a
                            href="https://json-schema.org/"
                            target="_blank"
                            className="text-primary underline"
                          >
                            JSON schema
                          </a>
                        </Label>
                        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        When enabled, the config value must validate against the JSON Schema before
                        it can be saved. This helps ensure data consistency and catch errors early.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <FormControl>
                    <Switch
                      id={`${editorIdPrefix ?? 'config'}-use-schema`}
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

          {enabled && (
            <FormField
              control={form.control}
              name="schema"
              render={({field}) => (
                <FormItem className="space-y-2">
                  <FormControl>
                    <JsonEditor
                      id={`${editorIdPrefix ?? 'config'}-schema`}
                      height={mode === 'new' ? 300 : 360}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      aria-label="Config JSON Schema"
                      readOnly={!canEditSchema}
                    />
                  </FormControl>
                  {!canEditSchema && (
                    <FormDescription>
                      You do not have permission to edit the schema.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {showMembers && (
          <FormField
            control={form.control}
            name="members"
            render={({field}) => (
              <FormItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <FormLabel>Members (can approve proposals)</FormLabel>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Config-level members who can approve proposals for this config. Project
                      members (admins and maintainers) can also approve proposals and are treated
                      like config members.
                    </p>
                  </TooltipContent>
                </Tooltip>
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
          {onTestOverrides && watchedOverrides && (watchedOverrides as any[])?.length > 0 && (
            <Button type="button" variant="outline" onClick={onTestOverrides}>
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
