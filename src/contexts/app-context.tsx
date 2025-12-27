'use client';

import {useTRPC} from '@/trpc/client';
import {useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import React from 'react';

export interface ProjectSummary {
  id: string;
  name: string;
  workspaceId: string;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
  myRole: 'admin' | 'maintainer' | undefined;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  logo: string | null;
  myRole: 'admin' | 'member' | undefined;
}

interface AppContextValue {
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  isEmailServerConfigured: boolean;
  // refreshes project and workspace lists
  refresh: () => Promise<void>;
}

const AppContext = React.createContext<AppContextValue | undefined>(undefined);

export function AppProvider({children}: {children: React.ReactNode}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const appLayoutQuery = trpc.getAppLayoutData.queryOptions();
  const {data: appLayoutData} = useSuspenseQuery(appLayoutQuery);
  console.log('appLayoutData', appLayoutData);
  const projects: ProjectSummary[] = React.useMemo(
    () =>
      appLayoutData.projects.map(p => ({
        id: p.id,
        name: p.name,
        workspaceId: p.workspaceId,
        requireProposals: p.requireProposals,
        allowSelfApprovals: p.allowSelfApprovals,
        myRole: p.myRole,
      })),
    [appLayoutData.projects],
  );
  const workspaces: WorkspaceSummary[] = React.useMemo(
    () =>
      appLayoutData.workspaces.map(w => ({
        id: w.id,
        name: w.name,
        logo: w.logo,
        myRole: w.myRole,
      })),
    [appLayoutData.workspaces],
  );

  // Assert non-empty list (backend guarantees at least one project)
  if (projects.length === 0) throw new Error('Expected at least one project');

  const refresh = React.useCallback(async () => {
    // Invalidate and refetch the app layout data immediately
    await queryClient.invalidateQueries({queryKey: appLayoutQuery.queryKey});
    await queryClient.refetchQueries({queryKey: appLayoutQuery.queryKey});
  }, [queryClient, appLayoutQuery.queryKey]);

  const value = React.useMemo<AppContextValue>(
    () => ({
      projects,
      workspaces,
      isEmailServerConfigured: appLayoutData.isEmailServerConfigured,
      refresh,
    }),
    [projects, workspaces, appLayoutData.isEmailServerConfigured, refresh],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return ctx;
}
