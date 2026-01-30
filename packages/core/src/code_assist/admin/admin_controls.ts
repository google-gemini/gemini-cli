/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodeAssistServer } from '../server.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { isDeepStrictEqual } from 'node:util';
import {
  type FetchAdminControlsResponse,
  FetchAdminControlsResponseSchema,
} from '../types.js';
import { getCodeAssistServer } from '../codeAssist.js';
import type { Config } from '../../config/config.js';

let pollingInterval: NodeJS.Timeout | undefined;
let currentSettings: FetchAdminControlsResponse | undefined;

export function sanitizeAdminSettings(
  settings: FetchAdminControlsResponse,
): FetchAdminControlsResponse {
  const result = FetchAdminControlsResponseSchema.safeParse(settings);
  if (!result.success) {
    return {};
  }
  return result.data;
}

function isGaxiosError(error: unknown): error is { status: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

/**
 * Fetches the admin controls from the server if enabled by experiment flag.
 * Safely handles polling start/stop based on the flag and server availability.
 *
 * @param server The CodeAssistServer instance.
 * @param cachedSettings The cached settings to use if available.
 * @param adminControlsEnabled Whether admin controls are enabled.
 * @param onSettingsChanged Callback to invoke when settings change during polling.
 * @returns The fetched settings if enabled and successful, otherwise undefined.
 */
export async function fetchAdminControls(
  server: CodeAssistServer | undefined,
  cachedSettings: FetchAdminControlsResponse | undefined,
  adminControlsEnabled: boolean,
  onSettingsChanged: (settings: FetchAdminControlsResponse) => void,
): Promise<FetchAdminControlsResponse> {
  if (!server || !server.projectId || !adminControlsEnabled) {
    stopAdminControlsPolling();
    currentSettings = undefined;
    return {};
  }

  // If we already have settings (e.g. from IPC during relaunch), use them
  // to avoid blocking startup with another fetch. We'll still start polling.
  if (cachedSettings) {
    currentSettings = cachedSettings;
    startAdminControlsPolling(server, server.projectId, onSettingsChanged);
    return cachedSettings;
  }

  try {
    const rawSettings = await server.fetchAdminControls({
      project: server.projectId,
    });
    const sanitizedSettings = sanitizeAdminSettings(rawSettings);
    currentSettings = sanitizedSettings;
    startAdminControlsPolling(server, server.projectId, onSettingsChanged);
    return sanitizedSettings;
  } catch (e) {
    // Non-enterprise users don't have access to fetch settings.
    if (isGaxiosError(e) && e.status === 403) {
      stopAdminControlsPolling();
      currentSettings = undefined;
      return {};
    }
    debugLogger.error('Failed to fetch admin controls: ', e);
    // If initial fetch fails, start polling to retry.
    currentSettings = {};
    startAdminControlsPolling(server, server.projectId, onSettingsChanged);
    return {};
  }
}

/**
 * Starts polling for admin controls.
 */
function startAdminControlsPolling(
  server: CodeAssistServer,
  project: string,
  onSettingsChanged: (settings: FetchAdminControlsResponse) => void,
) {
  stopAdminControlsPolling();

  pollingInterval = setInterval(
    async () => {
      try {
        const rawSettings = await server.fetchAdminControls({
          project,
        });
        const newSettings = sanitizeAdminSettings(rawSettings);

        if (!isDeepStrictEqual(newSettings, currentSettings)) {
          currentSettings = newSettings;
          onSettingsChanged(newSettings);
        }
      } catch (e) {
        // Non-enterprise users don't have access to fetch settings.
        if (isGaxiosError(e) && e.status === 403) {
          stopAdminControlsPolling();
          currentSettings = undefined;
          return;
        }
        debugLogger.error('Failed to poll admin controls: ', e);
      }
    },
    5 * 60 * 1000,
  ); // 5 minutes
}

/**
 * Stops polling for admin controls.
 */
export function stopAdminControlsPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = undefined;
  }
}

/**
 * Returns a standardized error message for features disabled by admin settings.
 *
 * @param featureName The name of the disabled feature
 * @param config The application config
 * @returns The formatted error message
 */
export function getAdminErrorMessage(
  featureName: string,
  config: Config | undefined,
): string {
  const server = config ? getCodeAssistServer(config) : undefined;
  const projectId = server?.projectId;
  const projectParam = projectId ? `?project=${projectId}` : '';
  return `${featureName} is disabled by your administrator. To enable it, please request an update to the settings at: https://goo.gle/manage-gemini-cli${projectParam}`;
}
