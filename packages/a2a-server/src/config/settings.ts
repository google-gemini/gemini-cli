/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  type MCPServerConfig,
  debugLogger,
  GEMINI_DIR,
  getErrorMessage,
  type TelemetrySettings,
  homedir,
  type AgentSettings,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';

export const USER_SETTINGS_DIR = path.join(homedir(), GEMINI_DIR);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

// TODO: Ensure full compatibility with V2 nested settings structure (settings.schema.json).
// This involves updating the interface and implementing migration logic to support legacy V1 (flat) settings,
// similar to how packages/cli/src/config/settings.ts handles it.
export interface Settings {
  mcpServers?: Record<string, MCPServerConfig>;
  coreTools?: string[];
  excludeTools?: string[];
  allowedTools?: string[];
  tools?: {
    allowed?: string[];
    exclude?: string[];
    core?: string[];
  };
  telemetry?: TelemetrySettings;
  showMemoryUsage?: boolean;
  checkpointing?: CheckpointingSettings;
  folderTrust?: boolean;
  general?: {
    previewFeatures?: boolean;
  };

  // Git-aware file filtering settings
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
    customIgnoreFilePaths?: string[];
  };
  experimental?: {
    enableEventDrivenScheduler?: boolean;
    enableAgents?: boolean;
  };
  agents?: AgentSettings;
}

export interface SettingsError {
  message: string;
  path: string;
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

/**
 * The result of loading settings, containing both user-level (expanded)
 * and workspace-level (raw) configurations.
 */
export interface LoadedSettings {
  userSettings: Settings;
  workspaceSettings: Settings;
}

/**
 * Loads settings from user and workspace directories.
 * Workspace settings are returned RAW (without env var expansion) to prevent
 * secret leakage from untrusted repositories.
 */
export function loadSettings(workspaceDir: string): LoadedSettings {
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];

  // Load user settings (Safe to expand)
  try {
    if (fs.existsSync(USER_SETTINGS_PATH)) {
      const userContent = fs.readFileSync(USER_SETTINGS_PATH, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const parsedUserSettings = JSON.parse(
        stripJsonComments(userContent),
      ) as Settings;
      userSettings = resolveEnvVarsInObject(parsedUserSettings);
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

  // Load workspace settings (RAW - NO EXPANSION)
  try {
    if (fs.existsSync(workspaceSettingsPath)) {
      const projectContent = fs.readFileSync(workspaceSettingsPath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      workspaceSettings = JSON.parse(
        stripJsonComments(projectContent),
      ) as Settings;
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

  return {
    userSettings,
    workspaceSettings,
  };
}

function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName];
    }
    return match;
  });
}

export function resolveEnvVarsInObject<T>(obj: T): T {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-return
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
