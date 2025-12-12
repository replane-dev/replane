'use client';

import {ConfigDetailView} from '@/components/config-detail-view';
import {ConfigTable} from '@/components/config-table';
import {NewConfigView} from '@/components/new-config-view';
import {DelayedFullWidthSpinner} from '@/components/spinner';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {Sheet, SheetContent, SheetDescription, SheetTitle} from '@/components/ui/sheet';
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

function getDialogStateFromUrl(searchParams: URLSearchParams): {
  showSdkGuide: boolean;
  showCodegen: boolean;
} {
  return {
    showSdkGuide: searchParams.has('sdk-guide'),
    showCodegen: searchParams.has('codegen'),
  };
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

  const dialogState = getDialogStateFromUrl(searchParams);
  const showSdkGuide = dialogState.showSdkGuide;
  const showCodegen = dialogState.showCodegen;

  const updateUrl = useCallback(
    (mode: 'new' | 'detail' | 'closed' | 'sdk-guide' | 'codegen', configName?: string) => {
      const params = new URLSearchParams(window.location.search);
      params.delete('new');
      params.delete('config');
      params.delete('list');
      params.delete('sdk-guide');
      params.delete('codegen');

      if (mode === 'new') {
        params.set('new', '');
      } else if (mode === 'detail' && configName) {
        params.set('config', configName);
      } else if (mode === 'sdk-guide') {
        params.set('sdk-guide', '');
      } else if (mode === 'codegen') {
        params.set('codegen', '');
      }

      const query = params.toString();
      const newUrl = query ? `?${query}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    },
    [],
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

  const handleSdkGuideClick = useCallback(() => {
    updateUrl('sdk-guide');
  }, [updateUrl]);

  const handleCodegenClick = useCallback(() => {
    updateUrl('codegen');
  }, [updateUrl]);

  const handleSdkGuideChange = useCallback(
    (open: boolean) => {
      updateUrl(open ? 'sdk-guide' : 'closed');
    },
    [updateUrl],
  );

  const handleCodegenChange = useCallback(
    (open: boolean) => {
      updateUrl(open ? 'codegen' : 'closed');
    },
    [updateUrl],
  );

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
        <ConfigTable
          onConfigClick={handleConfigClick}
          onNewConfigClick={handleNewConfigClick}
          showSdkGuide={showSdkGuide}
          showCodegen={showCodegen}
          onSdkGuideClick={handleSdkGuideClick}
          onCodegenClick={handleCodegenClick}
          onSdkGuideChange={handleSdkGuideChange}
          onCodegenChange={handleCodegenChange}
        />
      </div>

      <Sheet open={sheetOpen} onOpenChange={handleSheetClose}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl p-0"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <SheetTitle className="sr-only">
            {sheetMode === 'new' ? 'New Config' : (selectedConfigName ?? 'Config Details')}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {sheetMode === 'new'
              ? 'Create a new configuration'
              : `View and edit configuration: ${selectedConfigName}`}
          </SheetDescription>
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
