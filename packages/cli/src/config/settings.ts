/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir, platform } from 'node:os';
import * as dotenv from 'dotenv';
import process from 'node:process';
import {
  GEMINI_CONFIG_DIR as GEMINI_DIR,
  getErrorMessage,
  Storage,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import type { Settings, MemoryImportFormat } from './settingsSchema.js';
import { resolveEnvVarsInObject } from '../utils/envVarResolver.js';
import { mergeWith } from 'lodash-es';

export type { Settings, MemoryImportFormat };

export const SETTINGS_DIRECTORY_NAME = '.gemini';

export const USER_SETTINGS_PATH = Storage.getGlobalSettingsPath();
export const USER_SETTINGS_DIR = path.dirname(USER_SETTINGS_PATH);
export const DEFAULT_EXCLUDED_ENV_VARS = ['DEBUG', 'DEBUG_MODE'];

const MIGRATE_V2_OVERWRITE = false;

// As defined in spec.md
const MIGRATION_MAP: Record<string, string> = {
  preferredEditor: 'general.preferredEditor',
  vimMode: 'general.vimMode',
  disableAutoUpdate: 'general.disableAutoUpdate',
  disableUpdateNag: 'general.disableUpdateNag',
  checkpointing: 'general.checkpointing',
  theme: 'ui.theme',
  customThemes: 'ui.customThemes',
  hideWindowTitle: 'ui.hideWindowTitle',
  hideTips: 'ui.hideTips',
  hideBanner: 'ui.hideBanner',
  hideFooter: 'ui.hideFooter',
  showMemoryUsage: 'ui.showMemoryUsage',
  showLineNumbers: 'ui.showLineNumbers',
  showCitations: 'ui.showCitations',
  accessibility: 'ui.accessibility',
  ideMode: 'ide.enabled',
  hasSeenIdeIntegrationNudge: 'ide.hasSeenNudge',
  usageStatisticsEnabled: 'privacy.usageStatisticsEnabled',
  telemetry: 'telemetry',
  model: 'model.name',
  maxSessionTurns: 'model.maxSessionTurns',
  summarizeToolOutput: 'model.summarizeToolOutput',
  chatCompression: 'model.chatCompression',
  skipNextSpeakerCheck: 'model.skipNextSpeakerCheck',
  contextFileName: 'context.fileName',
  memoryImportFormat: 'context.importFormat',
  memoryDiscoveryMaxDirs: 'context.discoveryMaxDirs',
  includeDirectories: 'context.includeDirectories',
  loadMemoryFromIncludeDirectories: 'context.loadFromIncludeDirectories',
  fileFiltering: 'context.fileFiltering',
  sandbox: 'tools.sandbox',
  shouldUseNodePtyShell: 'tools.usePty',
  allowedTools: 'tools.allowed',
  coreTools: 'tools.core',
  excludeTools: 'tools.exclude',
  toolDiscoveryCommand: 'tools.discoveryCommand',
  toolCallCommand: 'tools.callCommand',
  mcpServerCommand: 'mcp.serverCommand',
  allowMCPServers: 'mcp.allowed',
  excludeMCPServers: 'mcp.excluded',
  folderTrustFeature: 'security.folderTrust.featureEnabled',
  folderTrust: 'security.folderTrust.enabled',
  selectedAuthType: 'security.auth.selectedType',
  useExternalAuth: 'security.auth.useExternal',
  autoConfigureMaxOldSpaceSize: 'advanced.autoConfigureMemory',
  dnsResolutionOrder: 'advanced.dnsResolutionOrder',
  excludedProjectEnvVars: 'advanced.excludedEnvVars',
  bugCommand: 'advanced.bugCommand',
};

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

export interface SettingsError {
  message: string;
  path: string;
}

export interface SettingsFile {
  settings: Settings;
  path: string;
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

function needsMigration(settings: Record<string, unknown>): boolean {
  return !('general' in settings);
}

function migrateSettingsToV2(
  flatSettings: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!needsMigration(flatSettings)) {
    return null;
  }

  const v2Settings: Record<string, unknown> = {};
  const flatKeys = new Set(Object.keys(flatSettings));

  for (const [oldKey, newPath] of Object.entries(MIGRATION_MAP)) {
    if (flatKeys.has(oldKey)) {
      setNestedProperty(v2Settings, newPath, flatSettings[oldKey]);
      flatKeys.delete(oldKey);
    }
  }

  // Preserve mcpServers at the top level
  if (flatSettings['mcpServers']) {
    v2Settings['mcpServers'] = flatSettings['mcpServers'];
    flatKeys.delete('mcpServers');
  }

  // Carry over any unrecognized keys
  for (const remainingKey of flatKeys) {
    v2Settings[remainingKey] = flatSettings[remainingKey];
  }

  return v2Settings;
}

function getNestedProperty(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const REVERSE_MIGRATION_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MIGRATION_MAP).map(([key, value]) => [value, key]),
);

