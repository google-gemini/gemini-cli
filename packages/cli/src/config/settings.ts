/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { platform } from 'node:os';
import * as dotenv from 'dotenv';
import process from 'node:process';
import {
  FatalConfigError,
  GEMINI_DIR,
  getErrorMessage,
  Storage,
  coreEvents,
  homedir,
  type GeminiCodeAssistSetting,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import {
  type Settings,
  type MergedSettings,
  type MemoryImportFormat,
  type MergeStrategy,
  type SettingsSchema,
  type SettingDefinition,
  getSettingsSchema,
} from './settingsSchema.js';

export {
  type Settings,
  type MergedSettings,
  type MemoryImportFormat,
  type MergeStrategy,
  type SettingsSchema,
  type SettingDefinition,
  getSettingsSchema,
};

import { resolveEnvVarsInObject } from '../utils/envVarResolver.js';
import { customDeepMerge } from '../utils/deepMerge.js';
import { updateSettingsFilePreservingFormat } from '../utils/commentJson.js';
import {
  validateSettings,
  formatValidationError,
} from './settings-validation.js';

function getMergeStrategyForPath(path: string[]): MergeStrategy | undefined {
  let current: SettingDefinition | undefined = undefined;
  let currentSchema: SettingsSchema | undefined = getSettingsSchema();
  let parent: SettingDefinition | undefined = undefined;

  for (const key of path) {
    if (!currentSchema || !currentSchema[key]) {
      // Key not found in schema - check if parent has additionalProperties
      if (parent?.additionalProperties?.mergeStrategy) {
        return parent.additionalProperties.mergeStrategy;
      }
      return undefined;
    }
    parent = current;
    current = currentSchema[key];
    currentSchema = current.properties;
  }

  return current?.mergeStrategy;
}

export const USER_SETTINGS_PATH = Storage.getGlobalSettingsPath();
export const USER_SETTINGS_DIR = path.dirname(USER_SETTINGS_PATH);
export const DEFAULT_EXCLUDED_ENV_VARS = ['DEBUG', 'DEBUG_MODE'];

export function getSystemSettingsPath(): string {
  if (process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH']) {
    return process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
  }
  if (platform() === 'darwin') {
    return '/Library/Application Support/GeminiCli/settings.json';
  } else if (platform() === 'win32') {
    return 'C:\\ProgramData\\gemini-cli\\settings.json';
  } else {
    return '/etc/gemini-cli/settings.json';
  }
}

export function getSystemDefaultsPath(): string {
  if (process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH']) {
    return process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH'];
  }
  return path.join(
    path.dirname(getSystemSettingsPath()),
    'system-defaults.json',
  );
}

export type { DnsResolutionOrder } from './settingsSchema.js';

export enum SettingScope {
  User = 'User',
  Workspace = 'Workspace',
  System = 'System',
  SystemDefaults = 'SystemDefaults',
  // Note that this scope is not supported in the settings dialog at this time,
  // it is only supported for extensions.
  Session = 'Session',
}

/**
 * A type representing the settings scopes that are supported for LoadedSettings.
 */
export type LoadableSettingScope =
  | SettingScope.User
  | SettingScope.Workspace
  | SettingScope.System
  | SettingScope.SystemDefaults;

/**
 * The actual values of the loadable settings scopes.
 */
const _loadableSettingScopes = [
  SettingScope.User,
  SettingScope.Workspace,
  SettingScope.System,
  SettingScope.SystemDefaults,
];

/**
 * A type guard function that checks if `scope` is a loadable settings scope,
 * and allows promotion to the `LoadableSettingsScope` type based on the result.
 */
export function isLoadableSettingScope(
  scope: SettingScope,
): scope is LoadableSettingScope {
  return _loadableSettingScopes.includes(scope);
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
  screenReader?: boolean;
}

export interface SessionRetentionSettings {
  /** Enable automatic session cleanup */
  enabled?: boolean;

  /** Maximum age of sessions to keep (e.g., "30d", "7d", "24h", "1w") */
  maxAge?: string;

  /** Alternative: Maximum number of sessions to keep (most recent) */
  maxCount?: number;

  /** Minimum retention period (safety limit, defaults to "1d") */
  minRetention?: string;
}

export interface SettingsError {
  message: string;
  path: string;
  severity: 'error' | 'warning';
}

export interface SettingsFile {
  settings: Settings;
  originalSettings: Settings;
  path: string;
  rawJson?: string;
}

function setNestedProperty(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current: Record<string, unknown> = obj;
  for (const key of keys) {
    if (current[key] === undefined) {
      current[key] = {};
    }
    const next = current[key];
    if (typeof next === 'object' && next !== null) {
      current = next as Record<string, unknown>;
    } else {
      // This path is invalid, so we stop.
      return;
    }
  }
  current[lastKey] = value;
}

export function getDefaultsFromSchema(
  schema: SettingsSchema = getSettingsSchema(),
): Settings {
  const defaults: Record<string, unknown> = {};
  for (const key in schema) {
    const definition = schema[key];
    if (definition.properties) {
      defaults[key] = getDefaultsFromSchema(definition.properties);
    } else if (definition.default !== undefined) {
      defaults[key] = definition.default;
    }
  }
  return defaults as Settings;
}

export function mergeSettings(
  system: Settings,
  systemDefaults: Settings,
  user: Settings,
  workspace: Settings,
  isTrusted: boolean,
): MergedSettings {
  const safeWorkspace = isTrusted ? workspace : ({} as Settings);
  const schemaDefaults = getDefaultsFromSchema();

  // Settings are merged with the following precedence (last one wins for
  // single values):
  // 1. Schema Defaults (Built-in)
  // 2. System Defaults
  // 3. User Settings
  // 4. Workspace Settings
  // 5. System Settings (as overrides)
  return customDeepMerge(
    getMergeStrategyForPath,
    schemaDefaults,
    systemDefaults,
    user,
    safeWorkspace,
    system,
  ) as MergedSettings;
}

/**
 * Creates a fully populated MergedSettings object for testing purposes.
 * It merges the provided overrides with the default settings from the schema.
 *
 * @param overrides Partial settings to override the defaults.
 * @returns A complete MergedSettings object.
 */
export function createTestMergedSettings(
  overrides: Partial<Settings> = {},
): MergedSettings {
  return customDeepMerge(
    getMergeStrategyForPath,
    getDefaultsFromSchema(),
    overrides,
  ) as MergedSettings;
}

export class LoadedSettings {
  constructor(
    system: SettingsFile,
    systemDefaults: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    isTrusted: boolean,
    errors: SettingsError[] = [],
  ) {
    this.system = system;
    this.systemDefaults = systemDefaults;
    this.user = user;
    this.workspace = workspace;
    this.isTrusted = isTrusted;
    this.errors = errors;
    this._merged = this.computeMergedSettings();
  }

  readonly system: SettingsFile;
  readonly systemDefaults: SettingsFile;
  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly isTrusted: boolean;
  readonly errors: SettingsError[];

  private _merged: MergedSettings;
  private _remoteAdminSettings: Partial<Settings> | undefined;

  get merged(): MergedSettings {
    return this._merged;
  }

  private computeMergedSettings(): MergedSettings {
    const merged = mergeSettings(
      this.system.settings,
      this.systemDefaults.settings,
      this.user.settings,
      this.workspace.settings,
      this.isTrusted,
    );

    // Remote admin settings always take precedence and file-based admin settings
    // are ignored.
    const adminSettingSchema = getSettingsSchema().admin;
    if (adminSettingSchema?.properties) {
      const adminSchema = adminSettingSchema.properties;
      const adminDefaults = getDefaultsFromSchema(adminSchema);

      // The final admin settings are the defaults overridden by remote settings.
      // Any admin settings from files are ignored.
      merged.admin = customDeepMerge(
        (path: string[]) => getMergeStrategyForPath(['admin', ...path]),
        adminDefaults,
        this._remoteAdminSettings?.admin ?? {},
      ) as MergedSettings['admin'];
    }
    return merged;
  }

  forScope(scope: LoadableSettingScope): SettingsFile {
    switch (scope) {
      case SettingScope.User:
        return this.user;
      case SettingScope.Workspace:
        return this.workspace;
      case SettingScope.System:
        return this.system;
      case SettingScope.SystemDefaults:
        return this.systemDefaults;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }
  }

  setValue(scope: LoadableSettingScope, key: string, value: unknown): void {
    const settingsFile = this.forScope(scope);
    setNestedProperty(settingsFile.settings, key, value);
    setNestedProperty(settingsFile.originalSettings, key, value);
    this._merged = this.computeMergedSettings();
    saveSettings(settingsFile);
    coreEvents.emitSettingsChanged();
  }

  setRemoteAdminSettings(remoteSettings: GeminiCodeAssistSetting): void {
    const admin: Settings['admin'] = {};
    const { secureModeEnabled, mcpSetting, cliFeatureSetting } = remoteSettings;

    if (secureModeEnabled !== undefined) {
      admin.secureModeEnabled = secureModeEnabled;
    }

    if (mcpSetting?.mcpEnabled !== undefined) {
      admin.mcp = { enabled: mcpSetting.mcpEnabled };
    }

    const extensionsSetting = cliFeatureSetting?.extensionsSetting;
    if (extensionsSetting?.extensionsEnabled !== undefined) {
      admin.extensions = { enabled: extensionsSetting.extensionsEnabled };
    }

    this._remoteAdminSettings = { admin };
    this._merged = this.computeMergedSettings();
  }
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
    if (parsedEnv['GOOGLE_CLOUD_PROJECT']) {
      // .env file takes precedence in Cloud Shell
      process.env['GOOGLE_CLOUD_PROJECT'] = parsedEnv['GOOGLE_CLOUD_PROJECT'];
    } else {
      // If not in .env, set to default and override global
      process.env['GOOGLE_CLOUD_PROJECT'] = 'cloudshell-gca';
    }
  } else {
    // If no .env file, set to default and override global
    process.env['GOOGLE_CLOUD_PROJECT'] = 'cloudshell-gca';
  }
}

