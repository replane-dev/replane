'use client';

import {ApiKeyExplainer} from '@/components/api-key-explainer';
import {ApiKeysTable} from '@/components/api-keys-table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useParams} from 'next/navigation';
import {Fragment} from 'react';

export default function SdkKeysPage() {
  const {projectId} = useParams<{projectId: string}>();
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
          <ApiKeyExplainer />
          <ApiKeysTable projectId={projectId} />
        </div>
      </div>
    </Fragment>
  );
}

