'use client';

import {ConfigDetailView} from '@/components/config-detail-view';
import {ConfigListView} from '@/components/config-list-view';
import {NewConfigView} from '@/components/new-config-view';
import {DelayedFullWidthSpinner} from '@/components/spinner';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {Sheet, SheetContent} from '@/components/ui/sheet';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useRouter, useSearchParams} from 'next/navigation';
import {Fragment, Suspense, useCallback} from 'react';
import {useProjectId} from '../utils';

function getSheetStateFromUrl(searchParams: URLSearchParams): {
  open: boolean;
  mode: 'new' | 'detail';
  configName: string | null;
} {
  if (searchParams.has('new')) {
    return {open: true, mode: 'new', configName: null};
  }
  const configName = searchParams.get('config');
  if (configName) {
    return {open: true, mode: 'detail', configName};
  }
  return {open: false, mode: 'new', configName: null};
}

export default function ConfigPage() {
  const projectId = useProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive state from URL
  const urlState = getSheetStateFromUrl(searchParams);
  const sheetOpen = urlState.open;
  const sheetMode = urlState.mode;
  const selectedConfigName = urlState.configName;

  const updateUrl = useCallback(
    (mode: 'new' | 'detail' | 'closed', configName?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('new');
      params.delete('config');
      params.delete('list');

      if (mode === 'new') {
        params.set('new', '');
      } else if (mode === 'detail' && configName) {
        params.set('config', configName);
      }

      const query = params.toString();
      console.log('updateUrl', query);
      router.replace(query ? `?${query}` : '?list=true', {scroll: false});
    },
    [router, searchParams],
  );

  const handleConfigClick = useCallback(
    (configName: string) => {
      updateUrl('detail', configName);
    },
    [updateUrl],
  );

  const handleNewConfigClick = useCallback(() => {
    updateUrl('new');
  }, [updateUrl]);

  const handleSheetClose = useCallback(() => {
    updateUrl('closed');
  }, [updateUrl]);

  const handleConfigDeleted = () => {
    handleSheetClose();
    router.refresh();
  };

  return (
    <Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Configs</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ConfigListView onConfigClick={handleConfigClick} onNewConfigClick={handleNewConfigClick} />
      </div>

      <Sheet open={sheetOpen} onOpenChange={handleSheetClose}>
        <SheetContent side="right" className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl p-0">
          <Suspense fallback={<DelayedFullWidthSpinner />}>
            <div className="h-full overflow-y-auto px-6 pt-6">
              {sheetMode === 'new' ? (
                <NewConfigView
                  projectId={projectId}
                  onSuccess={handleSheetClose}
                  onCancel={handleSheetClose}
                />
              ) : selectedConfigName ? (
                <ConfigDetailView
                  projectId={projectId}
                  configName={selectedConfigName}
                  onDelete={async () => {
                    // We need to fetch the config data to use deleteOrPropose
                    handleConfigDeleted();
                  }}
                  onProposalCreated={proposalId => {
                    handleSheetClose();
                    router.push(
                      `/app/projects/${projectId}/configs/${encodeURIComponent(selectedConfigName)}/proposals/${proposalId}`,
                    );
                  }}
                />
              ) : null}
            </div>
          </Suspense>
        </SheetContent>
      </Sheet>
    </Fragment>
  );
}
