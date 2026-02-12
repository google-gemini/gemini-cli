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
  McpConfigDefinitionSchema,
  type AdminControlsSettings,
} from '../types.js';
import { getCodeAssistServer } from '../codeAssist.js';
import type { Config } from '../../config/config.js';

let pollingInterval: NodeJS.Timeout | undefined;
let currentSettings: AdminControlsSettings | undefined;

export function sanitizeAdminSettings(
  settings: FetchAdminControlsResponse,
): AdminControlsSettings {
  const result = FetchAdminControlsResponseSchema.safeParse(settings);
  if (!result.success) {
    return {};
  }
  const sanitized = result.data;
  let mcpConfig;

  if (sanitized.mcpSetting?.mcpConfigJson) {
    try {
      const parsed = JSON.parse(sanitized.mcpSetting.mcpConfigJson);
      const validationResult = McpConfigDefinitionSchema.safeParse(parsed);

      if (validationResult.success) {
        mcpConfig = validationResult.data;
        // Sort include/exclude tools for stable comparison
        if (mcpConfig.mcpServers) {
          for (const server of Object.values(mcpConfig.mcpServers)) {
            if (server.includeTools) {
              server.includeTools.sort();
            }
            if (server.excludeTools) {
              server.excludeTools.sort();
            }
          }
        }
      }
    } catch (_e) {
      // Ignore parsing errors
    }
  }

  // Apply defaults (secureModeEnabled is supported for backward compatibility)
  let strictModeDisabled = false;
  if (sanitized.strictModeDisabled !== undefined) {
    strictModeDisabled = sanitized.strictModeDisabled;
  } else if (sanitized.secureModeEnabled !== undefined) {
    strictModeDisabled = !sanitized.secureModeEnabled;
  }

  return {
    strictModeDisabled,
    cliFeatureSetting: {
      ...sanitized.cliFeatureSetting,
      extensionsSetting: {
        extensionsEnabled:
          sanitized.cliFeatureSetting?.extensionsSetting?.extensionsEnabled ??
          false,
      },
      unmanagedCapabilitiesEnabled:
        sanitized.cliFeatureSetting?.unmanagedCapabilitiesEnabled ?? false,
    },
    mcpSetting: {
      mcpEnabled: sanitized.mcpSetting?.mcpEnabled ?? false,
      mcpConfig: mcpConfig ?? {},
    },
  };
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
  cachedSettings: AdminControlsSettings | undefined,
  adminControlsEnabled: boolean,
  onSettingsChanged: (settings: AdminControlsSettings) => void,
): Promise<AdminControlsSettings> {
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
 * Fetches the admin controls from the server a single time.
 * This function does not start or stop any polling.
 *
 * @param server The CodeAssistServer instance.
 * @param adminControlsEnabled Whether admin controls are enabled.
 * @returns The fetched settings if enabled and successful, otherwise undefined.
 */
export async function fetchAdminControlsOnce(
  server: CodeAssistServer | undefined,
  adminControlsEnabled: boolean,
): Promise<FetchAdminControlsResponse> {
  if (!server || !server.projectId || !adminControlsEnabled) {
    return {};
  }

  try {
    const rawSettings = await server.fetchAdminControls({
      project: server.projectId,
    });
    return sanitizeAdminSettings(rawSettings);
  } catch (e) {
    // Non-enterprise users don't have access to fetch settings.
    if (isGaxiosError(e) && e.status === 403) {
      return {};
    }
    debugLogger.error(
      'Failed to fetch admin controls: ',
      e instanceof Error ? e.message : e,
    );
    return {};
  }
}

/**
 * Starts polling for admin controls.
 */
function startAdminControlsPolling(
  server: CodeAssistServer,
  project: string,
  onSettingsChanged: (settings: AdminControlsSettings) => void,
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

/**
 * Returns a standardized error message for MCP servers blocked by the admin allowlist.
 *
 * @param blockedServers List of blocked server names
 * @param config The application config
 * @returns The formatted error message
 */
export function getAdminBlockedMcpServersMessage(
  blockedServers: string[],
  config: Config | undefined,
): string {
  const server = config ? getCodeAssistServer(config) : undefined;
  const projectId = server?.projectId;
  const projectParam = projectId ? `?project=${projectId}` : '';
  const count = blockedServers.length;
  const serverText = count === 1 ? 'server is' : 'servers are';

  return `${count} MCP ${serverText} not allowlisted by your administrator. To enable ${
    count === 1 ? 'it' : 'them'
  }, please request an update to the settings at: https://goo.gle/manage-gemini-cli${projectParam}`;
}
