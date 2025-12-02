'use client';

import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import {Skeleton} from '@/components/ui/skeleton';
import {Globe, Settings as SettingsIcon, User, Users} from 'lucide-react';
import * as React from 'react';
import {Suspense} from 'react';
import {AccountPreferencesSettings} from './settings/account-preferences-settings';
import {ProjectEnvironmentsSettings} from './settings/project-environments-settings';
import {ProjectGeneralSettings} from './settings/project-general-settings';
import {ProjectMembersSettings} from './settings/project-members-settings';
import {WorkspaceGeneralSettings} from './settings/workspace-general-settings';
import {WorkspaceMembersSettings} from './settings/workspace-members-settings';

type SettingsSection =
  | 'account-preferences'
  | 'org-general'
  | 'org-members'
  | 'project-general'
  | 'project-environments'
  | 'project-members';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workspaceId: string;
  initialSection?: SettingsSection;
}

export function SettingsDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
  initialSection = 'project-general',
}: SettingsDialogProps) {
  const [activeSection, setActiveSection] = React.useState<SettingsSection>(initialSection);

  const navSections = [
    {
      label: 'Account',
      items: [{name: 'Preferences', icon: User, section: 'account-preferences' as SettingsSection}],
    },
    {
      label: 'Workspace',
      items: [
        {name: 'General', icon: SettingsIcon, section: 'org-general' as SettingsSection},
        {name: 'Members', icon: Users, section: 'org-members' as SettingsSection},
      ],
    },
    {
      label: 'Project',
      items: [
        {name: 'General', icon: SettingsIcon, section: 'project-general' as SettingsSection},
        {name: 'Environments', icon: Globe, section: 'project-environments' as SettingsSection},
        {name: 'Members', icon: Users, section: 'project-members' as SettingsSection},
      ],
    },
  ];

  const getSectionTitle = (section: SettingsSection): {title: string; breadcrumb: string[]} => {
    const map: Record<SettingsSection, {title: string; breadcrumb: string[]}> = {
      'account-preferences': {title: 'Preferences', breadcrumb: ['Account', 'Preferences']},
      'org-general': {title: 'Workspace Settings', breadcrumb: ['Workspace', 'General']},
      'org-members': {title: 'Workspace Members', breadcrumb: ['Workspace', 'Members']},
      'project-general': {title: 'Project Settings', breadcrumb: ['Project', 'General']},
      'project-environments': {
        title: 'Project Environments',
        breadcrumb: ['Project', 'Environments'],
      },
      'project-members': {title: 'Project Members', breadcrumb: ['Project', 'Members']},
    };
    return map[section];
  };

  const sectionInfo = getSectionTitle(activeSection);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[900px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Customize your settings here.</DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex border-r">
            <SidebarContent>
              {navSections.map(group => (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map(item => (
                        <SidebarMenuItem key={item.section}>
                          <SidebarMenuButton
                            isActive={activeSection === item.section}
                            onClick={() => setActiveSection(item.section)}
                          >
                            <item.icon />
                            <span>{item.name}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[600px] flex-1 flex-col overflow-hidden py-4">
            <div className="flex flex-1 flex-col overflow-y-auto p-6">
              <Suspense fallback={<SettingsLoadingFallback />}>
                {activeSection === 'account-preferences' && <AccountPreferencesSettings />}
                {activeSection === 'org-general' && (
                  <WorkspaceGeneralSettings workspaceId={workspaceId} />
                )}
                {activeSection === 'org-members' && (
                  <WorkspaceMembersSettings workspaceId={workspaceId} />
                )}
                {activeSection === 'project-general' && (
                  <ProjectGeneralSettings projectId={projectId} />
                )}
                {activeSection === 'project-environments' && (
                  <ProjectEnvironmentsSettings projectId={projectId} />
                )}
                {activeSection === 'project-members' && (
                  <ProjectMembersSettings projectId={projectId} />
                )}
              </Suspense>
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}

// Loading Fallback
function SettingsLoadingFallback() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
