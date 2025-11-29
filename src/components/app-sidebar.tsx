'use client';

import {BookOpen, FileCog, History, Key, LifeBuoy, Settings} from 'lucide-react';
import * as React from 'react';

import {useProject, useProjectId} from '@/app/app/projects/[projectId]/utils';
import {NavMain} from '@/components/nav-main';
import {NavSecondary} from '@/components/nav-secondary';
import {NavUser} from '@/components/nav-user';
import {SettingsDialog} from '@/components/settings-dialog';
import {Sidebar, SidebarContent, SidebarFooter, SidebarHeader} from '@/components/ui/sidebar';
import {ProjectSwitcher} from './project-switcher';

export function AppSidebar({...props}: React.ComponentProps<typeof Sidebar>) {
  const projectId = useProjectId();
  const project = useProject();
  const [showSettings, setShowSettings] = React.useState(false);

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
        onClick: () => setShowSettings(true),
      },
    ],
  };

  return (
    <>
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <ProjectSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={data.navMain} />
          <NavSecondary items={data.navSecondary} className="mt-auto" />
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        projectId={projectId}
        organizationId={project.organizationId}
      />
    </>
  );
}
