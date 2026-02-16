/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { MCPServerConfig } from '@google/gemini-cli-core';
import {
  debugLogger,
  GEMINI_DIR,
  getErrorMessage,
  type TelemetrySettings,
  homedir,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';

export const USER_SETTINGS_DIR = path.join(homedir(), GEMINI_DIR);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

/**
 * V2 nested settings structure matching CLI settings schema.
 * This structure provides better organization and namespacing.
 */
export interface V2Settings {
  // Tools configuration (V2: nested under 'tools')
  tools?: {
    core?: string[];
    exclude?: string[];
  };

  // Telemetry configuration (V2: nested under 'telemetry')
  telemetry?: TelemetrySettings;

  // UI configuration (V2: nested under 'ui')
  ui?: {
    showMemoryUsage?: boolean;
  };

  // General configuration (V2: nested under 'general')
  general?: {
    checkpointing?: CheckpointingSettings;
  };

  // Security configuration (V2: nested under 'security')
  security?: {
    folderTrust?: boolean;
  };

  // Context configuration (V2: nested under 'context')
  context?: {
    fileFiltering?: {
      respectGitIgnore?: boolean;
      respectGeminiIgnore?: boolean;
      enableRecursiveFileSearch?: boolean;
      customIgnoreFilePaths?: string[];
    };
  };

  // MCP servers configuration (V2: stays at top level)
  mcpServers?: Record<string, MCPServerConfig>;
}

/**
 * Legacy V1 flat settings structure for backward compatibility.
 * @deprecated Use V2Settings instead.
 */
export interface V1Settings {
  mcpServers?: Record<string, MCPServerConfig>;
  coreTools?: string[];
  excludeTools?: string[];
  telemetry?: TelemetrySettings;
  showMemoryUsage?: boolean;
  checkpointing?: CheckpointingSettings;
  folderTrust?: boolean;

  // Git-aware file filtering settings
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
    customIgnoreFilePaths?: string[];
  };
}

/**
 * Settings interface supporting both V1 (flat) and V2 (nested) structures.
 *
 * For internal use: use V2Settings directly as loadSettings always
 * returns V2 format after migration.
 *
 * For external consumers: this type allows both V1 and V2 properties
 * for backward compatibility.
 */
export type Settings = V2Settings;

export interface SettingsError {
  message: string;
  path: string;
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 *
 * Automatically migrates legacy V1 (flat) settings to V2 (nested) structure.
 *
 * How is it different to gemini-cli/cli: Returns already merged settings rather
 * than `LoadedSettings` (unnecessary since we are not modifying users
 * settings.json).
 */
export function loadSettings(workspaceDir: string): V2Settings {
  let userSettings: V2Settings = {};
  let workspaceSettings: V2Settings = {};
  const settingsErrors: SettingsError[] = [];

  // Load user settings
  try {
    if (fs.existsSync(USER_SETTINGS_PATH)) {
      const userContent = fs.readFileSync(USER_SETTINGS_PATH, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const parsedUserSettings = JSON.parse(
        stripJsonComments(userContent),
      ) as Settings;
      // Migrate V1 to V2 if needed
      userSettings = migrateToV2Settings(
        resolveEnvVarsInObject(parsedUserSettings),
      );
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: USER_SETTINGS_PATH,
    });
  }

  const workspaceSettingsPath = path.join(
    workspaceDir,
    GEMINI_DIR,
    'settings.json',
  );

  // Load workspace settings
  try {
    if (fs.existsSync(workspaceSettingsPath)) {
      const projectContent = fs.readFileSync(workspaceSettingsPath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const parsedWorkspaceSettings = JSON.parse(
        stripJsonComments(projectContent),
      ) as Settings;
      // Migrate V1 to V2 if needed
      workspaceSettings = migrateToV2Settings(
        resolveEnvVarsInObject(parsedWorkspaceSettings),
      );
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: workspaceSettingsPath,
    });
  }

  if (settingsErrors.length > 0) {
    debugLogger.error('Errors loading settings:');
    for (const error of settingsErrors) {
      debugLogger.error(`  Path: ${error.path}`);
      debugLogger.error(`  Message: ${error.message}`);
    }
  }

  // Merge settings with workspace taking precedence
  return deepMergeSettings(userSettings, workspaceSettings);
}

/**
 * Migrates legacy V1 (flat) settings to V2 (nested) structure.
 * If the settings are already in V2 format, returns them as-is.
 */
function migrateToV2Settings(settings: Settings): V2Settings {
  // Check if this is already V2 format by looking for V2-specific nesting
  const isV2 =
    settings.tools ||
    settings.ui ||
    settings.general ||
    settings.security ||
    settings.context;

  if (isV2) {
    // Already V2 format, but ensure type compatibility
    return settings;
  }

  // Migrate V1 to V2
  const v1Settings = settings as V1Settings;
  const v2Settings: V2Settings = {
    mcpServers: v1Settings.mcpServers,
    tools: {
      core: v1Settings.coreTools,
      exclude: v1Settings.excludeTools,
    },
    telemetry: v1Settings.telemetry,
    ui: {
      showMemoryUsage: v1Settings.showMemoryUsage,
    },
    general: {
      checkpointing: v1Settings.checkpointing,
    },
    security: {
      folderTrust: v1Settings.folderTrust,
    },
    context: {
      fileFiltering: v1Settings.fileFiltering,
    },
  };

  // Remove undefined values to keep the output clean
  return removeUndefinedValues(v2Settings);
}

/**
 * Deep merges V2 settings objects, with workspace settings taking precedence.
 */
function deepMergeSettings(base: V2Settings, override: V2Settings): V2Settings {
  // Using Record<string, unknown> for flexible merging of nested settings
  /* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
  const result: Record<string, unknown> = { ...base };

  for (const key in override) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      const overrideValue = override[key as keyof V2Settings];
      const baseValue = result[key as keyof V2Settings];

      if (
        typeof overrideValue === 'object' &&
        overrideValue !== null &&
        !Array.isArray(overrideValue) &&
        typeof baseValue === 'object' &&
        baseValue !== null &&
        !Array.isArray(baseValue)
      ) {
        // Both are objects, merge them recursively
        result[key as keyof V2Settings] = {
          ...(baseValue as Record<string, unknown>),
          ...(overrideValue as Record<string, unknown>),
        };
      } else if (overrideValue !== undefined) {
        // Use override value if defined
        result[key as keyof V2Settings] = overrideValue;
      }
    }
  }

  return result as V2Settings;
  /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */
}

/**
 * Removes undefined values from an object recursively.
 */
function removeUndefinedValues<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return obj.map(removeUndefinedValues) as unknown as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const value = (obj as Record<string, unknown>)[key];
        if (value !== undefined) {
          result[key] = removeUndefinedValues(value);
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return result as T;
  }

  return obj;
}

function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName];
    }
    return match;
  });
}

function resolveEnvVarsInObject<T>(obj: T): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return obj.map((item) => resolveEnvVarsInObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = resolveEnvVarsInObject(newObj[key]);
      }
    }
    return newObj;
  }

  return obj;
}
