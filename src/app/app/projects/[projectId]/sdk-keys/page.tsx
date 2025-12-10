'use client';

import {NewSdkKeyView} from '@/components/new-sdk-key-view';
import {SdkKeyDetailView} from '@/components/sdk-key-detail-view';
import {SdkKeyExplainer} from '@/components/sdk-key-explainer';
import {SdkKeysTable} from '@/components/sdk-keys-table';
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
  sdkKeyId: string | null;
} {
  if (searchParams.has('new')) {
    return {open: true, mode: 'new', sdkKeyId: null};
  }
  const sdkKeyId = searchParams.get('key');
  if (sdkKeyId) {
    return {open: true, mode: 'detail', sdkKeyId};
  }
  return {open: false, mode: 'new', sdkKeyId: null};
}

export default function SdkKeysPage() {
  const projectId = useProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive state from URL
  const urlState = getSheetStateFromUrl(searchParams);
  const sheetOpen = urlState.open;
  const sheetMode = urlState.mode;
  const selectedSdkKeyId = urlState.sdkKeyId;

  const updateUrl = useCallback((mode: 'new' | 'detail' | 'closed', sdkKeyId?: string) => {
    const params = new URLSearchParams(window.location.search);
    params.delete('new');
    params.delete('key');
    params.delete('list');

    if (mode === 'new') {
      params.set('new', '');
    } else if (mode === 'detail' && sdkKeyId) {
      params.set('key', sdkKeyId);
    }

    const query = params.toString();
    const newUrl = query ? `?${query}` : '?list=true';
    window.history.replaceState(null, '', newUrl);
  }, []);

  const handleSdkKeyClick = useCallback(
    (sdkKeyId: string) => {
      updateUrl('detail', sdkKeyId);
    },
    [updateUrl],
  );

  const handleNewSdkKeyClick = useCallback(() => {
    updateUrl('new');
  }, [updateUrl]);

  const handleSheetClose = useCallback(() => {
    updateUrl('closed');
  }, [updateUrl]);

  const handleSdkKeyDeleted = () => {
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
                <BreadcrumbPage>SDK Keys</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-4xl space-y-4">
          <SdkKeyExplainer />
          <SdkKeysTable
            projectId={projectId}
            onSdkKeyClick={handleSdkKeyClick}
            onNewSdkKeyClick={handleNewSdkKeyClick}
          />
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={handleSheetClose}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl p-0"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <SheetTitle className="sr-only">
            {sheetMode === 'new' ? 'New SDK Key' : 'SDK Key Details'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {sheetMode === 'new'
              ? 'Create a new SDK key'
              : `View and manage SDK key: ${selectedSdkKeyId}`}
          </SheetDescription>
          <Suspense fallback={<DelayedFullWidthSpinner />}>
            <div className="h-full overflow-y-auto px-6 pt-6">
              {sheetMode === 'new' ? (
                <NewSdkKeyView
                  projectId={projectId}
                  onSuccess={handleSheetClose}
                  onCancel={handleSheetClose}
                />
              ) : selectedSdkKeyId ? (
                <SdkKeyDetailView
                  projectId={projectId}
                  id={selectedSdkKeyId}
                  onDelete={handleSdkKeyDeleted}
                />
              ) : null}
            </div>
          </Suspense>
        </SheetContent>
      </Sheet>
    </Fragment>
  );
}
