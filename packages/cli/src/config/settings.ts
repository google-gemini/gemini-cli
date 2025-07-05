/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import {
  MCPServerConfig,
  getErrorMessage,
  BugCommandSettings,
  TelemetrySettings,
  AuthType,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';

export const SETTINGS_DIRECTORY_NAME = '.gemini';
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

export enum SettingScope {
  User = 'User',
  Workspace = 'Workspace',
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface Settings {
  theme?: string;
  selectedAuthType?: AuthType;
  sandbox?: boolean | string;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  preferredEditor?: string;
  bugCommand?: BugCommandSettings;
  checkpointing?: CheckpointingSettings;
  autoConfigureMaxOldSpaceSize?: boolean;

  // Git-aware file filtering settings
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };

  // UI setting. Does not display the ANSI-controlled terminal title.
  hideWindowTitle?: boolean;
  hideTips?: boolean;

  // Add other settings here.
}

// The allSettings `Record<keyof Settings, undefined>`,
// ensures that any changes to the `Settings` interface will result in a
// compile-time error if this object is not also updated.
const allSettings: Record<keyof Settings, undefined> = {
  theme: undefined,
  selectedAuthType: undefined,
  sandbox: undefined,
  coreTools: undefined,
  excludeTools: undefined,
  toolDiscoveryCommand: undefined,
  toolCallCommand: undefined,
  mcpServerCommand: undefined,
  mcpServers: undefined,
  showMemoryUsage: undefined,
  contextFileName: undefined,
  accessibility: undefined,
  telemetry: undefined,
  usageStatisticsEnabled: undefined,
  preferredEditor: undefined,
  bugCommand: undefined,
  checkpointing: undefined,
  autoConfigureMaxOldSpaceSize: undefined,
  fileFiltering: undefined,
  hideWindowTitle: undefined,
};

export const validSettingKeys = Object.keys(allSettings) as Array<
  keyof Settings
>;

export interface SettingsError {
  message: string;
  path: string;
}

export interface SettingsFile {
  settings: Settings;
  path: string;
}
export class LoadedSettings {
  constructor(
    user: SettingsFile,
    workspace: SettingsFile,
    errors: SettingsError[],
  ) {
    this.user = user;
    this.workspace = workspace;
    this.errors = errors;
    this._merged = this.computeMergedSettings();
  }

  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly errors: SettingsError[];

  private _merged: Settings;

  get merged(): Settings {
    return this._merged;
  }

  private computeMergedSettings(): Settings {
    return {
      ...this.user.settings,
      ...this.workspace.settings,
    };
  }

  forScope(scope: SettingScope): SettingsFile {
    switch (scope) {
      case SettingScope.User:
        return this.user;
      case SettingScope.Workspace:
        return this.workspace;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }
  }

  setValue(
    scope: SettingScope,
    key: keyof Settings,
    value: string | Record<string, MCPServerConfig> | undefined,
  ): void {
    const settingsFile = this.forScope(scope);
    // @ts-expect-error - value can be string | Record<string, MCPServerConfig>
    settingsFile.settings[key] = value;
    this._merged = this.computeMergedSettings();
    saveSettings(settingsFile);
  }
}

function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName]!;
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
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
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

function validateSettings(
  settings: Settings,
  validKeys: Array<keyof Settings>,
): string[] {
  const invalidKeys = Object.keys(settings).filter(
    (key) => !validKeys.includes(key as keyof Settings),
  );
  return invalidKeys;
}

function loadSettingsFromFile(
  settingsPath: string,
  errors: SettingsError[],
): Settings {
  let settings: Settings = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const parsedSettings = JSON.parse(stripJsonComments(content)) as Settings;

      const invalidKeys = validateSettings(parsedSettings, validSettingKeys);
      if (invalidKeys.length > 0) {
        errors.push({
          message: `Invalid settings found: ${invalidKeys.join(', ')}`,
          path: settingsPath,
        });
      }

      settings = resolveEnvVarsInObject(parsedSettings);
      // Support legacy theme names
      if (settings.theme && settings.theme === 'VS') {
        settings.theme = DefaultLight.name;
      } else if (settings.theme && settings.theme === 'VS2015') {
        settings.theme = DefaultDark.name;
      }
    }
  } catch (error: unknown) {
    errors.push({
      message: getErrorMessage(error),
      path: settingsPath,
    });
  }
  return settings;
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 */
export function loadSettings(workspaceDir: string): LoadedSettings {
  const settingsErrors: SettingsError[] = [];

  const userSettings = loadSettingsFromFile(USER_SETTINGS_PATH, settingsErrors);

  const workspaceSettingsPath = path.join(
    workspaceDir,
    SETTINGS_DIRECTORY_NAME,
    'settings.json',
  );
  const workspaceSettings = loadSettingsFromFile(
    workspaceSettingsPath,
    settingsErrors,
  );

  return new LoadedSettings(
    {
      path: USER_SETTINGS_PATH,
      settings: userSettings,
    },
    {
      path: workspaceSettingsPath,
      settings: workspaceSettings,
    },
    settingsErrors,
  );
}

export function saveSettings(settingsFile: SettingsFile): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(settingsFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(
      settingsFile.path,
      JSON.stringify(settingsFile.settings, null, 2),
      'utf-8',
    );
  } catch (error) {
    console.error('Error saving user settings file:', error);
  }
}
