import {AppSidebar} from '@/components/app-sidebar';
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
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </ProjectProvider>
    </SidebarProvider>
  );
}
