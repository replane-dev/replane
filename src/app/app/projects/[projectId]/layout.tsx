'use client';

import {AppSidebar} from '@/components/app-sidebar';
import {SettingsProvider} from '@/components/settings-context';
import {SidebarInset, SidebarProvider} from '@/components/ui/sidebar';
import {ProjectProvider} from '@/contexts/project-context';

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
          <SidebarInset>{children}</SidebarInset>
        </SettingsProvider>
      </ProjectProvider>
    </SidebarProvider>
  );
}
