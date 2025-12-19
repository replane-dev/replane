'use client';

import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {ACCEPTED_IMAGE_TYPES, MAX_IMAGE_UPLOAD_SIZE} from '@/engine/core/constants';
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {AlertTriangle, ImagePlus, Trash2, X} from 'lucide-react';
import {signOut, useSession} from 'next-auth/react';
import * as React from 'react';
import {toast} from 'sonner';

export function AccountGeneralSettings() {
  const {data: session, update: updateSession} = useSession();
  const userEmail = session?.user?.email ?? '';
  const currentImage = session?.user?.image ?? null;

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [imagePreview, setImagePreview] = React.useState<string | null>(currentImage);
  const [imageToUpload, setImageToUpload] = React.useState<string | null | undefined>(undefined);
  const [isSaving, setIsSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync preview when session changes
  React.useEffect(() => {
    setImagePreview(currentImage);
    setImageToUpload(undefined);
  }, [currentImage]);

  const trpc = useTRPC();
  const deleteAccount = useMutation(trpc.deleteUserAccount.mutationOptions());
  const updateProfile = useMutation(trpc.updateUserProfile.mutationOptions());

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
      setImagePreview(dataUrl);
      setImageToUpload(dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageToUpload(null);
  };

  const handleSaveImage = async () => {
    if (imageToUpload === undefined) return;

    setIsSaving(true);
    try {
      await updateProfile.mutateAsync({image: imageToUpload});
      // Update session to reflect new image
      await updateSession();
      setImageToUpload(undefined);
      toast.success('Profile image updated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to update profile image — please try again');
    }
    setIsSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (confirmEmail.toLowerCase() !== userEmail.toLowerCase()) {
      toast.error("Email addresses don't match", {
        description: 'Please enter your email exactly as shown above to confirm deletion.',
      });
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAccount.mutateAsync({confirmEmail});
      toast.success('Account deleted successfully');
      // Sign out and redirect to home
      await signOut({callbackUrl: '/'});
    } catch (e: any) {
      toast.error(e?.message ?? 'Unable to delete account — please try again');
      setIsDeleting(false);
    }
  };

  const hasImageChanges = imageToUpload !== undefined;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold">Account settings</h3>
        <p className="text-sm text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Profile Image */}
      <div>
        <Label>Profile image</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Upload a profile image. It will be displayed in the navigation and comments.
        </p>
        <div className="flex items-center gap-4">
          <div className="relative">
            {imagePreview ? (
              <div className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Profile image"
                  className="h-16 w-16 rounded-full object-cover border bg-muted"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50">
                <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
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
              {imagePreview ? 'Change image' : 'Upload image'}
            </Button>
            {hasImageChanges && (
              <Button type="button" size="sm" onClick={handleSaveImage} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card/50 p-4 space-y-3">
        <div>
          <Label className="text-sm font-medium">Email</Label>
          <p className="text-sm text-muted-foreground mt-1">{userEmail}</p>
        </div>
      </div>

      <div className="pt-6 border-t">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-1 text-destructive">Danger Zone</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Permanently delete your account and all associated data
            </p>
          </div>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Account
          </Button>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove you
              from all workspaces and projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
              <p className="text-sm font-medium mb-2">This will:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Permanently delete your user account</li>
                <li>Remove you from all workspaces and projects</li>
                <li>Delete your authentication sessions</li>
              </ul>
            </div>
            <div>
              <Label htmlFor="confirm-email">
                Type your email <span className="font-mono text-xs">({userEmail})</span> to confirm
              </Label>
              <Input
                id="confirm-email"
                type="email"
                placeholder={userEmail}
                value={confirmEmail}
                onChange={e => setConfirmEmail(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || confirmEmail.toLowerCase() !== userEmail.toLowerCase()}
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
