'use client';

import {
  BookOpen,
  FileCog,
  History,
  Key,
  LifeBuoy,
  MessageSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {AnnouncementBanner} from '@/components/announcement-banner';
import {FeedbackDialog} from '@/components/feedback-dialog';
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
import {isSentryEnabled} from '@/lib/sentry-utils';

export interface SecondaryNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  target: '_blank' | '_self' | '_parent' | '_top';
  onClick?: (e: React.MouseEvent) => void;
}

export function AppSidebar({...props}: React.ComponentProps<typeof Sidebar>) {
  const projectId = useProjectId();
  const {showSettings} = useSettings();
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);

  // Check if Sentry is enabled by looking for the global config
  const sentryEnabled = isSentryEnabled();

  const navSecondaryItems: SecondaryNavItem[] = [
    {
      title: 'Documentation',
      url: 'https://replane.dev/docs',
      icon: BookOpen,
      target: '_blank' as const,
    },
    {
      title: 'Support',
      url: 'https://github.com/orgs/replane-dev/discussions/categories/q-a',
      icon: LifeBuoy,
      target: '_blank' as const,
    },
  ];

  // Add feedback item if Sentry is enabled
  if (sentryEnabled) {
    navSecondaryItems.push({
      title: 'Send Feedback',
      url: '#',
      icon: MessageSquare,
      target: undefined as any,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        setFeedbackOpen(true);
      },
    });
  }

  const data = {
    navSecondary: navSecondaryItems,
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
    <>
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <OrgSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="-mb-5 -mt-2">
            <ProjectSwitcher />
          </SidebarGroup>
          <div className="ml-2">
            <NavMain items={data.navMain} />
          </div>
          <div className="mt-auto flex flex-col">
            <AnnouncementBanner />
            <NavSecondary items={data.navSecondary} />
          </div>
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>

      {sentryEnabled && <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />}
    </>
  );
}
