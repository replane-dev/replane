'use client';

import {ChevronsUpDown, Plus} from 'lucide-react';
import Link from 'next/link';

import {useOrganization, useProjectId} from '@/app/app/projects/[projectId]/utils';
import {ReplaneIcon} from '@/components/replane-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar} from '@/components/ui/sidebar';
import {useProjects} from '@/contexts/project-context';
import {useMemo} from 'react';

export function ProjectSwitcher() {
  const {isMobile} = useSidebar();
  const projectId = useProjectId();
  const {projects} = useProjects();
  const {name: organizationName} = useOrganization();

  const activeProject = useMemo(
    () => projects.find(project => project.id === projectId),
    [projects, projectId],
  );

  if (!activeProject) {
    return null;
  }

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
                <span className="truncate font-medium">{activeProject.name}</span>
                {organizationName ? (
                  <span className="truncate text-xs">{organizationName}</span>
                ) : null}
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Projects
            </DropdownMenuLabel>
            {projects.map(project => (
              <DropdownMenuItem asChild key={project.id} className="gap-2 p-2">
                <Link href={`/app/projects/${project.id}/configs`}>{project.name}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 p-2">
              <Link href={`/app/projects/${projectId}/new-project`}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <Plus className="size-4" />
                </div>
                <div className="text-muted-foreground font-medium">Add project</div>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
