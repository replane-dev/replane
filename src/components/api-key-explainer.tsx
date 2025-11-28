'use client';

import {Info, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {Button} from './ui/button';

const STORAGE_KEY = 'replane_api_key_explainer_dismissed';

export function ApiKeyExplainer() {
  const [isDismissed, setIsDismissed] = useState(true); // Start as true to avoid flash

  useEffect(() => {
    // Check localStorage after component mounts (client-side only)
    const dismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsDismissed(dismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsDismissed(true);
  };

  if (isDismissed) {
    return null;
  }

  return (
    <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 p-4">
      <div className="flex items-start gap-3">
        <Info className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground mb-2">
            Project-scoped SDK keys
          </div>
          <div className="space-y-2 text-sm text-foreground/80 dark:text-foreground/70">
            <p>
              Each SDK key is tied to a specific project and can only access configs from that
              project.
            </p>
            <p>
              If you need to access configs from multiple projects, create a separate SDK key for
              each project and initialize the SDK separately for each one.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="shrink-0 h-6 w-6 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </Button>
      </div>
    </div>
  );
}

