'use client';

import {LoaderIcon} from 'lucide-react';
import {useEffect, useState} from 'react';

export function DelayedFullscreenSpinner({delay = 500}: {delay?: number}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 grid place-items-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <LoaderIcon className="h-8 w-8 animate-spin" aria-label="Loading" />
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  );
}