export function loadEnvironment(settings: Settings): void {
  const envFilePath = findEnvFile(process.cwd());

  if (!isWorkspaceTrusted(settings).isTrusted) {
    return;
  }

  // Cloud Shell environment variable handling
  if (process.env['CLOUD_SHELL'] === 'true') {
    setUpCloudShellEnvironment(envFilePath);
  }

  if (envFilePath) {
    // Manually parse and load environment variables to handle exclusions correctly.
    // This avoids modifying environment variables that were already set from the shell.
    try {
      const envFileContent = fs.readFileSync(envFilePath, 'utf-8');
      const parsedEnv = dotenv.parse(envFileContent);

      const excludedVars =
        settings?.advanced?.excludedEnvVars || DEFAULT_EXCLUDED_ENV_VARS;
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
export function loadSettings(
  workspaceDir: string = process.cwd(),
): LoadedSettings {
  let systemSettings: Settings = {};
  let systemDefaultSettings: Settings = {};
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];
  const systemSettingsPath = getSystemSettingsPath();
  const systemDefaultsPath = getSystemDefaultsPath();

  // Resolve paths to their canonical representation to handle symlinks
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

  const workspaceSettingsPath = new Storage(
    workspaceDir,
  ).getWorkspaceSettingsPath();

  const load = (filePath: string): { settings: Settings; rawJson?: string } => {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const rawSettings: unknown = JSON.parse(stripJsonComments(content));

        if (
          typeof rawSettings !== 'object' ||
          rawSettings === null ||
          Array.isArray(rawSettings)
        ) {
          settingsErrors.push({
            message: 'Settings file is not a valid JSON object.',
            path: filePath,
            severity: 'error',
          });
          return { settings: {} };
        }

        const settingsObject = rawSettings as Record<string, unknown>;

        // Validate settings structure with Zod
        const validationResult = validateSettings(settingsObject);
        if (!validationResult.success && validationResult.error) {
          const errorMessage = formatValidationError(
            validationResult.error,
            filePath,
          );
          settingsErrors.push({
            message: errorMessage,
            path: filePath,
            severity: 'warning',
          });
        }

        return { settings: settingsObject as Settings, rawJson: content };
      }
    } catch (error: unknown) {
      settingsErrors.push({
        message: getErrorMessage(error),
        path: filePath,
        severity: 'error',
      });
    }
    return { settings: {} };
  };

  const systemResult = load(systemSettingsPath);
  const systemDefaultsResult = load(systemDefaultsPath);
  const userResult = load(USER_SETTINGS_PATH);

  let workspaceResult: { settings: Settings; rawJson?: string } = {
    settings: {} as Settings,
    rawJson: undefined,
  };
  if (realWorkspaceDir !== realHomeDir) {
    workspaceResult = load(workspaceSettingsPath);
  }

  const systemOriginalSettings = structuredClone(systemResult.settings);
  const systemDefaultsOriginalSettings = structuredClone(
    systemDefaultsResult.settings,
  );
  const userOriginalSettings = structuredClone(userResult.settings);
  const workspaceOriginalSettings = structuredClone(workspaceResult.settings);

  // Environment variables for runtime use
  systemSettings = resolveEnvVarsInObject(systemResult.settings);
  systemDefaultSettings = resolveEnvVarsInObject(systemDefaultsResult.settings);
  userSettings = resolveEnvVarsInObject(userResult.settings);
  workspaceSettings = resolveEnvVarsInObject(workspaceResult.settings);

  // Support legacy theme names
  if (userSettings.ui?.theme === 'VS') {
    userSettings.ui.theme = DefaultLight.name;
  } else if (userSettings.ui?.theme === 'VS2015') {
    userSettings.ui.theme = DefaultDark.name;
  }
  if (workspaceSettings.ui?.theme === 'VS') {
    workspaceSettings.ui.theme = DefaultLight.name;
  } else if (workspaceSettings.ui?.theme === 'VS2015') {
    workspaceSettings.ui.theme = DefaultDark.name;
  }

  // For the initial trust check, we can only use user and system settings.
  const initialTrustCheckSettings = customDeepMerge(
    getMergeStrategyForPath,
    {},
    systemSettings,
    userSettings,
  );
  const isTrusted =
    isWorkspaceTrusted(initialTrustCheckSettings as Settings).isTrusted ?? true;

  // Create a temporary merged settings object to pass to loadEnvironment.
  const tempMergedSettings = mergeSettings(
    systemSettings,
    systemDefaultSettings,
    userSettings,
    workspaceSettings,
    isTrusted,
  );

  // loadEnvironment depends on settings so we have to create a temp version of
  // the settings to avoid a cycle
  loadEnvironment(tempMergedSettings);

  // Check for any fatal errors before proceeding
  const fatalErrors = settingsErrors.filter((e) => e.severity === 'error');
  if (fatalErrors.length > 0) {
    const errorMessages = fatalErrors.map(
      (error) => `Error in ${error.path}: ${error.message}`,
    );
    throw new FatalConfigError(
      `${errorMessages.join('\n')}\nPlease fix the configuration file(s) and try again.`,
    );
  }

  return new LoadedSettings(
    {
      path: systemSettingsPath,
      settings: systemSettings,
      originalSettings: systemOriginalSettings,
      rawJson: systemResult.rawJson,
    },
    {
      path: systemDefaultsPath,
      settings: systemDefaultSettings,
      originalSettings: systemDefaultsOriginalSettings,
      rawJson: systemDefaultsResult.rawJson,
    },
    {
      path: USER_SETTINGS_PATH,
      settings: userSettings,
      originalSettings: userOriginalSettings,
      rawJson: userResult.rawJson,
    },
    {
      path: workspaceSettingsPath,
      settings: workspaceSettings,
      originalSettings: workspaceOriginalSettings,
      rawJson: workspaceResult.rawJson,
    },
    isTrusted,
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

    const settingsToSave = settingsFile.originalSettings;

    // Use the format-preserving update function
    updateSettingsFilePreservingFormat(
      settingsFile.path,
      settingsToSave as Record<string, unknown>,
    );
  } catch (error) {
    coreEvents.emitFeedback(
      'error',
      'There was an error saving your latest settings changes.',
      error,
    );
  }
}

export function saveModelChange(
  loadedSettings: LoadedSettings,
  model: string,
): void {
  try {
    loadedSettings.setValue(SettingScope.User, 'model.name', model);
  } catch (error) {
    coreEvents.emitFeedback(
      'error',
      'There was an error saving your preferred model.',
      error,
    );
  }
}
