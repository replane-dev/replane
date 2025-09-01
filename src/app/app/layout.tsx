import {AppSidebar} from '@/components/app-sidebar';
import {SidebarInset, SidebarProvider} from '@/components/ui/sidebar';
import {HydrateClient} from '@/trpc/server';
import {Suspense} from 'react';
import {ErrorBoundary} from 'react-error-boundary';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <HydrateClient>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading...</div>}>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>{children}</SidebarInset>
          </SidebarProvider>
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
}
