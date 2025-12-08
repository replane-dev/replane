'use client';

import {useEffect, useState} from 'react';

export function BrowserOnly({children}: {children: React.ReactNode}) {
  const [isBrowser, setIsBrowser] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsBrowser(true);
  }, []);
  if (!isBrowser) {
    return null;
  }
  return children;
}
