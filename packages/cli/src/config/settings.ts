/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir, platform } from 'os';
import * as dotenv from 'dotenv';
import {
  MCPServerConfig,
  GEMINI_CONFIG_DIR as GEMINI_DIR,
  getErrorMessage,
  BugCommandSettings,
  TelemetrySettings,
  AuthType,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { CustomTheme } from '../ui/themes/theme.js';

export const SETTINGS_DIRECTORY_NAME = '.gemini';
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');
export const DEFAULT_EXCLUDED_ENV_VARS = ['DEBUG', 'DEBUG_MODE'];

export function getSystemSettingsPath(): string {
  if (process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH) {
    return process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
  }
  if (platform() === 'darwin') {
    return '/Library/Application Support/GeminiCli/settings.json';
  } else if (platform() === 'win32') {
    return 'C:\\ProgramData\\gemini-cli\\settings.json';
  } else {
    return '/etc/gemini-cli/settings.json';
  }
}

export function getWorkspaceSettingsPath(workspaceDir: string): string {
  return path.join(workspaceDir, SETTINGS_DIRECTORY_NAME, 'settings.json');
}

export type DnsResolutionOrder = 'ipv4first' | 'verbatim';

export enum SettingScope {
  User = 'User',
  Workspace = 'Workspace',
  System = 'System',
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface Settings {
  theme?: string;
  customThemes?: Record<string, CustomTheme>;
  selectedAuthType?: AuthType;
  useExternalAuth?: boolean;
  sandbox?: boolean | string;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  allowMCPServers?: string[];
  excludeMCPServers?: string[];
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  preferredEditor?: string;
  bugCommand?: BugCommandSettings;
  checkpointing?: CheckpointingSettings;
  autoConfigureMaxOldSpaceSize?: boolean;
  /** The model name to use (e.g 'gemini-9.0-pro') */
  model?: string;

  // Git-aware file filtering settings
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };

  hideWindowTitle?: boolean;

  hideTips?: boolean;
  hideBanner?: boolean;

  // Setting for setting maximum number of user/model/tool turns in a session.
  maxSessionTurns?: number;

  // A map of tool names to their summarization settings.
  summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;

  vimMode?: boolean;
  memoryImportFormat?: 'tree' | 'flat';

  // Flag to be removed post-launch.
  ideModeFeature?: boolean;
  /// IDE mode setting configured via slash command toggle.
  ideMode?: boolean;

  // Setting for disabling auto-update.
  disableAutoUpdate?: boolean;

  // Setting for disabling the update nag message.
  disableUpdateNag?: boolean;

  memoryDiscoveryMaxDirs?: number;

  // Environment variables to exclude from project .env files
  excludedProjectEnvVars?: string[];
  dnsResolutionOrder?: DnsResolutionOrder;
}

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
    system: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    errors: SettingsError[],
  ) {
    this.system = system;
    this.user = user;
    this.workspace = workspace;
    this.errors = errors;
    this._merged = this.computeMergedSettings();
  }

  readonly system: SettingsFile;
  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly errors: SettingsError[];

  private _merged: Settings;

  get merged(): Settings {
    return this._merged;
  }

  private computeMergedSettings(): Settings {
    const system = this.system.settings;
    const user = this.user.settings;
    const workspace = this.workspace.settings;

    return {
      ...user,
      ...workspace,
      ...system,
      customThemes: {
        ...(user.customThemes || {}),
        ...(workspace.customThemes || {}),
        ...(system.customThemes || {}),
      },
      mcpServers: {
        ...(user.mcpServers || {}),
        ...(workspace.mcpServers || {}),
        ...(system.mcpServers || {}),
      },
    };
  }

  forScope(scope: SettingScope): SettingsFile {
    switch (scope) {
      case SettingScope.User:
        return this.user;
      case SettingScope.Workspace:
        return this.workspace;
      case SettingScope.System:
        return this.system;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }
  }

  setValue<K extends keyof Settings>(
    scope: SettingScope,
    key: K,
    value: Settings[K],
  ): void {
    const settingsFile = this.forScope(scope);
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

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}

export function setUpCloudShellEnvironment(envFilePath: string | null): void {
  // Special handling for GOOGLE_CLOUD_PROJECT in Cloud Shell:
  // Because GOOGLE_CLOUD_PROJECT in Cloud Shell tracks the project
  // set by the user using "gcloud config set project" we do not want to
  // use its value. So, unless the user overrides GOOGLE_CLOUD_PROJECT in
  // one of the .env files, we set the Cloud Shell-specific default here.
  if (envFilePath && fs.existsSync(envFilePath)) {
    const envFileContent = fs.readFileSync(envFilePath);
    const parsedEnv = dotenv.parse(envFileContent);
    if (parsedEnv.GOOGLE_CLOUD_PROJECT) {
      // .env file takes precedence in Cloud Shell
      process.env.GOOGLE_CLOUD_PROJECT = parsedEnv.GOOGLE_CLOUD_PROJECT;
    } else {
      // If not in .env, set to default and override global
      process.env.GOOGLE_CLOUD_PROJECT = 'cloudshell-gca';
    }
  } else {
    // If no .env file, set to default and override global
    process.env.GOOGLE_CLOUD_PROJECT = 'cloudshell-gca';
  }
}

