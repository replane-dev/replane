/**
 * Type definitions for Replane self-integration configs.
 *
 * This file defines the configuration types that are managed by Replane
 * for the Replane application itself.
 */

/**
 * Announcement banner configuration
 */
export interface AnnouncementBannerConfig {
  /** Whether the announcement banner is enabled */
  enabled: boolean;
  /** The message to display in the banner */
  message: string;
  /** The link URL (optional) */
  linkUrl?: string;
  /** The link text (optional) */
  linkText?: string;
  /** The variant/style of the banner */
  variant?: 'info' | 'warning' | 'success' | 'error';
}

/**
 * All Replane self-integration configs
 */
export interface ReplaneConfigs {
  'announcement-banner': AnnouncementBannerConfig;
}

/**
 * Default/fallback values for configs when Replane is not configured
 */
export const DEFAULT_CONFIGS: ReplaneConfigs = {
  'announcement-banner': {
    enabled: false,
    message: '',
    linkUrl: undefined,
    linkText: undefined,
    variant: 'info',
  },
};
