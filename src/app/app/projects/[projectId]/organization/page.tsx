'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {Button} from '@/components/ui/button';
import {Card, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {useTRPC} from '@/trpc/client';
import {useMutation, useSuspenseQuery} from '@tanstack/react-query';
import {Building2, Plus, Settings, Users} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {Fragment} from 'react';
import {toast} from 'sonner';
import {useProjectId} from '../utils';

export default function OrganizationsPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const projectId = useProjectId();

  const orgsQuery = trpc.getOrganizationList.queryOptions();
  const {data: organizations, refetch} = useSuspenseQuery({...orgsQuery});

  return (
    <Fragment>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Organizations</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-5xl space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Manage your organizations and their settings
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New organization
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create organization</DialogTitle>
                  <DialogDescription>
                    Create a new organization to group related projects together.
                  </DialogDescription>
                </DialogHeader>
                <CreateOrganizationForm
                  onCreated={orgId => {
                    refetch();
                    toast.success('Organization created');
                    router.push(`/app/organizations/${orgId}/settings/general`);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {organizations.map(org => (
              <Card key={org.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                    <div className="flex items-center gap-1">
                      {org.myRole === 'admin' && (
                        <Link href={`/app/organizations/${org.id}/settings/general`}>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                      <Link href={`/app/organizations/${org.id}/settings/members`}>
                        <Button variant="ghost" size="sm">
                          <Users className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <CardTitle>{org.name}</CardTitle>
                  <CardDescription>{org.myRole === 'admin' ? 'Admin' : 'Member'}</CardDescription>
                </CardHeader>
                <CardFooter>
                  <Link href={`/app/organizations/${org.id}/settings/general`} className="w-full">
                    <Button variant="outline" className="w-full">
                      View details
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>

          {organizations.length === 0 && (
            <div className="text-center py-12">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No organizations</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Get started by creating your first organization.
              </p>
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );
}

function CreateOrganizationForm({onCreated}: {onCreated: (orgId: string) => void}) {
  const trpc = useTRPC();
  const [name, setName] = React.useState('');
  const [isSubmitting, setSubmitting] = React.useState(false);

  const createOrganization = useMutation(trpc.createOrganization.mutationOptions());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const {organizationId} = await createOrganization.mutateAsync({name});
      onCreated(organizationId);
      setName('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create organization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="org-name" className="mb-1.5 block text-sm font-medium">
          Name
        </Label>
        <Input
          id="org-name"
          placeholder="My Organization"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          A name for your organization (1-100 characters)
        </p>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || name.trim() === ''}>
          {isSubmitting ? 'Creating…' : 'Create organization'}
        </Button>
      </DialogFooter>
    </form>
  );
}
