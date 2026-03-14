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
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';

export const USER_SETTINGS_DIR = path.join(homedir(), GEMINI_DIR);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

/**
 * A2A Settings interface supporting both V1 (flat) and V2 (nested) formats.
 *
 * V1 (flat/legacy) format:
 * { "coreTools": ["tool1"], "allowedTools": ["tool2"], "excludeTools": ["tool3"] }
 *
 * V2 (nested) format:
 * { "tools": { "core": ["tool1"], "allowed": ["tool2"], "exclude": ["tool3"] } }
 *
 * Both formats are supported for backward compatibility. V1 flat fields take
 * precedence over V2 nested fields when both are present.
 */
export interface Settings {
  mcpServers?: Record<string, MCPServerConfig>;
  // V1 flat format (legacy) - kept for backward compatibility
  coreTools?: string[];
  excludeTools?: string[];
  allowedTools?: string[];
  // V2 nested format
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
}

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
 * How is it different to gemini-cli/cli: Returns already merged settings rather
 * than `LoadedSettings` (unnecessary since we are not modifying users
 * settings.json).
 */
export function loadSettings(workspaceDir: string): Settings {
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];

  // Load user settings
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

  // Load workspace settings
  try {
    if (fs.existsSync(workspaceSettingsPath)) {
      const projectContent = fs.readFileSync(workspaceSettingsPath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const parsedWorkspaceSettings = JSON.parse(
        stripJsonComments(projectContent),
      ) as Settings;
      workspaceSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
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

  // If folderTrust is enabled in user settings, workspace settings are
  // not trusted and should be ignored to prevent security bypass via
  // malicious workspace settings (e.g. arbitrary command execution).
  // This mirrors the trust check in the CLI's mergeSettings() function.
  const isTrusted = !userSettings.folderTrust;
  const safeWorkspaceSettings = isTrusted ? workspaceSettings : {};

  // If there are overlapping keys, the values of workspaceSettings will
  // override values from userSettings
  return {
    ...userSettings,
    ...safeWorkspaceSettings,
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
