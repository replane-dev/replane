'use client';

/**
 * Replane self-integration hooks.
 *
 * These hooks provide type-safe access to Replane configs
 * for the Replane application itself.
 */

import {createConfigHook} from '@replanejs/next';
import type {ReplaneConfigs} from './types';

/**
 * Type-safe hook to get a Replane config value.
 *
 * @example
 * ```tsx
 * const announcementBanner = useReplaneConfig('announcement-banner');
 * ```
 */
export const useReplaneConfig = createConfigHook<ReplaneConfigs>();
