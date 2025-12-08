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
import {useRouter} from 'next/navigation';
import {Fragment, Suspense, useState} from 'react';
import {useProjectId} from '../utils';
import {useDeleteOrProposeConfig} from './useDeleteOrPropose';

export default function ConfigPage() {
  const projectId = useProjectId();
  const router = useRouter();
  const deleteOrPropose = useDeleteOrProposeConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'new' | 'detail'>('new');
  const [selectedConfigName, setSelectedConfigName] = useState<string | null>(null);

  const handleConfigClick = (configName: string) => {
    setSelectedConfigName(configName);
    setSheetMode('detail');
    setSheetOpen(true);
  };

  const handleNewConfigClick = () => {
    setSheetMode('new');
    setSheetOpen(true);
  };

  const handleSheetClose = () => {
    setSheetOpen(false);
    // Wait for animation to complete before clearing state
    setTimeout(() => {
      setSelectedConfigName(null);
    }, 300);
  };

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
