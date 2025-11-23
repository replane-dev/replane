'use client';

import type {AuditMessagePayload} from '@/engine/core/audit-message-store';
import {assertNever} from '@/engine/core/utils';
import {DiffEditor} from '@monaco-editor/react';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileKey,
  FileText,
  GitBranch,
  Minus,
  Plus,
  Settings,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {Badge} from './ui/badge';

interface AuditEventDisplayProps {
  payload: AuditMessagePayload;
  projectId: string;
}

function stringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function DiffRow({
  label,
  before,
  after,
  language = 'json',
}: {
  label: string;
  before: unknown;
  after: unknown;
  language?: 'json' | 'plaintext';
}) {
  const beforeStr = React.useMemo(() => stringify(before), [before]);
  const afterStr = React.useMemo(() => stringify(after), [after]);

  if (beforeStr === afterStr) return null;

  // Calculate height based on content
  const lines = Math.max(beforeStr.split('\n').length, afterStr.split('\n').length);
  const height = Math.min(Math.max(lines * 19 + 40, 100), 400);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="rounded-lg border bg-card/50 overflow-hidden">
        <DiffEditor
          original={beforeStr}
          modified={afterStr}
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
            scrollbar: {alwaysConsumeMouseWheel: false},
            fontSize: 12,
          }}
        />
      </div>
    </div>
  );
}

