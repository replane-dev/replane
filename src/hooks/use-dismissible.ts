'use client';

import {useEffect, useState} from 'react';

/**
 * Generate a simple djb2 hash of content.
 */
function hashContent(content: unknown): string {
  const str = JSON.stringify(content);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

interface UseDismissibleOptions {
  /**
   * Unique key for localStorage. Will be prefixed with 'replane:dismissed-'.
   */
  storageKey: string;
  /**
   * Content to hash. When this changes, the dismissible will reappear.
   * Can be any serializable value (string, object, array, etc.)
   */
  content: unknown;
  /**
   * Whether the dismissible should be shown at all.
   * If false, isDismissed will be true regardless of localStorage state.
   * @default true
   */
  enabled?: boolean;
}

interface UseDismissibleResult {
  /**
   * Whether the content is currently dismissed.
   * Starts as true to avoid flash during hydration.
   */
  isDismissed: boolean;
  /**
   * Call this to dismiss the content and persist to localStorage.
   */
  dismiss: () => void;
  /**
   * The current content hash (useful for debugging).
   */
  contentHash: string | null;
}

/**
 * Hook for managing dismissible content with localStorage persistence.
 *
 * The dismissal is based on a hash of the content, so when the content changes,
 * the user will see it again.
 *
 * @example
 * ```tsx
 * const { isDismissed, dismiss } = useDismissible({
 *   storageKey: 'announcement',
 *   content: { message, linkUrl },
 *   enabled: config.enabled,
 * });
 *
 * if (isDismissed) return null;
 *
 * return (
 *   <div>
 *     {message}
 *     <button onClick={dismiss}>Close</button>
 *   </div>
 * );
 * ```
 */
export function useDismissible({
  storageKey,
  content,
  enabled = true,
}: UseDismissibleOptions): UseDismissibleResult {
  // Start dismissed to avoid flash during hydration
  const [isDismissed, setIsDismissed] = useState(true);
  const [contentHash, setContentHash] = useState<string | null>(null);

  const fullStorageKey = `replane:dismissed-${storageKey}`;

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDismissed(true);
      return;
    }

    const hash = hashContent(content);
    setContentHash(hash);

    try {
      const dismissedHash = localStorage.getItem(fullStorageKey);
      setIsDismissed(dismissedHash === hash);
    } catch {
      // localStorage not available, show the content
      setIsDismissed(false);
    }
  }, [content, enabled, fullStorageKey]);

  const dismiss = () => {
    if (contentHash) {
      try {
        localStorage.setItem(fullStorageKey, contentHash);
      } catch {
        // localStorage not available, just hide in memory
      }
    }
    setIsDismissed(true);
  };

  return {isDismissed, dismiss, contentHash};
}

