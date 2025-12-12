'use client';

import {AppSidebar} from '@/components/app-sidebar';
import {SettingsProvider} from '@/components/settings-context';
import {SidebarInset, SidebarProvider} from '@/components/ui/sidebar';
import {ProjectProvider} from '@/contexts/project-context';
import {useProject} from './utils';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <ProjectProvider>
        <SettingsProvider>
          <AppSidebar />
          <SidebarInset>
            <AppLayoutInner>{children}</AppLayoutInner>
          </SidebarInset>
        </SettingsProvider>
      </ProjectProvider>
    </SidebarProvider>
  );
}

function AppLayoutInner({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const project = useProject();

  return (
    <>
      {project.isExample && (
        <div className="m-4 rounded-md bg-yellow-50 p-4 text-sm text-yellow-800 ring-1 ring-yellow-700/10">
          You are currently viewing an example project. To create your own project and start
          managing your configurations, please use the "New project" option in the sidebar.
        </div>
      )}
      {children}
    </>
  );
}
