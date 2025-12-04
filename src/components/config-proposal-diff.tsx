'use client';

import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';
import {DiffEditor} from '@monaco-editor/react';
import {ArrowRight, Minus, Plus} from 'lucide-react';
import * as React from 'react';

function stringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function DiffRow(props: {
  title: string;
  before: unknown;
  after: unknown;
  language: 'json' | 'plaintext';
  height?: number;
}) {
  const {title, before, after, language, height = 280} = props;
  const original = React.useMemo(() => stringify(before), [before]);
  const modified = React.useMemo(() => stringify(after), [after]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className={cn('rounded-lg border bg-card/50 overflow-hidden')}>
        <DiffEditor
          original={original}
          modified={modified}
          language={language}
          height={height}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: {enabled: false},
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            renderIndicators: true,
            automaticLayout: true,
            fixedOverflowWidgets: true,
            scrollbar: {
              alwaysConsumeMouseWheel: false,
            },
          }}
        />
      </div>
    </div>
  );
}

export interface ProposedVariantChange {
  configVariantId: string;
  environmentId: string;
  environmentName: string;
  baseVariantVersion?: number;
  proposedValue?: unknown;
  proposedSchema?: unknown;
  proposedOverrides?: unknown[];
  useDefaultSchema?: boolean;
  currentValue?: unknown;
  currentSchema?: unknown | null;
  currentOverrides?: unknown[];
  currentUseDefaultSchema?: boolean;
}

export interface ConfigProposalDiffProps {
  current: {
    value?: unknown;
    description: string;
    schema?: unknown | null;
    maintainers?: string[];
    editors?: string[];
  };
  proposed: {
    value?: {newValue?: unknown} | null;
    description?: string | null;
    schema?: {newSchema?: unknown} | null;
    members?: {newMembers?: Array<{email: string; role: 'owner' | 'editor'}>} | null;
  };
  proposedVariants?: ProposedVariantChange[];
}

