'use client';

import {useProject} from '@/app/app/projects/[projectId]/utils';
import * as React from 'react';
import {SettingsDialog} from './settings-dialog';

export type SettingsSection =
  | 'account-general'
  | 'account-preferences'
  | 'org-general'
  | 'org-members'
  | 'project-general'
  | 'project-environments'
  | 'project-members';

interface SettingsContextValue {
  /**
   * Opens the settings dialog. Optionally specify which section to show.
   * @param section - The settings section to display (defaults to 'project-general')
   * @example
   * ```tsx
   * const {showSettings} = useSettings();
   * // Open to default section (project-general)
   * showSettings();
   * // Open to specific section
   * showSettings('project-environments');
   * ```
   */
  showSettings: (section?: SettingsSection) => void;
  /**
   * Closes the settings dialog.
   */
  hideSettings: () => void;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

/**
 * Hook to access the settings dialog from anywhere in the app.
 * Must be used within a SettingsProvider.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {showSettings} = useSettings();
 *
 *   return (
 *     <Button onClick={() => showSettings('project-environments')}>
 *       Open Environment Settings
 *     </Button>
 *   );
 * }
 * ```
 */
export function useSettings() {
  const context = React.useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({children}: SettingsProviderProps) {
  const project = useProject();
  const [open, setOpen] = React.useState(false);
  const [section, setSection] = React.useState<SettingsSection>('project-general');

  const showSettings = React.useCallback((newSection?: SettingsSection) => {
    if (newSection) {
      setSection(newSection);
    }
    setOpen(true);
  }, []);

  const hideSettings = React.useCallback(() => {
    setOpen(false);
  }, []);

  const value = React.useMemo(
    () => ({
      showSettings,
      hideSettings,
    }),
    [showSettings, hideSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
      <SettingsDialog
        open={open}
        onOpenChange={setOpen}
        projectId={project.id}
        workspaceId={project.workspaceId}
        initialSection={section}
      />
    </SettingsContext.Provider>
  );
}
