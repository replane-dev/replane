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
import {useTRPC} from '@/trpc/client';
import {useMutation} from '@tanstack/react-query';
import {AlertTriangle, Trash2} from 'lucide-react';
import {signOut, useSession} from 'next-auth/react';
import * as React from 'react';
import {toast} from 'sonner';

export function AccountGeneralSettings() {
  const {data: session} = useSession();
  const userEmail = session?.user?.email ?? '';

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);

  const trpc = useTRPC();
  const deleteAccount = useMutation(trpc.deleteUserAccount.mutationOptions());

  const handleDeleteAccount = async () => {
    if (confirmEmail.toLowerCase() !== userEmail.toLowerCase()) {
      toast.error('Email addresses don\'t match', {
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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold">Account settings</h3>
        <p className="text-sm text-muted-foreground">Manage your account settings</p>
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
