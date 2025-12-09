'use client';

import {BookOpen, FileCog, History, Key, LifeBuoy, Settings} from 'lucide-react';
import * as React from 'react';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {NavMain} from '@/components/nav-main';
import {NavSecondary} from '@/components/nav-secondary';
import {NavUser} from '@/components/nav-user';
import {ProjectSwitcher} from '@/components/project-switcher';
import {useSettings} from '@/components/settings-context';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from '@/components/ui/sidebar';
import {OrgSwitcher} from '@/components/workspace-switcher';

export function AppSidebar({...props}: React.ComponentProps<typeof Sidebar>) {
  const projectId = useProjectId();
  const {showSettings} = useSettings();

  const data = {
    navSecondary: [
      {
        title: 'Documentation',
        url: 'https://replane.dev/docs',
        icon: BookOpen,
        target: '_blank' as const,
      },
      {
        title: 'Support',
        url: 'https://github.com/replane-dev/replane/issues',
        icon: LifeBuoy,
        target: '_blank' as const,
      },
    ],
    navMain: [
      {
        name: 'Configs',
        url: `/app/projects/${projectId}/configs`,
        icon: FileCog,
      },
      {
        name: 'SDK keys',
        url: `/app/projects/${projectId}/sdk-keys`,
        icon: Key,
      },
      {
        name: 'Audit log',
        url: `/app/projects/${projectId}/audit-log`,
        icon: History,
      },
      {
        name: 'Settings',
        icon: Settings,
        onClick: () => showSettings(),
      },
    ],
  };

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="space-y-2">
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="-mb-5 -mt-2">
          <ProjectSwitcher />
        </SidebarGroup>
        <div className="ml-2">
          <NavMain items={data.navMain} />
        </div>
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
