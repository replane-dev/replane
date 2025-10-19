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
  };
  proposed: {
    value?: {newValue?: unknown} | null;
    description?: string | null;
    schema?: {newSchema?: unknown} | null;
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

  if (diffs.length === 0) {
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
      </CardContent>
    </Card>
  );
}
