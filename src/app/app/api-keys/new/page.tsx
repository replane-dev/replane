'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Separator} from '@/components/ui/separator';
import {SidebarTrigger} from '@/components/ui/sidebar';
import {Textarea} from '@/components/ui/textarea';
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
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Create API Key</CardTitle>
              <CardDescription>Provide a name and optional description.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={async e => {
                  e.preventDefault();
                  const result = await createMutation.mutateAsync({name, description});
                  setCreatedToken(result.apiKey.token);
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="api-key-name">Name</Label>
                  <Input
                    id="api-key-name"
                    value={name}
                    maxLength={200}
                    required
                    onChange={e => setName(e.target.value)}
                    placeholder="Production Key"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="api-key-desc">Description (optional)</Label>
                  <Textarea
                    id="api-key-desc"
                    value={description}
                    maxLength={1000}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Used for server-to-server calls from ..."
                    className="min-h-[100px]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating…' : 'Create API Key'}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/app/api-keys">Cancel</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {createdToken && (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>API Key Created</CardTitle>
              <CardDescription>
                This is the only time the full key will be shown. Copy and store it securely.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="p-4 bg-muted rounded text-sm overflow-auto font-mono">
                {createdToken}
              </pre>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdToken);
                    toast.success('Copied to clipboard');
                  } catch (e) {
                    toast.error('Failed to copy');
                  }
                }}
              >
                Copy
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/api-keys">Done</Link>
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </Fragment>
  );
}
