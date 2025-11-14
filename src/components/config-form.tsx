'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {ConfigMaintainersList} from '@/components/config-maintainers-list';
import {JsonEditor} from '@/components/json-editor';
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
import {zodResolver} from '@hookform/resolvers/zod';
import Ajv from 'ajv';
import {format, formatDistanceToNow} from 'date-fns';
import {CalendarDays, CircleHelp, Clock3, Copy, GitBranch, GitCommitVertical} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {useForm, useWatch} from 'react-hook-form';
import {toast} from 'sonner';
import {z} from 'zod';

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `UTC${sign}${hours}${minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : ''}`;
}

type Mode = 'new' | 'edit' | 'proposal';

export interface ConfigFormProps {
  mode: Mode;
  role: 'viewer' | 'owner' | 'editor';
  currentName?: string; // used in edit mode (read-only display)
  defaultValue: string; // JSON string
  defaultDescription?: string;
  defaultSchemaEnabled?: boolean;
  defaultSchema?: string; // JSON string
  defaultOwnerEmails?: string[];
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
    description: string;
    ownerEmails: string[];
    editorEmails: string[];
  }) => Promise<void> | void;
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
    defaultOwnerEmails = [],
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
  } = props;

  const defaultName = currentName ?? '';

  const projectId = useProjectId();

  // Normalize role, tolerate common typo "editor"
  const role: 'viewer' | 'owner' | 'editor' = rawRole === 'editor' ? 'editor' : rawRole;

  // Permissions
  // - new: fully editable
  // - edit: respect role-based restrictions
  // - proposal: allow proposing value/description/schema and members regardless of role
  const isProposal = mode === 'proposal';
  const canEditDescription = mode === 'new' ? true : isProposal ? true : role === 'owner';
  const canEditValue = mode === 'new' ? true : isProposal ? true : role !== 'viewer';
  const canEditSchema = mode === 'new' ? true : isProposal ? true : role === 'owner';
  const canEditOwnersEditors = mode === 'new' ? true : isProposal ? true : role === 'owner';
  const canSubmit = mode === 'new' ? true : isProposal ? true : role !== 'viewer';
  const showOwnersEditors = true;

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
    maintainers: z
      .array(
        z.object({
          email: z.string().min(1, 'Email is required'),
          role: z.enum(['owner', 'editor']),
        }),
      )
      .default([])
      .superRefine((maintainers, ctx) => {
        // Validate email format
        for (let i = 0; i < maintainers.length; i++) {
          const maintainer = maintainers[i];
          if (!maintainer.email) continue;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(maintainer.email.trim())) {
            ctx.addIssue({
              code: 'custom',
              message: `Invalid email: ${maintainer.email}`,
              path: [i, 'email'],
            });
          }
        }

        // Check for duplicates
        const emailSet = new Set<string>();
        for (let i = 0; i < maintainers.length; i++) {
          const email = maintainers[i].email.trim().toLowerCase();
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
      maintainers: [
        ...defaultOwnerEmails.map(email => ({email, role: 'owner' as const})),
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

    // Determine action: use tracked action, or default based on mode
    const action: 'save' | 'propose' =
      submitActionRef.current ?? (mode === 'proposal' ? 'propose' : 'save');

    // Transform maintainers array back to ownerEmails and editorEmails
    // Filter out entries with empty emails
    const maintainers = (values.maintainers ?? []).filter(m => m.email.trim());
    const ownerEmails = maintainers
      .filter(m => m.role === 'owner')
      .map(m => m.email.trim().toLowerCase());
    const editorEmails = maintainers
      .filter(m => m.role === 'editor')
      .map(m => m.email.trim().toLowerCase());

    await onSubmit({
      action,
      name: values.name ?? defaultName,
      value: payloadValue,
      schema: values.schemaEnabled ? parsedSchema : null,
      description: values.description ?? '',
      ownerEmails,
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
  const watchedMaintainers = useWatch({control: form.control, name: 'maintainers'});

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
    const currentMaintainers = (watchedMaintainers ?? []).filter(m => m.email.trim());

    // Normalize maintainers for comparison
    const normalizeMaintainers = (maintainers: typeof currentMaintainers) => {
      const normalized = maintainers
        .filter(m => m.email.trim())
        .map(m => ({email: m.email.trim().toLowerCase(), role: m.role}))
        .sort((a, b) => {
          if (a.email !== b.email) return a.email.localeCompare(b.email);
          return a.role.localeCompare(b.role);
        });
      return normalized;
    };

    const defaultMaintainers = [
      ...defaultOwnerEmails.map(email => ({email: email.toLowerCase(), role: 'owner' as const})),
      ...defaultEditorEmails.map(email => ({email: email.toLowerCase(), role: 'editor' as const})),
    ].sort((a, b) => {
      if (a.email !== b.email) return a.email.localeCompare(b.email);
      return a.role.localeCompare(b.role);
    });

    const normalizedCurrent = normalizeMaintainers(currentMaintainers);
    const normalizedDefault = normalizeMaintainers(defaultMaintainers);

    // Compare maintainers
    const maintainersChanged =
      normalizedCurrent.length !== normalizedDefault.length ||
      normalizedCurrent.some(
        (m, i) => m.email !== normalizedDefault[i]?.email || m.role !== normalizedDefault[i]?.role,
      );

    // Compare other fields
    const valueChanged = currentValue !== defaultValue.trim();
    const descriptionChanged = currentDescription !== (defaultDescription ?? '').trim();
    const schemaEnabledChanged = currentSchemaEnabled !== defaultSchemaEnabled;
    const schemaChanged = currentSchema !== (defaultSchema ?? '').trim();

    return (
      valueChanged ||
      descriptionChanged ||
      schemaEnabledChanged ||
      schemaChanged ||
      maintainersChanged
    );
  }, [
    mode,
    watchedName,
    watchedValue,
    watchedDescription,
    watchedSchemaEnabled,
    watchedSchema,
    watchedMaintainers,
    defaultValue,
    defaultDescription,
    defaultSchemaEnabled,
    defaultSchema,
    defaultOwnerEmails,
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
          <>
            <div className="space-y-2">
              <div className="group flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{defaultName}</h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={async () => {
                        await navigator.clipboard.writeText(defaultName);
                        toast.success('Copied config name', {description: defaultName});
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy config name</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {typeof currentName === 'string' &&
                  typeof currentPendingProposalsCount === 'number' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={`/app/projects/${projectId}/configs/${encodeURIComponent(currentName)}/proposals`}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm hover:bg-card/80 transition-colors"
                        >
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{currentPendingProposalsCount}</span>
                          <span className="text-muted-foreground">proposals</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {currentPendingProposalsCount === 1
                          ? '1 pending proposal waiting for review'
                          : `${currentPendingProposalsCount} pending proposals waiting for review`}
                      </TooltipContent>
                    </Tooltip>
                  )}

                {typeof currentVersion === 'number' && versionsLink && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={versionsLink}
                        className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm hover:bg-card/80 transition-colors"
                      >
                        <GitCommitVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">v{currentVersion}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Config version {currentVersion}. Click to view version history.
                    </TooltipContent>
                  </Tooltip>
                )}
                {typeof currentVersion === 'number' && !versionsLink && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm cursor-help">
                        <GitCommitVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">v{currentVersion}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Config version {currentVersion}. The version number increments each time the
                      config is updated.
                    </TooltipContent>
                  </Tooltip>
                )}

                {(() => {
                  const c = createdAt ? new Date(createdAt) : undefined;
                  const u = updatedAt ? new Date(updatedAt) : undefined;
                  const hasC = !!c && !isNaN(c.getTime());
                  const hasU = !!u && !isNaN(u.getTime());
                  const showU = hasU && (!hasC || u!.getTime() !== c!.getTime());

                  return (
                    <>
                      {hasC && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm cursor-help">
                              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Created</span>
                              <span className="font-medium">
                                {formatDistanceToNow(c!, {addSuffix: true})}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <span>
                              {format(c!, 'yyyy-MM-dd HH:mm:ss')} {formatTimezoneOffset(c!)}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {showU && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-3 py-1.5 text-sm cursor-help">
                              <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Updated</span>
                              <span className="font-medium">
                                {formatDistanceToNow(u!, {addSuffix: true})}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <span>
                              {format(u!, 'yyyy-MM-dd HH:mm:ss')} {formatTimezoneOffset(u!)}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </>
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
          name="value"
          render={({field}) => (
            <FormItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <FormLabel>JSON value</FormLabel>
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
              <div className="flex items-start gap-3">
                <Switch
                  id={`${editorIdPrefix ?? 'config'}-use-schema`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!canEditSchema}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0 space-y-1">
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
                  {!canEditSchema && (
                    <p className="text-xs text-muted-foreground">
                      Only owners can change schema enforcement.
                    </p>
                  )}
                </div>
              </div>
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

        {showOwnersEditors && (
          <FormField
            control={form.control}
            name="maintainers"
            render={({field}) => (
              <FormItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <FormLabel>Maintainers (can approve proposals)</FormLabel>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Config-level maintainers who can approve proposals for this config. Project
                      members (owners and admins) can also approve proposals and are treated like
                      config owners.
                    </p>
                  </TooltipContent>
                </Tooltip>
                <FormControl>
                  <ConfigMaintainersList
                    maintainers={field.value ?? []}
                    onChange={field.onChange}
                    disabled={!canEditOwnersEditors}
                    errors={form.formState.errors.maintainers as any}
                  />
                </FormControl>
                {mode === 'edit' && !canEditOwnersEditors && (
                  <FormDescription>Only owners can modify maintainers.</FormDescription>
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
          {mode !== 'proposal' && onDelete && role === 'owner' && (
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
