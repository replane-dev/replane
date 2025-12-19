'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useAppContext} from '@/contexts/app-context';
import {ACCEPTED_IMAGE_TYPES, MAX_IMAGE_UPLOAD_SIZE} from '@/engine/core/constants';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {ImagePlus, Trash2, X} from 'lucide-react';
import {useRouter} from 'next/navigation';
import * as React from 'react';
import {toast} from 'sonner';

export function WorkspaceGeneralSettings({workspaceId}: {workspaceId: string}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {refresh: refreshAppContext} = useAppContext();

  const {data: org} = useSuspenseQuery(trpc.getWorkspace.queryOptions({workspaceId}));
  const [name, setName] = React.useState(org.name);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(org.logo);
  const [logoToUpload, setLogoToUpload] = React.useState<string | null | undefined>(undefined);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setName(org.name);
    setLogoPreview(org.logo);
    setLogoToUpload(undefined);
  }, [org.name, org.logo]);

  const updateWorkspace = useMutation(trpc.updateWorkspace.mutationOptions());
  const deleteWorkspace = useMutation(trpc.deleteWorkspace.mutationOptions());
  const [saving, setSaving] = React.useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Please upload a PNG, JPEG, WebP, or GIF image.');
      return;
    }

    // Validate file size
    if (file.size > MAX_IMAGE_UPLOAD_SIZE) {
      toast.error('Image is too large. Maximum size is 2MB.');
      return;
    }

    // Convert to base64 data URL
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
      setLogoToUpload(dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoToUpload(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateWorkspace.mutateAsync({workspaceId, name, logo: logoToUpload});
      // Refresh the app context to update sidebar logo
      await queryClient.invalidateQueries({queryKey: trpc.getWorkspace.queryKey({workspaceId})});
      await refreshAppContext();
      setLogoToUpload(undefined);
      toast.success('Workspace settings saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to save workspace settings — please try again');
    }
    setSaving(false);
  };

  const canEdit = org.myRole === 'admin';
  const hasChanges = name !== org.name || logoToUpload !== undefined;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold">Workspace settings</h3>
        <p className="text-sm text-muted-foreground">Manage workspace details</p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Logo Upload */}
        <div>
          <Label>Logo</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Upload a logo for your workspace. It will be displayed in the sidebar.
          </p>
          <div className="flex items-center gap-4">
            <div className="relative">
              {logoPreview ? (
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreview}
                    alt="Workspace logo"
                    className="h-16 w-16 rounded-lg object-contain border bg-muted"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      title="Remove logo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50">
                  <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
                </div>
              )}
            </div>
            {canEdit && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? 'Change logo' : 'Upload logo'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Name */}
        <div>
          <Label htmlFor="org-name">Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Acme Corp, Marketing Team, Personal Projects"
            disabled={!canEdit}
            maxLength={100}
          />
        </div>
        <Button type="submit" disabled={saving || !canEdit || name.trim() === '' || !hasChanges}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>

      {canEdit && (
        <div className="pt-6 border-t">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-1">Danger Zone</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Permanently delete this workspace and all its projects
              </p>
            </div>
            <Button
              // outline
              variant="outline"
              className="text-destructive"
              onClick={async () => {
                if (!confirm(`Delete workspace "${org.name}"? This will delete all projects.`))
                  return;
                // Redirect optimistically before deletion to avoid errors
                router.push('/app');
                try {
                  await deleteWorkspace.mutateAsync({workspaceId});
                } catch (e: any) {
                  // User has already navigated away, but log the error
                  console.error('Failed to delete workspace:', e);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete workspace
            </Button>
          </div>
        </div>
      )}

      <div className="pt-6 border-t">
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Workspace ID</span>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {workspaceId}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
