'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/components/ui/collapsible';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {useOrg} from '@/contexts/org-context';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {ChevronDown, Info, Plus, Trash2, Users} from 'lucide-react';

export type ConfigMember = {
  email: string;
  role: 'maintainer' | 'editor';
};

export interface ConfigMemberListProps {
  members: ConfigMember[];
  onChange: (members: ConfigMember[]) => void;
  disabled?: boolean;
  errors?: Array<{email?: {message?: string}; role?: {message?: string}} | undefined>;
}

export function ConfigMemberList({
  members,
  onChange,
  disabled = false,
  errors = [],
}: ConfigMemberListProps) {
  const {requireProposals} = useOrg();
  const projectId = useProjectId();
  const trpc = useTRPC();
  const projectUsersQuery = trpc.getProjectUsers.queryOptions({projectId});
  const {data: projectUsersData} = useSuspenseQuery({...projectUsersQuery});

  // Filter to only admins and members (project members who can approve)
  const projectMaintainers = (projectUsersData.users ?? []).filter(
    (u: {email: string; role: 'admin' | 'maintainer'}) =>
      u.role === 'admin' || u.role === 'maintainer',
  );

  const handleEmailChange = (idx: number, email: string) => {
    const updated = [...members];
    updated[idx] = {...updated[idx], email};
    onChange(updated);
  };

  const handleRoleChange = (idx: number, role: 'maintainer' | 'editor') => {
    const updated = [...members];
    updated[idx] = {...updated[idx], role};
    onChange(updated);
  };

  const handleRemove = (idx: number) => {
    const updated = members.filter((_, i) => i !== idx);
    onChange(updated);
  };

  const handleAdd = () => {
    const updated = [...members, {email: '', role: 'editor' as const}];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {projectMaintainers.length > 0 && (
        <Collapsible defaultOpen={false} className="group">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between h-auto py-3 px-4 hover:bg-accent/50"
            >
              <div className="flex items-center gap-3 text-left">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {projectMaintainers.length === 1
                      ? '1 project member'
                      : `${projectMaintainers.length} project members`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {requireProposals
                      ? 'Can approve proposals for any config'
                      : 'Can approve proposals or edit any config'}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-md border bg-card/50 p-4 mt-3 space-y-2">
              {projectMaintainers.map(
                (maintainer: {email: string; role: 'admin' | 'maintainer'}, idx: number) => (
                  <div
                    key={maintainer.email || idx}
                    className="flex items-center justify-between gap-3 py-2 px-2 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-foreground">{maintainer.email}</span>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {maintainer.role}
                    </Badge>
                  </div>
                ),
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-4">
        <div className="flex items-start gap-3">
          <Info className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="text-sm font-semibold text-foreground mb-2">Config member roles</div>
              <div className="space-y-2.5 text-sm text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground">Maintainer</span>:
                  {requireProposals
                    ? ' Can approve all proposals. Can edit config value, description, schema, and manage maintainers.'
                    : ' Full access. Can edit config value, description, schema, and manage maintainers.'}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Editor</span>:
                  {requireProposals
                    ? ' Can approve proposals with value changes only. Can edit config value and description but cannot modify schema or maintainers.'
                    : ' Can edit config value and description but cannot modify schema or maintainers.'}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Everyone else</span>: Can create
                  config change proposals for maintainers to review and approve.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {members.length > 0 && (
        <div className="space-y-3">
          {members.map((maintainer, idx) => {
            const fieldError = errors[idx];
            const hasEmailError = !!fieldError?.email?.message;

            return (
              <div key={idx} className="space-y-2">
                <div
                  className={`flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors ${
                    hasEmailError ? 'border-destructive' : ''
                  }`}
                >
                  <Input
                    placeholder="Email"
                    value={maintainer.email}
                    onChange={e => handleEmailChange(idx, e.target.value)}
                    className={`min-w-[260px] flex-1 ${hasEmailError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    readOnly={disabled}
                    aria-readonly={disabled}
                    aria-invalid={hasEmailError}
                  />
                  <Select
                    value={maintainer.role}
                    onValueChange={(val: 'maintainer' | 'editor') => handleRoleChange(idx, val)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maintainer">Maintainer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(idx)}
                    title="Remove"
                    disabled={disabled}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {hasEmailError && (
                  <p className="text-sm text-destructive px-3">{fieldError?.email?.message}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div>
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={disabled}>
          <Plus className="mr-1 h-4 w-4" /> Add config member
        </Button>
      </div>
    </div>
  );
}
