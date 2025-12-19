'use client';

import {AppSidebar} from '@/components/app-sidebar';
import {SettingsProvider} from '@/components/settings-context';
import {SidebarInset, SidebarProvider} from '@/components/ui/sidebar';
import {AppProvider} from '@/contexts/app-context';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <AppProvider>
        <SettingsProvider>
          <AppSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SettingsProvider>
      </AppProvider>
    </SidebarProvider>
  );
}
