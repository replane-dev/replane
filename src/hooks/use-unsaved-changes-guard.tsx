'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UseUnsavedChangesGuardOptions {
  isOpen: boolean;
  onClose: () => void;
}

interface UseUnsavedChangesGuardReturn {
  /** Pass this to Sheet's onOpenChange */
  handleOpenChange: (open: boolean) => void;
  /** Pass this to child components to track dirty state */
  handleDirtyChange: (isDirty: boolean) => void;
  /** Render this AlertDialog in your component */
  ConfirmDialog: React.ReactNode;
}

export function useUnsavedChangesGuard({
  isOpen,
  onClose,
}: UseUnsavedChangesGuardOptions): UseUnsavedChangesGuardReturn {
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const pendingCloseRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);

  // Reset flags when sheet opens
  useEffect(() => {
    if (isOpen) {
      pendingCloseRef.current = false;
      hasUnsavedChangesRef.current = false;
    }
  }, [isOpen]);

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we need to return something
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        return;
      }
      // Trying to close
      if (hasUnsavedChangesRef.current && !pendingCloseRef.current) {
        // Show confirmation dialog
        setShowConfirmClose(true);
        return;
      }
      // Reset state and close
      hasUnsavedChangesRef.current = false;
      onClose();
    },
    [onClose],
  );

  const handleConfirmClose = useCallback(() => {
    pendingCloseRef.current = true;
    setShowConfirmClose(false);
    hasUnsavedChangesRef.current = false;
    onClose();
  }, [onClose]);

  const handleCancelClose = useCallback(() => {
    setShowConfirmClose(false);
  }, []);

  const handleDirtyChange = useCallback((isDirty: boolean) => {
    hasUnsavedChangesRef.current = isDirty;
  }, []);

  const ConfirmDialog = (
    <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to close without saving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelClose}>Continue Editing</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmClose}>Discard Changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    handleOpenChange,
    handleDirtyChange,
    ConfirmDialog,
  };
}

