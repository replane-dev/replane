'use client';

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
import {CalendarDays, Clock3, FileCog, GitCommitVertical} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {useForm, useWatch} from 'react-hook-form';
import {z} from 'zod';

type Mode = 'new' | 'edit' | 'proposal';

export interface ConfigFormProps {
  mode: Mode;
  role: 'viewer' | 'owner' | 'editor';
  defaultName?: string; // used in edit mode (read-only display)
  defaultValue: string; // JSON string
  defaultDescription?: string;
  defaultSchemaEnabled?: boolean;
  defaultSchema?: string; // JSON string
  defaultOwnerEmails?: string[];
  defaultEditorEmails?: string[];
  submitting?: boolean;
  submitLabel?: string; // optional override for submit button label
  submittingLabel?: string; // optional override for submit button label while submitting
  editorIdPrefix?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  currentVersion?: number;
  versionsLink?: string; // link to versions page
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
  onSubmit: (data: {
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
    defaultName = '',
    defaultValue,
    defaultDescription = '',
    defaultSchemaEnabled = false,
    defaultSchema = '',
    defaultOwnerEmails = [],
    defaultEditorEmails = [],
    submitting,
    submitLabel,
    submittingLabel,
    editorIdPrefix,
    createdAt,
    updatedAt,
    currentVersion,
    versionsLink,
    onCancel,
    onDelete,
    onSubmit,
  } = props;

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
    ownersInput: z
      .string()
      .default('')
      .transform(s => s.trim())
      .superRefine((val, ctx) => {
        const lines = val.length ? val.split(/\r?\n/) : [];
        for (const line of lines) {
          const email = line.trim();
          if (!email) continue;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            ctx.addIssue({code: 'custom', message: `Invalid owner email: ${email}`});
            return;
          }
        }
      }),
    editorsInput: z
      .string()
      .default('')
      .transform(s => s.trim())
      .superRefine((val, ctx) => {
        const lines = val.length ? val.split(/\r?\n/) : [];
        for (const line of lines) {
          const email = line.trim();
          if (!email) continue;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            ctx.addIssue({code: 'custom', message: `Invalid editor email: ${email}`});
            return;
          }
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

  const fullSchema = fullSchemaBase.superRefine((vals, ctx) => {
    const owners = (vals.ownersInput ?? '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    const editors = (vals.editorsInput ?? '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    const overlap = owners.filter(e => editors.includes(e));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `The same email cannot be both owner and editor: ${Array.from(new Set(overlap)).join(', ')}`,
        path: ['ownersInput'],
      });
    }

    // check that not multiple times in owners or editors
    const memberSet = new Set<string>();
    for (const email of owners.concat(editors)) {
      if (memberSet.has(email)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate member email found: ${email}`,
          path: ['ownersInput'],
        });
      }
      memberSet.add(email);
    }
  });

  type FormValues = z.input<typeof fullSchema> & {name?: string};

  const form = useForm<FormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      ...(mode === 'new' ? {name: defaultName} : {}),
      value: defaultValue,
      description: defaultDescription,
      schemaEnabled: defaultSchemaEnabled,
      schema: defaultSchema,
      ownersInput: defaultOwnerEmails.join('\n'),
      editorsInput: defaultEditorEmails.join('\n'),
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

    await onSubmit({
      name: values.name ?? defaultName,
      value: payloadValue,
      schema: values.schemaEnabled ? parsedSchema : null,
      description: values.description ?? '',
      ownerEmails: (values.ownersInput || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean),
      editorEmails: (values.editorsInput || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean),
    });
  }

  // Reactive schema for Value editor (useWatch ensures defaults are considered before inputs mount)
  const watchedEnabled = useWatch({control: form.control, name: 'schemaEnabled'});
  const watchedSchema = useWatch({control: form.control, name: 'schema'});
  const enabled = (watchedEnabled ?? form.getValues('schemaEnabled')) as boolean;
  const schemaText = (watchedSchema ?? form.getValues('schema') ?? '').toString().trim();
  let liveSchema: any | undefined = undefined;
  if (enabled && schemaText) {
    try {
      const parsed = JSON.parse(schemaText);
      if (ajv.validateSchema(parsed)) liveSchema = parsed;
    } catch {}
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {mode === 'new' ? (
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
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
          <div className="rounded-lg border bg-card/50 p-3">
            {(() => {
              const c = createdAt ? new Date(createdAt) : undefined;
              const u = updatedAt ? new Date(updatedAt) : undefined;
              const hasC = !!c && !isNaN(c.getTime());
              const hasU = !!u && !isNaN(u.getTime());
              const showU = hasU && (!hasC || u!.getTime() !== c!.getTime());
              return (
                <div className="text-sm grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-3 inline-flex items-center gap-1.5">
                    <FileCog className="h-3.5 w-3.5" /> Config name
                  </div>
                  <div className="sm:col-span-9">
                    <span>{defaultName}</span>
                  </div>

                  {typeof currentVersion === 'number' && (
                    <>
                      <div className="sm:col-span-3 inline-flex items-center gap-1.5">
                        <GitCommitVertical className="h-3.5 w-3.5" /> Version
                      </div>
                      <div className="sm:col-span-9 flex items-center gap-2">
                        <span>{currentVersion}</span>
                        {versionsLink && (
                          <Link
                            href={versionsLink}
                            className="text-xs underline text-muted-foreground hover:text-foreground"
                          >
                            View history
                          </Link>
                        )}
                      </div>
                    </>
                  )}

                  {hasC && (
                    <>
                      <div className="sm:col-span-3 inline-flex gap-1.5 items-center">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Created
                      </div>
                      <div className="sm:col-span-9">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{formatDistanceToNow(c!, {addSuffix: true})}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>{format(c!, 'yyyy-MM-dd HH:mm:ss')}</span>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </>
                  )}

                  {showU && (
                    <>
                      <div className="sm:col-span-3 inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" /> Last updated
                      </div>
                      <div className="sm:col-span-9">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{formatDistanceToNow(u!, {addSuffix: true})}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>{format(u!, 'yyyy-MM-dd HH:mm:ss')}</span>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <FormField
          control={form.control}
          name="description"
          render={({field}) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
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
        {showOwnersEditors && (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="ownersInput"
              render={({field}) => (
                <FormItem>
                  <FormLabel>Owners (emails)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="one email per line"
                      readOnly={!canEditOwnersEditors}
                      {...field}
                    />
                  </FormControl>
                  {mode === 'edit' && !canEditOwnersEditors && (
                    <FormDescription>Only owners can modify owners.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="editorsInput"
              render={({field}) => (
                <FormItem>
                  <FormLabel>Editors (emails)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="one email per line"
                      readOnly={!canEditOwnersEditors}
                      {...field}
                    />
                  </FormControl>
                  {mode === 'edit' && !canEditOwnersEditors && (
                    <FormDescription>Only owners can modify editors.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="value"
          render={({field}) => (
            <FormItem>
              <FormLabel>Value (JSON)</FormLabel>
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

        <div className="flex items-center gap-2">
          <FormField
            control={form.control}
            name="schemaEnabled"
            render={({field}) => (
              <>
                <Switch
                  id={`${editorIdPrefix ?? 'config'}-use-schema`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!canEditSchema}
                />
                <Label
                  htmlFor={`${editorIdPrefix ?? 'config'}-use-schema`}
                  className="cursor-pointer"
                >
                  Enforce schema
                </Label>
                {!canEditSchema && (
                  <span className="text-xs text-muted-foreground">
                    Only owners can change schema enforcement.
                  </span>
                )}
              </>
            )}
          />
        </div>

        {enabled && (
          <FormField
            control={form.control}
            name="schema"
            render={({field}) => (
              <FormItem>
                <FormLabel>Schema (JSON Schema)</FormLabel>
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
                  <FormDescription>You do not have permission to edit the schema.</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={!!submitting || !canSubmit}>
            {submitting
              ? (submittingLabel ??
                (mode === 'new' ? 'Creating…' : mode === 'proposal' ? 'Creating…' : 'Saving…'))
              : (submitLabel ??
                (mode === 'new'
                  ? 'Create Config'
                  : mode === 'proposal'
                    ? 'Create Proposal'
                    : 'Save Changes'))}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {mode !== 'proposal' && onDelete && role === 'owner' && (
            <div className="ml-auto">
              <Button
                variant="destructive"
                onClick={e => {
                  e.preventDefault();
                  onDelete();
                }}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </form>
    </Form>
  );
}
