// Shared utilities for table row navigation behavior.
// Prevents navigation when clicking on interactive elements (buttons, links, form controls),
// menu items, or when the user is selecting text.
import type React from 'react';

export function isInteractiveElement(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return !!el.closest(
    'button, a, [role="checkbox"], [role="menu"], [role="menuitem"], input, select, textarea, [data-no-row-click]',
  );
}

export function shouldNavigateOnRowClick(e: React.MouseEvent): boolean {
  if (e.defaultPrevented) return false;
  if (isInteractiveElement(e.target)) return false;
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) return false; // allow text selection without navigation
  return true;
}
