/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodeAssistServer } from '../server.js';
// Remove import from types.js since we will define it here
import { debugLogger } from '../../utils/debugLogger.js';

import { getExperiments } from '../experiments/experiments.js';
import { ExperimentFlags } from '../experiments/flagNames.js';
import { isDeepStrictEqual } from 'node:util';
import {
  type FetchAdminControlsResponse,
  FetchAdminControlsResponseSchema,
} from '../types.js';

// Schemas moved to types.ts

export function sanitizeAdminSettings(
  settings: unknown,
): FetchAdminControlsResponse {
  if (!settings) {
    return {};
  }

  const result = FetchAdminControlsResponseSchema.safeParse(settings);

  if (!result.success) {
    return {};
  }

  return result.data;
}

let pollingInterval: NodeJS.Timeout | undefined;
let currentSettings: FetchAdminControlsResponse | undefined;

/**
 * Fetches the admin controls from the server if enabled by experiment flag.
 * Safely handles polling start/stop based on the flag and server availability.
 *
 * @param server The CodeAssistServer instance.
 * @param onSettingsChanged Callback to invoke when settings change during polling.
 * @returns The fetched settings if enabled and successful, otherwise undefined.
 */
export async function fetchAdminControls(
  server: CodeAssistServer | undefined,
  onSettingsChanged: (settings: FetchAdminControlsResponse) => void,
  fallbackSettings: FetchAdminControlsResponse = {},
): Promise<FetchAdminControlsResponse> {
  if (!server) {
    stopAdminControlsPolling();
    return fallbackSettings;
  }

  // If we already have settings (e.g. from IPC during relaunch), use them
  // to avoid blocking startup with another fetch. We'll still start polling.
  if (Object.keys(fallbackSettings).length > 0) {
    currentSettings = fallbackSettings;
    startAdminControlsPolling(server, onSettingsChanged);
    return fallbackSettings;
  }

  let experiments;
  try {
    experiments = await getExperiments(server);
  } catch (e) {
    debugLogger.error('Failed to fetch experiments', e);
    stopAdminControlsPolling();
    return fallbackSettings;
  }

  const adminControlsEnabled = experiments.experimentIds.includes(
    ExperimentFlags.ENABLE_ADMIN_CONTROLS,
  );

  if (!adminControlsEnabled) {
    stopAdminControlsPolling();
    currentSettings = undefined;
    return {};
  }

  if (!server.projectId) {
    stopAdminControlsPolling();
    return fallbackSettings;
  }

  try {
    const settings = await server.fetchAdminControls({
      project: server.projectId,
    });
    const sanitizedSettings = sanitizeAdminSettings(settings);
    currentSettings = sanitizedSettings;

    // Start polling with the provided callback
    startAdminControlsPolling(server, onSettingsChanged);

    return sanitizedSettings;
  } catch (e) {
    debugLogger.error('Failed to fetch admin controls', e);
    // If initial fetch fails but flag is enabled, start polling to retry.
    startAdminControlsPolling(server, onSettingsChanged);
    return fallbackSettings;
  }
}

// ... (removed sanitizeAdminSettings function)

/**
 * Starts polling for admin controls.
 * Internal usage only - ensuring logic is contained.
 */
function startAdminControlsPolling(
  server: CodeAssistServer,
  onSettingsChanged: (settings: FetchAdminControlsResponse) => void,
) {
  stopAdminControlsPolling();

  pollingInterval = setInterval(
    async () => {
      if (!server.projectId) return;

      try {
        const rawSettings = await server.fetchAdminControls({
          project: server.projectId,
        });
        const newSettings = sanitizeAdminSettings(rawSettings);

        if (!isDeepStrictEqual(newSettings, currentSettings)) {
          currentSettings = newSettings;
          onSettingsChanged(newSettings);
        }
      } catch (e) {
        debugLogger.error('Failed to poll admin controls', e);
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