function MemberChangesList({
  added,
  removed,
}: {
  added: Array<{email: string; role: string}>;
  removed: Array<{email: string; role: string}>;
}) {
  if (added.length === 0 && removed.length === 0) return null;

  return (
    <div className="space-y-3">
      {added.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            Added Members
          </div>
          <div className="space-y-2">
            {added.map((member, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md px-3 py-2 bg-green-50/50 dark:bg-green-950/20 border border-green-200/50 dark:border-green-900/30"
              >
                <span className="text-sm font-medium text-foreground flex-1">{member.email}</span>
                <Badge variant="outline" className="text-xs capitalize bg-background/50">
                  {member.role}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      {removed.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Minus className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            Removed Members
          </div>
          <div className="space-y-2">
            {removed.map((member, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md px-3 py-2 bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30"
              >
                <span className="text-sm font-medium text-foreground flex-1 line-through opacity-70">
                  {member.email}
                </span>
                <Badge
                  variant="outline"
                  className="text-xs capitalize bg-background/50 line-through opacity-60"
                >
                  {member.role}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AuditEventDisplay({payload, projectId}: AuditEventDisplayProps) {
  const type = payload.type;

  if (type === 'config_created') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <Plus className="h-5 w-5" />
          <span className="font-semibold">Config Created</span>
        </div>
        <Link
          href={`/app/projects/${projectId}/configs/${encodeURIComponent(payload.config.name)}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
        >
          <span>{payload.config.name}</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
        </Link>
        <div className="grid gap-2 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Description:</span>
            <span>{payload.config.description || '—'}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Version:</span>
            <Badge variant="outline" className="text-xs">
              {payload.config.version}
            </Badge>
          </div>
        </div>
      </div>
    );
  } else if (type === 'config_updated') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">Config Updated</span>
        </div>
        <div className="flex items-center justify-between">
          <Link
            href={`/app/projects/${projectId}/configs/${encodeURIComponent(payload.after.name)}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
          >
            <span>{payload.after.name}</span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
          </Link>
          <div className="text-sm text-muted-foreground">
            Version: {payload.before.version} → {payload.after.version}
          </div>
        </div>
        <div className="space-y-4">
          <DiffRow label="Value" before={payload.before.value} after={payload.after.value} />
          <DiffRow
            label="Description"
            before={payload.before.description}
            after={payload.after.description}
            language="plaintext"
          />
          <DiffRow label="Schema" before={payload.before.schema} after={payload.after.schema} />
          <DiffRow
            label="Overrides"
            before={payload.before.overrides}
            after={payload.after.overrides}
          />
        </div>
      </div>
    );
  } else if (type === 'config_deleted') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="h-5 w-5" />
          <span className="font-semibold">Config Deleted</span>
        </div>
        <div className="text-sm font-semibold text-foreground">{payload.config.name}</div>
        <div className="grid gap-2 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Description:</span>
            <span>{payload.config.description || '—'}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Version:</span>
            <Badge variant="outline" className="text-xs">
              {payload.config.version}
            </Badge>
          </div>
        </div>
      </div>
    );
  } else if (type === 'config_members_changed') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">Config Members Changed</span>
        </div>
        <Link
          href={`/app/projects/${projectId}/configs/${encodeURIComponent(payload.config.name)}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
        >
          <span>{payload.config.name}</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
        </Link>
        <MemberChangesList added={payload.added} removed={payload.removed} />
      </div>
    );
  } else if (type === 'config_proposal_created') {
    const configName = (payload as any).configName;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">Proposal Created</span>
        </div>
        <Link
          href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName || 'unknown')}/proposals/${payload.proposalId}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
        >
          <span>View Proposal</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
        </Link>
        {payload.message && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">Message:</div>
            <p className="text-sm text-foreground/80 dark:text-foreground/70 whitespace-pre-wrap">
              {payload.message}
            </p>
          </div>
        )}
        <div className="space-y-2">
          {payload.proposedDelete && (
            <Badge variant="destructive" className="text-xs">
              Deletion Proposal
            </Badge>
          )}
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Changes proposed:</span>
            <ul className="mt-2 space-y-1 pl-4">
              {payload.proposedValue && <li>• Value change</li>}
              {payload.proposedDescription !== undefined && <li>• Description change</li>}
              {payload.proposedSchema && <li>• Schema change</li>}
              {payload.proposedOverrides && <li>• Overrides change</li>}
              {payload.proposedMembers && <li>• Members change</li>}
            </ul>
          </div>
        </div>
      </div>
    );
  } else if (type === 'config_proposal_approved') {
    const configName = (payload as any).configName;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Proposal Approved</span>
        </div>
        <Link
          href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName || 'unknown')}/proposals/${payload.proposalId}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
        >
          <span>View Proposal</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
        </Link>
        {payload.proposedDelete && (
          <Badge variant="destructive" className="text-xs">
            Config Was Deleted
          </Badge>
        )}
        {!payload.proposedDelete && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Changes applied:</span>
            <ul className="mt-2 space-y-1 pl-4">
              {payload.proposedValue && <li>• Value updated</li>}
              {payload.proposedDescription !== undefined && <li>• Description updated</li>}
              {payload.proposedSchema && <li>• Schema updated</li>}
              {payload.proposedOverrides && <li>• Overrides updated</li>}
              {payload.proposedMembers && <li>• Members updated</li>}
            </ul>
          </div>
        )}
      </div>
    );
  } else if (type === 'config_proposal_rejected') {
    const configName = (payload as any).configName;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
          <XCircle className="h-5 w-5" />
          <span className="font-semibold">Proposal Rejected</span>
        </div>
        <Link
          href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName || 'unknown')}/proposals/${payload.proposalId}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
        >
          <span>View Proposal</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
        </Link>
        {payload.rejectedInFavorOfProposalId && (
          <div className="text-sm">
            <span className="text-muted-foreground">Rejected in favor of: </span>
            <Link
              href={`/app/projects/${projectId}/configs/${encodeURIComponent(configName || 'unknown')}/proposals/${payload.rejectedInFavorOfProposalId}`}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:text-foreground/80 group"
            >
              <span className="font-mono text-xs">{payload.rejectedInFavorOfProposalId}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-foreground/60" />
            </Link>
          </div>
        )}
      </div>
    );
  } else if (type === 'api_key_created') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <FileKey className="h-5 w-5" />
          <span className="font-semibold">API Key Created</span>
        </div>
        <Link
          href={`/app/projects/${projectId}/api-keys/${payload.apiKey.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
        >
          <span>{payload.apiKey.name}</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
        </Link>
        {payload.apiKey.description && (
          <div className="text-sm">
            <span className="text-muted-foreground">Description: </span>
            <span>{payload.apiKey.description}</span>
          </div>
        )}
      </div>
    );
  } else if (type === 'api_key_deleted') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="h-5 w-5" />
          <span className="font-semibold">API Key Deleted</span>
        </div>
        <div className="text-sm font-semibold text-foreground">{payload.apiKey.name}</div>
        {payload.apiKey.description && (
          <div className="text-sm">
            <span className="text-muted-foreground">Description: </span>
            <span>{payload.apiKey.description}</span>
          </div>
        )}
      </div>
    );
  } else if (type === 'project_created') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <Plus className="h-5 w-5" />
          <span className="font-semibold">Project Created</span>
        </div>
        <div className="text-sm font-semibold text-foreground">{payload.project.name}</div>
        <div className="text-sm">
          <span className="text-muted-foreground">Description: </span>
          <span>{payload.project.description || '—'}</span>
        </div>
      </div>
    );
  } else if (type === 'project_updated') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">Project Updated</span>
        </div>
        <div className="space-y-4">
          <DiffRow
            label="Name"
            before={payload.before.name}
            after={payload.after.name}
            language="plaintext"
          />
          <DiffRow
            label="Description"
            before={payload.before.description}
            after={payload.after.description}
            language="plaintext"
          />
        </div>
      </div>
    );
  } else if (type === 'project_deleted') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="h-5 w-5" />
          <span className="font-semibold">Project Deleted</span>
        </div>
        <div className="text-sm font-semibold text-foreground">{payload.project.name}</div>
      </div>
    );
  } else if (type === 'project_members_changed') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">Project Members Changed</span>
        </div>
        <MemberChangesList added={payload.added} removed={payload.removed} />
      </div>
    );
  } else if (type === 'config_version_restored') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">Config Version Restored</span>
        </div>
        <Link
          href={`/app/projects/${projectId}/configs/${encodeURIComponent(payload.after.name)}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors group"
        >
          <span>{payload.after.name}</span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground/60" />
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Version:</span>
          <Badge variant="outline" className="text-xs">
            {payload.restoredFromVersion}
          </Badge>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant="outline" className="text-xs">
            {payload.after.version}
          </Badge>
        </div>
        <div className="space-y-4">
          <DiffRow label="Value" before={payload.before.value} after={payload.after.value} />
          <DiffRow
            label="Description"
            before={payload.before.description}
            after={payload.after.description}
            language="plaintext"
          />
          <DiffRow label="Schema" before={payload.before.schema} after={payload.after.schema} />
          <DiffRow
            label="Overrides"
            before={payload.before.overrides}
            after={payload.after.overrides}
          />
        </div>
      </div>
    );
  } else {
    assertNever(type, 'Unhandled audit event type');
  }
}
