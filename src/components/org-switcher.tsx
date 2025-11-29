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

export function OrgSwitcher() {
  const {isMobile} = useSidebar();
  const projectId = useProjectId();
  const organization = useOrganization();
  const {organizations, projects} = useProjects();

  // For each organization, find the first project to navigate to
  const orgLinks = useMemo(() => {
    return organizations.map(org => {
      const firstProjectInOrg = projects.find(p => p.organizationId === org.id);
      return {
        org,
        href: firstProjectInOrg
          ? `/app/projects/${firstProjectInOrg.id}/configs`
          : `/app/projects/${org.id}/new-project`,
      };
    });
  }, [organizations, projects]);

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
                <span className="truncate font-semibold">{organization.name}</span>
                <span className="truncate text-xs text-muted-foreground">Self-hosted</span>
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
              Organizations
            </DropdownMenuLabel>
            {orgLinks.map(({org, href}) => (
              <DropdownMenuItem asChild key={org.id} className="gap-2 p-2">
                <Link href={href}>{org.name}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 p-2">
              <Link href={`/app/projects/${projectId}/new-organization`}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <Plus className="size-4" />
                </div>
                <div className="text-muted-foreground font-medium">New organization</div>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