// Dynamically determine the top-level keys from the V2 settings structure.
const KNOWN_V2_CONTAINERS = new Set(
  Object.values(MIGRATION_MAP).map((path) => path.split('.')[0]),
);

export function migrateSettingsToV1(
  v2Settings: Record<string, unknown>,
): Record<string, unknown> {
  const v1Settings: Record<string, unknown> = {};
  const v2Keys = new Set(Object.keys(v2Settings));

  for (const [newPath, oldKey] of Object.entries(REVERSE_MIGRATION_MAP)) {
    const value = getNestedProperty(v2Settings, newPath);
    if (value !== undefined) {
      v1Settings[oldKey] = value;
      v2Keys.delete(newPath.split('.')[0]);
    }
  }

  // Preserve mcpServers at the top level
  if (v2Settings['mcpServers']) {
    v1Settings['mcpServers'] = v2Settings['mcpServers'];
    v2Keys.delete('mcpServers');
  }

  // Carry over any unrecognized keys
  for (const remainingKey of v2Keys) {
    const value = v2Settings[remainingKey];
    if (value === undefined) {
      continue;
    }

    // Don't carry over empty objects that were just containers for migrated settings.
    if (
      KNOWN_V2_CONTAINERS.has(remainingKey) &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    v1Settings[remainingKey] = value;
  }

  return v1Settings;
}

function mergeSettings(
  system: Settings,
  systemDefaults: Settings,
  user: Settings,
  workspace: Settings,
  isTrusted: boolean,
): Settings {
  const safeWorkspace = isTrusted ? workspace : ({} as Settings);

  // folderTrust is not supported at workspace level.
  const { security, ...restOfWorkspace } = safeWorkspace;
  const safeWorkspaceWithoutFolderTrust = security
    ? {
        ...restOfWorkspace,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        security: (({ folderTrust, ...rest }) => rest)(security),
      }
    : {
        ...restOfWorkspace,
        security: {},
      };

  // Settings are merged with the following precedence (last one wins for
  // single values):
  // 1. System Defaults
  // 2. User Settings
  // 3. Workspace Settings
  // 4. System Settings (as overrides)
  //
  // For properties that are arrays (e.g., includeDirectories), the arrays
  // are concatenated. For objects (e.g., customThemes), they are merged.
  return {
    ...systemDefaults,
    ...user,
    ...safeWorkspaceWithoutFolderTrust,
    ...system,
    ui: {
      ...(systemDefaults.ui || {}),
      ...(user.ui || {}),
      ...(safeWorkspaceWithoutFolderTrust.ui || {}),
      ...(system.ui || {}),
      customThemes: {
        ...(systemDefaults.ui?.customThemes || {}),
        ...(user.ui?.customThemes || {}),
        ...(safeWorkspaceWithoutFolderTrust.ui?.customThemes || {}),
        ...(system.ui?.customThemes || {}),
      },
    },
    security: {
      ...(systemDefaults.security || {}),
      ...(user.security || {}),
      ...(safeWorkspaceWithoutFolderTrust.security || {}),
      ...(system.security || {}),
    },
    mcp: {
      ...(systemDefaults.mcp || {}),
      ...(user.mcp || {}),
      ...(safeWorkspaceWithoutFolderTrust.mcp || {}),
      ...(system.mcp || {}),
    },
    mcpServers: {
      ...(systemDefaults.mcpServers || {}),
      ...(user.mcpServers || {}),
      ...(safeWorkspaceWithoutFolderTrust.mcpServers || {}),
      ...(system.mcpServers || {}),
    },
    context: {
      ...(systemDefaults.context || {}),
      ...(user.context || {}),
      ...(safeWorkspaceWithoutFolderTrust.context || {}),
      ...(system.context || {}),
      includeDirectories: [
        ...(systemDefaults.context?.includeDirectories || []),
        ...(user.context?.includeDirectories || []),
        ...(safeWorkspaceWithoutFolderTrust.context?.includeDirectories || []),
        ...(system.context?.includeDirectories || []),
      ],
    },
    model: {
      ...(systemDefaults.model || {}),
      ...(user.model || {}),
      ...(safeWorkspaceWithoutFolderTrust.model || {}),
      ...(system.model || {}),
      chatCompression: {
        ...(systemDefaults.model?.chatCompression || {}),
        ...(user.model?.chatCompression || {}),
        ...(safeWorkspaceWithoutFolderTrust.model?.chatCompression || {}),
        ...(system.model?.chatCompression || {}),
      },
    },
    advanced: {
      ...(systemDefaults.advanced || {}),
      ...(user.advanced || {}),
      ...(safeWorkspaceWithoutFolderTrust.advanced || {}),
      ...(system.advanced || {}),
      excludedEnvVars: [
        ...new Set([
          ...(systemDefaults.advanced?.excludedEnvVars || []),
          ...(user.advanced?.excludedEnvVars || []),
          ...(safeWorkspaceWithoutFolderTrust.advanced?.excludedEnvVars || []),
          ...(system.advanced?.excludedEnvVars || []),
        ]),
      ],
    },
    extensions: {
      ...(systemDefaults.extensions || {}),
      ...(user.extensions || {}),
      ...(safeWorkspaceWithoutFolderTrust.extensions || {}),
      ...(system.extensions || {}),
      disabled: [
        ...new Set([
          ...(systemDefaults.extensions?.disabled || []),
          ...(user.extensions?.disabled || []),
          ...(safeWorkspaceWithoutFolderTrust.extensions?.disabled || []),
          ...(system.extensions?.disabled || []),
        ]),
      ],
      workspacesWithMigrationNudge: [
        ...new Set([
          ...(systemDefaults.extensions?.workspacesWithMigrationNudge || []),
          ...(user.extensions?.workspacesWithMigrationNudge || []),
          ...(safeWorkspaceWithoutFolderTrust.extensions
            ?.workspacesWithMigrationNudge || []),
          ...(system.extensions?.workspacesWithMigrationNudge || []),
        ]),
      ],
    },
  };
}

export class LoadedSettings {
  constructor(
    system: SettingsFile,
    systemDefaults: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    errors: SettingsError[],
    isTrusted: boolean,
    migratedInMemorScopes: Set<SettingScope>,
  ) {
    this.system = system;
    this.systemDefaults = systemDefaults;
    this.user = user;
    this.workspace = workspace;
    this.errors = errors;
    this.isTrusted = isTrusted;
    this.migratedInMemorScopes = migratedInMemorScopes;
    this._merged = this.computeMergedSettings();
  }

  readonly system: SettingsFile;
  readonly systemDefaults: SettingsFile;
  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly errors: SettingsError[];
  readonly isTrusted: boolean;
  readonly migratedInMemorScopes: Set<SettingScope>;

  private _merged: Settings;

  get merged(): Settings {
    return this._merged;
  }

  private computeMergedSettings(): Settings {
    return mergeSettings(
      this.system.settings,
      this.systemDefaults.settings,
      this.user.settings,
      this.workspace.settings,
      this.isTrusted,
    );
  }

  forScope(scope: SettingScope): SettingsFile {
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

  setValue(scope: SettingScope, key: string, value: unknown): void {
    const settingsFile = this.forScope(scope);
    setNestedProperty(settingsFile.settings, key, value);
    this._merged = this.computeMergedSettings();
    saveSettings(settingsFile);
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

  if (!isWorkspaceTrusted(settings)) {
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
export function loadSettings(workspaceDir: string): LoadedSettings {
  let systemSettings: Settings = {};
  let systemDefaultSettings: Settings = {};
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];
  const systemSettingsPath = getSystemSettingsPath();
  const systemDefaultsPath = getSystemDefaultsPath();
  const migratedInMemorScopes = new Set<SettingScope>();

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

  const loadAndMigrate = (filePath: string, scope: SettingScope): Settings => {
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
          });
          return {};
        }

        let settingsObject = rawSettings as Record<string, unknown>;
        if (needsMigration(settingsObject)) {
          const migratedSettings = migrateSettingsToV2(settingsObject);
          if (migratedSettings) {
            if (MIGRATE_V2_OVERWRITE) {
              try {
                fs.renameSync(filePath, `${filePath}.orig`);
                fs.writeFileSync(
                  filePath,
                  JSON.stringify(migratedSettings, null, 2),
                  'utf-8',
                );
              } catch (e) {
                console.error(
                  `Error migrating settings file on disk: ${getErrorMessage(
                    e,
                  )}`,
                );
              }
            } else {
              migratedInMemorScopes.add(scope);
            }
            settingsObject = migratedSettings;
          }
        }
        return settingsObject as Settings;
      }
    } catch (error: unknown) {
      settingsErrors.push({
        message: getErrorMessage(error),
        path: filePath,
      });
    }
    return {};
  };

  systemSettings = loadAndMigrate(systemSettingsPath, SettingScope.System);
  systemDefaultSettings = loadAndMigrate(
    systemDefaultsPath,
    SettingScope.SystemDefaults,
  );
  userSettings = loadAndMigrate(USER_SETTINGS_PATH, SettingScope.User);

  if (realWorkspaceDir !== realHomeDir) {
    workspaceSettings = loadAndMigrate(
      workspaceSettingsPath,
      SettingScope.Workspace,
    );
  }

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
  const initialTrustCheckSettings = mergeWith({}, systemSettings, userSettings);
  const isTrusted =
    isWorkspaceTrusted(initialTrustCheckSettings as Settings) ?? true;

  // Create a temporary merged settings object to pass to loadEnvironment.
  const tempMergedSettings = mergeSettings(
    systemSettings,
    systemDefaultSettings,
    userSettings,
    workspaceSettings,
    isTrusted,
  );

  // loadEnviroment depends on settings so we have to create a temp version of
  // the settings to avoid a cycle
  loadEnvironment(tempMergedSettings);

  // Now that the environment is loaded, resolve variables in the settings.
  systemSettings = resolveEnvVarsInObject(systemSettings);
  userSettings = resolveEnvVarsInObject(userSettings);
  workspaceSettings = resolveEnvVarsInObject(workspaceSettings);

  // Create LoadedSettings first
  const loadedSettings = new LoadedSettings(
    {
      path: systemSettingsPath,
      settings: systemSettings,
    },
    {
      path: systemDefaultsPath,
      settings: systemDefaultSettings,
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
    isTrusted,
    migratedInMemorScopes,
  );

  return loadedSettings;
}

export function saveSettings(settingsFile: SettingsFile): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(settingsFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let settingsToSave = settingsFile.settings;
    if (!MIGRATE_V2_OVERWRITE) {
      settingsToSave = migrateSettingsToV1(
        settingsToSave as Record<string, unknown>,
      ) as Settings;
    }

    fs.writeFileSync(
      settingsFile.path,
      JSON.stringify(settingsToSave, null, 2),
      'utf-8',
    );
  } catch (error) {
    console.error('Error saving user settings file:', error);
  }
}
