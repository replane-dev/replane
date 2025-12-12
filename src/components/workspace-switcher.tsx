'use client';

import {ChevronsUpDown, Plus} from 'lucide-react';
import Link from 'next/link';

import {useProjectId, useWorkspace} from '@/app/app/projects/[projectId]/utils';
import {CreateWorkspaceDialog} from '@/components/create-workspace-dialog';
import {ReplaneIcon} from '@/components/replane-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {SidebarMenu, SidebarMenuButton, SidebarMenuItem} from '@/components/ui/sidebar';
import {useProjects} from '@/contexts/project-context';
import {useMemo, useState} from 'react';

export function OrgSwitcher() {
  const projectId = useProjectId();
  const workspace = useWorkspace();
  const {workspaces, projects} = useProjects();
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  // For each workspace, find the first project to navigate to
  const workspaceLinks = useMemo(() => {
    return workspaces.map(ws => {
      const firstProjectInWorkspace = projects.find(p => p.workspaceId === ws.id);
      return {
        workspace: ws,
        // If no project exists, just use the workspace ID - the layout will handle showing the create project dialog
        href: firstProjectInWorkspace
          ? `/app/projects/${firstProjectInWorkspace.id}/configs`
          : `/app/projects/${projectId}/configs`,
      };
    });
  }, [workspaces, projects, projectId]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <ReplaneIcon className="size-5" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{workspace.name}</span>
                <span className="truncate text-xs text-muted-foreground">Workspace</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Workspaces
            </DropdownMenuLabel>
            {workspaceLinks.map(({workspace: ws, href}) => (
              <DropdownMenuItem asChild key={ws.id} className="gap-2 p-2">
                <Link href={href}>{ws.name}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onSelect={() => setCreateWorkspaceOpen(true)}>
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <Plus className="size-4" />
              </div>
              <div className="text-muted-foreground font-medium">New workspace</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <CreateWorkspaceDialog open={createWorkspaceOpen} onOpenChange={setCreateWorkspaceOpen} />
    </SidebarMenu>
  );
}
