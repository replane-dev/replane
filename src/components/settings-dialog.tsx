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
import {useAppContext} from '@/contexts/app-context';
import {Globe, Mail, Palette, Settings as SettingsIcon, Users} from 'lucide-react';
import * as React from 'react';
import {Suspense} from 'react';
import {AccountAppearanceSettings} from './settings/account-appearance-settings';
import {AccountEmailPreferencesSettings} from './settings/account-email-preferences-settings';
import {AccountGeneralSettings} from './settings/account-general-settings';
import {ProjectEnvironmentsSettings} from './settings/project-environments-settings';
import {ProjectGeneralSettings} from './settings/project-general-settings';
import {ProjectMembersSettings} from './settings/project-members-settings';
import {WorkspaceGeneralSettings} from './settings/workspace-general-settings';
import {WorkspaceMembersSettings} from './settings/workspace-members-settings';

type SettingsSection =
  | 'account-general'
  | 'account-appearance'
  | 'account-email-preferences'
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
  const {isEmailServerConfigured} = useAppContext();

  // Update active section when initialSection changes and dialog opens
  React.useEffect(() => {
    if (open) {
      setActiveSection(initialSection);
    }
  }, [open, initialSection]);

  const navSections = React.useMemo(
    () => [
      {
        label: 'Account',
        items: [
          {name: 'General', icon: SettingsIcon, section: 'account-general' as SettingsSection},
          {name: 'Appearance', icon: Palette, section: 'account-appearance' as SettingsSection},
          ...(isEmailServerConfigured
            ? [
                {
                  name: 'Email Preferences',
                  icon: Mail,
                  section: 'account-email-preferences' as SettingsSection,
                },
              ]
            : []),
        ],
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
    ],
    [isEmailServerConfigured],
  );

  const getSectionTitle = (section: SettingsSection): {title: string; breadcrumb: string[]} => {
    const map: Record<SettingsSection, {title: string; breadcrumb: string[]}> = {
      'account-general': {title: 'Account', breadcrumb: ['Account', 'General']},
      'account-appearance': {title: 'Appearance', breadcrumb: ['Account', 'Appearance']},
      'account-email-preferences': {
        title: 'Email Preferences',
        breadcrumb: ['Account', 'Email Preferences'],
      },
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
                {activeSection === 'account-general' && <AccountGeneralSettings />}
                {activeSection === 'account-appearance' && <AccountAppearanceSettings />}
                {activeSection === 'account-email-preferences' && isEmailServerConfigured && (
                  <AccountEmailPreferencesSettings />
                )}
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