export function loadEnvironment(settings?: Settings): void {
  const envFilePath = findEnvFile(process.cwd());

  // Cloud Shell environment variable handling
  if (process.env.CLOUD_SHELL === 'true') {
    setUpCloudShellEnvironment(envFilePath);
  }

  // If no settings provided, try to load workspace settings for exclusions
  let resolvedSettings = settings;
  if (!resolvedSettings) {
    const workspaceSettingsPath = getWorkspaceSettingsPath(process.cwd());
    try {
      if (fs.existsSync(workspaceSettingsPath)) {
        const workspaceContent = fs.readFileSync(
          workspaceSettingsPath,
          'utf-8',
        );
        const parsedWorkspaceSettings = JSON.parse(
          stripJsonComments(workspaceContent),
        ) as Settings;
        resolvedSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
      }
    } catch (_e) {
      // Ignore errors loading workspace settings
    }
  }

  if (envFilePath) {
    // Manually parse and load environment variables to handle exclusions correctly.
    // This avoids modifying environment variables that were already set from the shell.
    try {
      const envFileContent = fs.readFileSync(envFilePath, 'utf-8');
      const parsedEnv = dotenv.parse(envFileContent);

      const excludedVars =
        resolvedSettings?.excludedProjectEnvVars || DEFAULT_EXCLUDED_ENV_VARS;
      const isProjectEnvFile = !envFilePath.includes(GEMINI_DIR);

      for (const key in parsedEnv) {
        if (Object.hasOwn(parsedEnv, key)) {
          // If it's a project .env file, skip loading excluded variables.
          if (isProjectEnvFile && excludedVars.includes(key)) {
            continue;
          }

          // Load variable only if it's not already set in the environment.
          if (!Object.hasOwn(process.env, key)) {
            process.env[key] = parsedEnv[key];
          }
        }
      }
    } catch (_e) {
      // Errors are ignored to match the behavior of `dotenv.config({ quiet: true })`.
    }
  }
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 */
export function loadSettings(workspaceDir: string): LoadedSettings {
  let systemSettings: Settings = {};
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];
  const systemSettingsPath = getSystemSettingsPath();

  // FIX: Resolve paths to their canonical representation to handle symlinks
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  const resolvedHomeDir = path.resolve(homedir());

  let realWorkspaceDir = resolvedWorkspaceDir;
  try {
    // fs.realpathSync gets the "true" path, resolving any symlinks
    realWorkspaceDir = fs.realpathSync(resolvedWorkspaceDir);
  } catch (_e) {
    // This is okay. The path might not exist yet, and that's a valid state.
  }

  // We expect homedir to always exist and be resolvable.
  const realHomeDir = fs.realpathSync(resolvedHomeDir);

  const workspaceSettingsPath = getWorkspaceSettingsPath(workspaceDir);

  // Load system settings
  try {
    if (fs.existsSync(systemSettingsPath)) {
      const systemContent = fs.readFileSync(systemSettingsPath, 'utf-8');
      const parsedSystemSettings = JSON.parse(
        stripJsonComments(systemContent),
      ) as Settings;
      systemSettings = resolveEnvVarsInObject(parsedSystemSettings);
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: systemSettingsPath,
    });
  }

  // Load user settings
  try {
    if (fs.existsSync(USER_SETTINGS_PATH)) {
      const userContent = fs.readFileSync(USER_SETTINGS_PATH, 'utf-8');
      const parsedUserSettings = JSON.parse(
        stripJsonComments(userContent),
      ) as Settings;
      userSettings = resolveEnvVarsInObject(parsedUserSettings);
      // Support legacy theme names
      if (userSettings.theme && userSettings.theme === 'VS') {
        userSettings.theme = DefaultLight.name;
      } else if (userSettings.theme && userSettings.theme === 'VS2015') {
        userSettings.theme = DefaultDark.name;
      }
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: USER_SETTINGS_PATH,
    });
  }

  // This comparison is now much more reliable.
  if (realWorkspaceDir !== realHomeDir) {
    // Load workspace settings
    try {
      if (fs.existsSync(workspaceSettingsPath)) {
        const projectContent = fs.readFileSync(workspaceSettingsPath, 'utf-8');
        const parsedWorkspaceSettings = JSON.parse(
          stripJsonComments(projectContent),
        ) as Settings;
        workspaceSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
        if (workspaceSettings.theme && workspaceSettings.theme === 'VS') {
          workspaceSettings.theme = DefaultLight.name;
        } else if (
          workspaceSettings.theme &&
          workspaceSettings.theme === 'VS2015'
        ) {
          workspaceSettings.theme = DefaultDark.name;
        }
      }
    } catch (error: unknown) {
      settingsErrors.push({
        message: getErrorMessage(error),
        path: workspaceSettingsPath,
      });
    }
  }

  // Create LoadedSettings first
  const loadedSettings = new LoadedSettings(
    {
      path: systemSettingsPath,
      settings: systemSettings,
    },
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

  // Load environment with merged settings
  loadEnvironment(loadedSettings.merged);

  return loadedSettings;
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
