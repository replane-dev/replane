'use client';

import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import React from 'react';

interface OrgContextValue {
  organizationName: string | null;
}

const OrgContext = React.createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({children}: {children: React.ReactNode}) {
  const trpc = useTRPC();
  const orgQuery = trpc.getOrganization.queryOptions();
  const {data} = useSuspenseQuery({...orgQuery});

  const value = React.useMemo<OrgContextValue>(() => ({organizationName: data.name}), [data.name]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = React.useContext(OrgContext);
  if (!ctx) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return ctx;
}