export function ConfigProposalDiff({
  current,
  proposed,
  proposedVariants = [],
}: ConfigProposalDiffProps) {
  const diffs: Array<{title: string; before: unknown; after: unknown}> = [];

  // Only show schema if it exists and actually changed
  if (
    proposed.schema &&
    current.schema !== undefined &&
    JSON.stringify(current.schema) !== JSON.stringify(proposed.schema.newSchema)
  ) {
    diffs.push({title: 'JSON Schema', before: current.schema, after: proposed.schema.newSchema});
  }

  // Only show value if it exists and actually changed
  if (
    proposed.value &&
    current.value !== undefined &&
    JSON.stringify(current.value) !== JSON.stringify(proposed.value.newValue)
  ) {
    diffs.push({title: 'JSON Value', before: current.value, after: proposed.value.newValue});
  }

  // Only show description if it's not null and actually changed
  if (
    proposed.description !== undefined &&
    proposed.description !== null &&
    current.description !== proposed.description
  ) {
    diffs.push({title: 'Description', before: current.description, after: proposed.description});
  }

  // Members diff (owners/editors)
  type MemberChange =
    | {type: 'add'; email: string; role: 'owner' | 'editor'}
    | {type: 'remove'; email: string; role: 'owner' | 'editor'}
    | {
        type: 'change';
        email: string;
        fromRole: 'owner' | 'editor';
        toRole: 'owner' | 'editor';
      };

  const memberChanges: MemberChange[] = [];
  if (proposed.members && proposed.members.newMembers) {
    const currentMap = new Map<string, 'owner' | 'editor'>();
    (current.maintainers ?? []).forEach(e => currentMap.set(e, 'owner'));
    (current.editors ?? []).forEach(e => currentMap.set(e, 'editor'));

    const proposedMap = new Map<string, 'owner' | 'editor'>();
    for (const m of proposed.members.newMembers) proposedMap.set(m.email, m.role);

    const allEmails = new Set<string>([...currentMap.keys(), ...proposedMap.keys()]);
    for (const email of allEmails) {
      const before = currentMap.get(email);
      const after = proposedMap.get(email);
      if (before && !after) {
        memberChanges.push({type: 'remove', email, role: before});
      } else if (!before && after) {
        memberChanges.push({type: 'add', email, role: after});
      } else if (before && after && before !== after) {
        memberChanges.push({type: 'change', email, fromRole: before, toRole: after});
      }
    }
  }

  if (diffs.length === 0 && memberChanges.length === 0 && proposedVariants.length === 0) {
    return (
      <div className="rounded-lg border bg-card/50 p-6">
        <div className="text-center">
          <div className="text-sm font-semibold text-foreground mb-1">No changes proposed</div>
          <p className="text-sm text-muted-foreground">
            This proposal doesn&apos;t introduce any modifications to the config.
          </p>
        </div>
      </div>
    );
  }

  // Render config-level changes (description, members) in a separate card
  const hasConfigLevelChanges = diffs.length > 0 || memberChanges.length > 0;

  return (
    <div className="space-y-6">
      {/* Config-level changes card */}
      {hasConfigLevelChanges && (
        <div className="rounded-lg border bg-card/50 overflow-hidden">
          <div className="border-b bg-muted/30 px-6 py-4">
            <h3 className="text-base font-semibold text-foreground">Proposed changes</h3>
          </div>
          <div className="p-6 space-y-6">
            {memberChanges.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">Members</div>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  {memberChanges.map((change, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2',
                        change.type === 'add'
                          ? 'bg-green-50/50 dark:bg-green-950/20 border border-green-200/50 dark:border-green-900/30'
                          : change.type === 'remove'
                            ? 'bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30'
                            : 'bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30',
                      )}
                    >
                      {change.type === 'add' ? (
                        <Plus className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      ) : change.type === 'remove' ? (
                        <Minus className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground break-all">
                          {change.email}
                        </span>
                        {change.type === 'add' && (
                          <Badge
                            variant="outline"
                            className="capitalize bg-background/50 text-xs font-normal"
                          >
                            {change.role}
                          </Badge>
                        )}
                        {change.type === 'remove' && (
                          <Badge
                            variant="outline"
                            className="capitalize bg-background/50 text-xs font-normal line-through opacity-60"
                          >
                            {change.role}
                          </Badge>
                        )}
                        {change.type === 'change' && (
                          <>
                            <Badge
                              variant="outline"
                              className="capitalize bg-background/50 text-xs font-normal line-through opacity-60"
                            >
                              {change.fromRole}
                            </Badge>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <Badge
                              variant="outline"
                              className="capitalize bg-background/50 text-xs font-normal"
                            >
                              {change.toRole}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diffs.map(d => (
              <DiffRow
                key={d.title}
                title={d.title}
                before={d.before}
                after={d.after}
                language={d.title === 'Description' ? 'plaintext' : 'json'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Environment-specific changes cards */}
      {proposedVariants.map(variant => {
        const variantDiffs = [];

        // Check if useDefaultSchema changed
        const useDefaultSchemaChanged =
          variant.useDefaultSchema !== undefined &&
          variant.currentUseDefaultSchema !== undefined &&
          variant.useDefaultSchema !== variant.currentUseDefaultSchema;

        // Only show value if it actually changed
        if (
          variant.proposedValue !== undefined &&
          variant.currentValue !== undefined &&
          JSON.stringify(variant.proposedValue) !== JSON.stringify(variant.currentValue)
        ) {
          variantDiffs.push({
            title: 'Value',
            before: variant.currentValue,
            after: variant.proposedValue,
          });
        }

        // Only show schema if it actually changed
        if (
          variant.proposedSchema !== undefined &&
          variant.currentSchema !== undefined &&
          JSON.stringify(variant.proposedSchema) !== JSON.stringify(variant.currentSchema)
        ) {
          variantDiffs.push({
            title: 'Schema',
            before: variant.currentSchema,
            after: variant.proposedSchema,
          });
        }

        // Only show overrides if they actually changed
        if (
          variant.proposedOverrides !== undefined &&
          variant.currentOverrides !== undefined &&
          JSON.stringify(variant.proposedOverrides) !== JSON.stringify(variant.currentOverrides)
        ) {
          variantDiffs.push({
            title: 'Overrides',
            before: variant.currentOverrides,
            after: variant.proposedOverrides,
          });
        }

        if (variantDiffs.length === 0 && !useDefaultSchemaChanged) return null;

        return (
          <div
            key={variant.configVariantId}
            className="rounded-lg border bg-card/50 overflow-hidden"
          >
            <div className="border-b bg-muted/30 px-6 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Proposed changes ({variant.environmentName})
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Show "Inherit base schema" change if it changed */}
              {useDefaultSchemaChanged && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">Inherit base schema</div>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center gap-3">
                      <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs font-normal line-through opacity-60',
                            variant.currentUseDefaultSchema
                              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900',
                          )}
                        >
                          {variant.currentUseDefaultSchema ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs font-normal',
                            variant.useDefaultSchema
                              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900',
                          )}
                        >
                          {variant.useDefaultSchema ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {variantDiffs.map(d => (
                <DiffRow
                  key={d.title}
                  title={d.title}
                  before={d.before}
                  after={d.after}
                  language="json"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
