'use client';

import {AppSidebar} from '@/components/app-sidebar';
import {SidebarInset, SidebarProvider} from '@/components/ui/sidebar';
import {ProjectProvider} from '@/contexts/project-context';
import {REPLANE_USER_VISITED_KEY} from '@/lib/constants';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect} from 'react';
import {useProject} from './utils';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Mark user as visited when they successfully reach the app
  useEffect(() => {
    localStorage.setItem(REPLANE_USER_VISITED_KEY, 'true');
  }, []);

  return (
    <SidebarProvider>
      <ProjectProvider>
        <AppSidebar />
        <SidebarInset>
          <AppLayoutInner>{children}</AppLayoutInner>
        </SidebarInset>
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

  const isNewProjectRoute = usePathname().endsWith(`/app/projects/${project.id}/new-project`);

  return (
    <>
      {project.isExample && !isNewProjectRoute && (
        <div className="m-4 rounded-md bg-yellow-50 p-4 text-sm text-yellow-800 ring-1 ring-yellow-700/10">
          You are currently viewing an example project. To create your own project and start
          managing your configurations, please{' '}
          <Link
            href={`/app/projects/${project.id}/new-project`}
            className="underline underline-offset-2"
          >
            create a new one
          </Link>
          .
        </div>
      )}
      {children}
    </>
  );
}
