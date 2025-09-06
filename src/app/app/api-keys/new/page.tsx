'use client';

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
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Fragment, useState} from 'react';
import {toast} from 'sonner';

export default function NewApiKeyPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const createMutation = useMutation(trpc.createApiKey.mutationOptions());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);

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
                  <Link href="/app/api-keys">API Keys</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>New</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-xl">
        {!createdToken && (
          <form
            className="space-y-4"
            onSubmit={async e => {
              e.preventDefault();
              const result = await createMutation.mutateAsync({name, description});
              setCreatedToken(result.apiKey.token);
            }}
          >
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm bg-background"
                value={name}
                maxLength={200}
                required
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description (optional)</label>
              <textarea
                className="w-full rounded border px-3 py-2 text-sm bg-background resize-y min-h-[80px]"
                value={description}
                maxLength={1000}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex items-center rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating…' : 'Create API Key'}
              </button>
              <Link
                href="/app/api-keys"
                className="inline-flex items-center rounded border px-4 py-2 text-sm"
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
        {createdToken && (
          <div className="space-y-4">
            <div className="rounded border p-4 space-y-2">
              <p className="text-sm font-medium">API Key Created</p>
              <p className="text-xs text-muted-foreground">
                This is the only time the full key will be shown. Copy and store it securely.
              </p>
              <pre className="p-3 bg-muted rounded text-xs overflow-auto font-mono">
                {createdToken}
              </pre>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(createdToken);
                      toast.success('Copied to clipboard');
                    } catch (e) {
                      toast.error('Failed to copy');
                    }
                  }}
                  className="inline-flex items-center rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  Copy
                </button>
                <Link
                  href="/app/api-keys"
                  className="inline-flex items-center rounded border px-3 py-1.5 text-xs"
                >
                  Done
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </Fragment>
  );
}
