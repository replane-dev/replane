'use client';

import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {cn} from '@/lib/utils';
import {DiffEditor} from '@monaco-editor/react';
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
    <div className="space-y-1">
      <div className="text-sm font-medium">{title}</div>
      <div className={cn('rounded-md border bg-muted/20')}>
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

export interface ConfigProposalDiffProps {
  current: {
    value: unknown;
    description: string;
    schema: unknown | null;
    owners?: string[];
    editors?: string[];
  };
  proposed: {
    value?: {newValue?: unknown} | null;
    description?: string | null;
    schema?: {newSchema?: unknown} | null;
    members?: {newMembers?: Array<{email: string; role: 'owner' | 'editor' | 'viewer'}>} | null;
  };
}

export function ConfigProposalDiff({current, proposed}: ConfigProposalDiffProps) {
  const diffs: Array<{title: string; before: unknown; after: unknown}> = [];
  if (proposed.value)
    diffs.push({title: 'Value', before: current.value, after: proposed.value.newValue});
  if (proposed.description !== undefined && proposed.description !== null)
    diffs.push({title: 'Description', before: current.description, after: proposed.description});
  if (proposed.schema)
    diffs.push({title: 'Schema', before: current.schema, after: proposed.schema.newSchema});

  // Members diff (owners/editors)
  const membersChanges: Array<string> = [];
  if (proposed.members && proposed.members.newMembers) {
    const currentMap = new Map<string, 'owner' | 'editor' | 'viewer'>();
    (current.owners ?? []).forEach(e => currentMap.set(e, 'owner'));
    (current.editors ?? []).forEach(e => currentMap.set(e, 'editor'));

    const proposedMap = new Map<string, 'owner' | 'editor' | 'viewer'>();
    for (const m of proposed.members.newMembers) proposedMap.set(m.email, m.role);

    const allEmails = new Set<string>([...currentMap.keys(), ...proposedMap.keys()]);
    const adds: string[] = [];
    const removes: string[] = [];
    const roleChanges: string[] = [];
    for (const email of allEmails) {
      const before = currentMap.get(email);
      const after = proposedMap.get(email);
      if (before && !after) removes.push(`${email} (${before})`);
      else if (!before && after) adds.push(`${email} (${after})`);
      else if (before && after && before !== after)
        roleChanges.push(`${email}: ${before} → ${after}`);
    }
    if (adds.length) membersChanges.push(`Add: ${adds.join(', ')}`);
    if (removes.length) membersChanges.push(`Remove: ${removes.join(', ')}`);
    if (roleChanges.length) membersChanges.push(`Change: ${roleChanges.join(', ')}`);
  }

  if (diffs.length === 0 && membersChanges.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No changes proposed</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proposed changes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {diffs.map(d => (
          <DiffRow
            key={d.title}
            title={d.title}
            before={d.before}
            after={d.after}
            language={d.title === 'Description' ? 'plaintext' : 'json'}
          />
        ))}
        {membersChanges.length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Members</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {membersChanges.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
