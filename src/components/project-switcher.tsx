'use client';

import {ChevronDown, Plus} from 'lucide-react';
import Link from 'next/link';

import {useProjectId, useWorkspace} from '@/app/app/projects/[projectId]/utils';
import {CreateProjectDialog} from '@/components/create-project-dialog';
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

export function ProjectSwitcher() {
  const projectId = useProjectId();
  const {projects: allProjects} = useProjects();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const workspace = useWorkspace();

  const workspaceProjects = useMemo(() => {
    return allProjects.filter(project => project.workspaceId === workspace.id);
  }, [allProjects, workspace.id]);

  const activeProject = useMemo(
    () => workspaceProjects.find(project => project.id === projectId),
    [workspaceProjects, projectId],
  );

  if (!activeProject) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          {/* <DropdownMenuTrigger asChild className="group/trigger">
            <SidebarMenuButton
              size="sm"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground h-9"
            >
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{activeProject.name}</span>
                <span className="truncate text-xs text-muted-foreground">Project</span>
              </div>
              <ChevronDown className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" />
            </SidebarMenuButton>
          </DropdownMenuTrigger> */}

          <DropdownMenuTrigger asChild className="group/trigger">
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-xs text-muted-foreground">Project</span>
                <span className="truncate font-semibold">{activeProject.name}</span>
              </div>
              <ChevronDown className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Projects
            </DropdownMenuLabel>
            {workspaceProjects.map(project => (
              <DropdownMenuItem asChild key={project.id} className="gap-2 p-2">
                <Link href={`/app/projects/${project.id}/configs`}>{project.name}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onSelect={() => setCreateProjectOpen(true)}>
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <Plus className="size-4" />
              </div>
              <div className="text-muted-foreground font-medium">New project</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        workspaceId={workspace.id}
        workspaceName={workspace.name}
      />
    </SidebarMenu>
  );
}
