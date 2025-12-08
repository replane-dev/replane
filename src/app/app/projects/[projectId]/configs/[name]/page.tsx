'use client';

import {ConfigDetailView} from '@/components/config-detail-view';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import Link from 'next/link';
import {useParams, useRouter} from 'next/navigation';
import {Fragment} from 'react';
import {useProject, useProjectId} from '../../utils';

export default function ConfigByNamePage() {
  const router = useRouter();
  const {name: nameParam} = useParams<{name: string}>();
  const name = decodeURIComponent(nameParam ?? '');
  const projectId = useProjectId();
  const project = useProject();

  return (
    <Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href={`/app/projects/${project.id}/configs`}>Configs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-3xl">
          <ConfigDetailView
            projectId={projectId}
            configName={name}
            onDelete={() => {
              router.push(`/app/projects/${projectId}/configs`);
            }}
            onProposalCreated={proposalId => {
              router.push(
                `/app/projects/${projectId}/configs/${encodeURIComponent(name)}/proposals/${proposalId}`,
              );
            }}
          />
        </div>
      </div>
    </Fragment>
  );
}
