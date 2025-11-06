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
  debugLogger,
  FatalConfigError,
  GEMINI_DIR,
  getErrorMessage,
  Storage,
  coreEvents,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import {
  type Settings,
  type MemoryImportFormat,
  type MergeStrategy,
  type SettingsSchema,
  type SettingDefinition,
  getSettingsSchema,
} from './settingsSchema.js';
import { resolveEnvVarsInObject } from '../utils/envVarResolver.js';
import { customDeepMerge, type MergeableObject } from '../utils/deepMerge.js';
import { updateSettingsFilePreservingFormat } from '../utils/commentJson.js';
import type { ExtensionManager } from './extension-manager.js';
import { ExtensionSettingsValidator } from './extension-settings-validator.js';
import type { ExtensionSettings } from './extension-settings.js';
import { ExtensionEnablementManager } from './extensions/extensionEnablement.js';

interface ConflictTracker {
  conflicts: Map<string, { extensions: string[]; value: unknown }>;
  ownership: Map<string, string>;
}

function deepMergeWithArrayAppend(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  path = '',
  tracker?: ConflictTracker,
  extensionName?: string,
): unknown {
  const validator = new ExtensionSettingsValidator();

  if (Array.isArray(target) && Array.isArray(source)) {
    if (validator.isArrayAppendSetting(path)) {
      return [...target, ...source].filter(
        (item, index, self) => self.indexOf(item) === index,
      );
    } else {
      return source;
    }
  }

  if (
    typeof target === 'object' &&
    typeof source === 'object' &&
    target !== null &&
    source !== null &&
    !Array.isArray(target) &&
    !Array.isArray(source)
  ) {
    const merged = { ...target };

    for (const [key, value] of Object.entries(source)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (key in merged) {
        merged[key] = deepMergeWithArrayAppend(
          merged[key] as Record<string, unknown>,
          value as Record<string, unknown>,
          currentPath,
          tracker,
          extensionName,
        );
      } else {
        merged[key] = value;
        if (tracker && extensionName) {
          tracker.ownership.set(currentPath, extensionName);
        }
      }
    }

    return merged;
  }

  if (tracker && extensionName && path) {
    const previousOwner = tracker.ownership.get(path);
    if (previousOwner && previousOwner !== extensionName) {
      const existing = tracker.conflicts.get(path);
      if (existing) {
        if (!existing.extensions.includes(extensionName)) {
          existing.extensions.push(extensionName);
        }
      } else {
        tracker.conflicts.set(path, {
          extensions: [previousOwner, extensionName],
          value: source,
        });
      }
    }
    tracker.ownership.set(path, extensionName);
  }

  return source;
}

function resolveExtensionVariables(
  settings: unknown,
  extensionPath: string,
  workspacePath?: string,
): unknown {
  if (typeof settings === 'string') {
    return settings
      .replace(/\${extensionPath}/g, extensionPath)
      .replace(/\${workspacePath}/g, workspacePath || process.cwd())
      .replace(/\${\/}/g, path.sep)
      .replace(/\${pathSeparator}/g, path.sep);
  }

  if (Array.isArray(settings)) {
    return settings.map((item) =>
      resolveExtensionVariables(item, extensionPath, workspacePath),
    );
  }

  if (typeof settings === 'object' && settings !== null) {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings)) {
      resolved[key] = resolveExtensionVariables(
        value,
        extensionPath,
        workspacePath,
      );
    }
    return resolved;
  }

  return settings;
}

function parseEnabledExtensionsFromArgv(): string[] | undefined {
  // Handle test environments where process.argv might not be set
  if (!process.argv || !Array.isArray(process.argv)) {
    return undefined;
  }

  const args = process.argv.slice(2);
  const extensions: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-e' || arg === '--extensions') {
      if (i + 1 < args.length) {
        extensions.push(...args[i + 1].split(',').map((e) => e.trim()));
        i++;
      }
    } else if (arg.startsWith('--extensions=')) {
      const value = arg.substring('--extensions='.length);
      extensions.push(...value.split(',').map((e) => e.trim()));
    }
  }

  return extensions.length > 0 ? extensions : undefined;
}

export function loadExtensionSettings(): Partial<Settings> {
  const extensionsDir = path.join(homedir(), '.gemini', 'extensions');

  if (!fs.existsSync(extensionsDir)) {
    return {};
  }

  let extensionNames: string[];
  try {
    extensionNames = fs
      .readdirSync(extensionsDir)
      .filter((name) => {
        const extPath = path.join(extensionsDir, name);
        try {
          return fs.statSync(extPath).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    // Directory doesn't exist or can't be read
    return {};
  }

  const enabledExtensionOverrides = parseEnabledExtensionsFromArgv();

  const enablementManager = new ExtensionEnablementManager(
    enabledExtensionOverrides,
  );
  const currentPath = process.cwd();

  let mergedSettings: Partial<Settings> = {};
  const tracker: ConflictTracker = {
    conflicts: new Map(),
    ownership: new Map(),
  };

  for (const extensionName of extensionNames) {
    if (!enablementManager.isEnabled(extensionName, currentPath)) {
      continue;
    }

    const settingsPath = path.join(
      extensionsDir,
      extensionName,
      'extension-settings.json',
    );

    if (!fs.existsSync(settingsPath)) {
      continue;
    }

    try {
      const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
      const extensionSettings: ExtensionSettings = JSON.parse(settingsContent);

      const validator = new ExtensionSettingsValidator();
      const validationResult = validator.validate(extensionSettings);
      if (!validationResult.valid) {
        console.warn(
          `Extension "${extensionName}" has invalid settings (allowlist may have changed):`,
        );
        for (const error of validationResult.errors) {
          console.warn(`  - ${error}`);
        }
        continue;
      }

      const extensionPath = path.join(extensionsDir, extensionName);
      const resolvedSettings = resolveExtensionVariables(
        extensionSettings,
        extensionPath,
        currentPath,
      );

      mergedSettings = deepMergeWithArrayAppend(
        mergedSettings,
        resolvedSettings as Record<string, unknown>,
        '',
        tracker,
        extensionName,
      ) as Partial<Settings>;
    } catch (error) {
      console.warn(
        `Failed to load settings from extension "${extensionName}":`,
        error,
      );
    }
  }

  // Warn about scalar conflicts
  if (tracker.conflicts.size > 0) {
    console.warn('\nExtension settings conflicts detected:');
    for (const [settingPath, conflict] of tracker.conflicts.entries()) {
      const winner = conflict.extensions[conflict.extensions.length - 1];
      console.warn(
        `  Setting "${settingPath}" set by multiple extensions: ${conflict.extensions.join(', ')}`,
      );
      console.warn(`  Using value from "${winner}" (alphabetically last)`);
    }
    console.warn('');
  }

  return mergedSettings;
}

function getMergeStrategyForPath(path: string[]): MergeStrategy | undefined {
  let current: SettingDefinition | undefined = undefined;
  let currentSchema: SettingsSchema | undefined = getSettingsSchema();

  for (const key of path) {
    if (!currentSchema || !currentSchema[key]) {
      return undefined;
    }
    current = currentSchema[key];
    currentSchema = current.properties;
  }

  return current?.mergeStrategy;
}

export type { Settings, MemoryImportFormat };

export const USER_SETTINGS_PATH = Storage.getGlobalSettingsPath();
export const USER_SETTINGS_DIR = path.dirname(USER_SETTINGS_PATH);
export const DEFAULT_EXCLUDED_ENV_VARS = ['DEBUG', 'DEBUG_MODE'];

const MIGRATE_V2_OVERWRITE = true;

const MIGRATION_MAP: Record<string, string> = {
  accessibility: 'ui.accessibility',
  allowedTools: 'tools.allowed',
  allowMCPServers: 'mcp.allowed',
  autoAccept: 'tools.autoAccept',
  autoConfigureMaxOldSpaceSize: 'advanced.autoConfigureMemory',
  bugCommand: 'advanced.bugCommand',
  chatCompression: 'model.compressionThreshold',
  checkpointing: 'general.checkpointing',
  coreTools: 'tools.core',
  contextFileName: 'context.fileName',
  customThemes: 'ui.customThemes',
  customWittyPhrases: 'ui.customWittyPhrases',
  debugKeystrokeLogging: 'general.debugKeystrokeLogging',
  disableAutoUpdate: 'general.disableAutoUpdate',
  disableUpdateNag: 'general.disableUpdateNag',
  dnsResolutionOrder: 'advanced.dnsResolutionOrder',
  enableMessageBusIntegration: 'tools.enableMessageBusIntegration',
  enableHooks: 'tools.enableHooks',
  enablePromptCompletion: 'general.enablePromptCompletion',
  enforcedAuthType: 'security.auth.enforcedType',
  excludeTools: 'tools.exclude',
  excludeMCPServers: 'mcp.excluded',
  excludedProjectEnvVars: 'advanced.excludedEnvVars',
  extensionManagement: 'experimental.extensionManagement',
  extensions: 'extensions',
  fileFiltering: 'context.fileFiltering',
  folderTrustFeature: 'security.folderTrust.featureEnabled',
  folderTrust: 'security.folderTrust.enabled',
  hasSeenIdeIntegrationNudge: 'ide.hasSeenNudge',
  hideWindowTitle: 'ui.hideWindowTitle',
  showStatusInTitle: 'ui.showStatusInTitle',
  hideTips: 'ui.hideTips',
  hideBanner: 'ui.hideBanner',
  hideFooter: 'ui.hideFooter',
  hideCWD: 'ui.footer.hideCWD',
  hideSandboxStatus: 'ui.footer.hideSandboxStatus',
  hideModelInfo: 'ui.footer.hideModelInfo',
  hideContextSummary: 'ui.hideContextSummary',
  showMemoryUsage: 'ui.showMemoryUsage',
  showLineNumbers: 'ui.showLineNumbers',
  showCitations: 'ui.showCitations',
  ideMode: 'ide.enabled',
  includeDirectories: 'context.includeDirectories',
  loadMemoryFromIncludeDirectories: 'context.loadFromIncludeDirectories',
  maxSessionTurns: 'model.maxSessionTurns',
  mcpServers: 'mcpServers',
  mcpServerCommand: 'mcp.serverCommand',
  memoryImportFormat: 'context.importFormat',
  memoryDiscoveryMaxDirs: 'context.discoveryMaxDirs',
  model: 'model.name',
  preferredEditor: 'general.preferredEditor',
  retryFetchErrors: 'general.retryFetchErrors',
  sandbox: 'tools.sandbox',
  selectedAuthType: 'security.auth.selectedType',
  enableInteractiveShell: 'tools.shell.enableInteractiveShell',
  shellPager: 'tools.shell.pager',
  shellShowColor: 'tools.shell.showColor',
  skipNextSpeakerCheck: 'model.skipNextSpeakerCheck',
  summarizeToolOutput: 'model.summarizeToolOutput',
  telemetry: 'telemetry',
  theme: 'ui.theme',
  toolDiscoveryCommand: 'tools.discoveryCommand',
  toolCallCommand: 'tools.callCommand',
  usageStatisticsEnabled: 'privacy.usageStatisticsEnabled',
  useExternalAuth: 'security.auth.useExternal',
  useRipgrep: 'tools.useRipgrep',
  vimMode: 'general.vimMode',
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

export function needsMigration(settings: Record<string, unknown>): boolean {
  // A file needs migration if it contains any top-level key that is moved to a
  // nested location in V2.
  const hasV1Keys = Object.entries(MIGRATION_MAP).some(([v1Key, v2Path]) => {
    if (v1Key === v2Path || !(v1Key in settings)) {
      return false;
    }
    // If a key exists that is both a V1 key and a V2 container (like 'model'),
    // we need to check the type. If it's an object, it's a V2 container and not
    // a V1 key that needs migration.
    if (
      KNOWN_V2_CONTAINERS.has(v1Key) &&
      typeof settings[v1Key] === 'object' &&
      settings[v1Key] !== null
    ) {
      return false;
    }
    return true;
  });

  return hasV1Keys;
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
    const existingValue = v2Settings[remainingKey];
    const newValue = flatSettings[remainingKey];

    if (
      typeof existingValue === 'object' &&
      existingValue !== null &&
      !Array.isArray(existingValue) &&
      typeof newValue === 'object' &&
      newValue !== null &&
      !Array.isArray(newValue)
    ) {
      const pathAwareGetStrategy = (path: string[]) =>
        getMergeStrategyForPath([remainingKey, ...path]);
      v2Settings[remainingKey] = customDeepMerge(
        pathAwareGetStrategy,
        {},
        newValue as MergeableObject,
        existingValue as MergeableObject,
      );
    } else {
      v2Settings[remainingKey] = newValue;
    }
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
  extensions: Settings,
  workspace: Settings,
  isTrusted: boolean,
): Settings {
  const safeWorkspace = isTrusted ? workspace : ({} as Settings);

  // Settings are merged with the following precedence (last one wins for
  // single values):
  // 1. System Defaults
  // 2. User Settings
  // 3. Extension Settings
  // 4. Workspace Settings
  // 5. System Settings (as overrides)
  return customDeepMerge(
    getMergeStrategyForPath,
    {}, // Start with an empty object
    systemDefaults,
    user,
    extensions,
    safeWorkspace,
    system,
  ) as Settings;
}

export class LoadedSettings {
  constructor(
    system: SettingsFile,
    systemDefaults: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    isTrusted: boolean,
    migratedInMemoryScopes: Set<SettingScope>,
  ) {
    this.system = system;
    this.systemDefaults = systemDefaults;
    this.user = user;
    this.workspace = workspace;
    this.isTrusted = isTrusted;
    this.migratedInMemoryScopes = migratedInMemoryScopes;
    this._merged = this.computeMergedSettings();
  }

  readonly system: SettingsFile;
  readonly systemDefaults: SettingsFile;
  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly isTrusted: boolean;
  readonly migratedInMemoryScopes: Set<SettingScope>;

  private _merged: Settings;

  get merged(): Settings {
    return this._merged;
  }

  private computeMergedSettings(): Settings {
    return mergeSettings(
      this.system.settings,
      this.systemDefaults.settings,
      this.user.settings,
      loadExtensionSettings() as Settings,
      this.workspace.settings,
      this.isTrusted,
    );
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
  const migratedInMemoryScopes = new Set<SettingScope>();

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

  const loadAndMigrate = (
    filePath: string,
    scope: SettingScope,
  ): { settings: Settings; rawJson?: string } => {
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
          return { settings: {} };
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
                coreEvents.emitFeedback(
                  'error',
                  'Failed to migrate settings file.',
                  e,
                );
              }
            } else {
              migratedInMemoryScopes.add(scope);
            }
            settingsObject = migratedSettings;
          }
        }
        return { settings: settingsObject as Settings, rawJson: content };
      }
    } catch (error: unknown) {
      settingsErrors.push({
        message: getErrorMessage(error),
        path: filePath,
      });
    }
    return { settings: {} };
  };

  const systemResult = loadAndMigrate(systemSettingsPath, SettingScope.System);
  const systemDefaultsResult = loadAndMigrate(
    systemDefaultsPath,
    SettingScope.SystemDefaults,
  );
  const userResult = loadAndMigrate(USER_SETTINGS_PATH, SettingScope.User);

  let workspaceResult: { settings: Settings; rawJson?: string } = {
    settings: {} as Settings,
    rawJson: undefined,
  };
  if (realWorkspaceDir !== realHomeDir) {
    workspaceResult = loadAndMigrate(
      workspaceSettingsPath,
      SettingScope.Workspace,
    );
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
    loadExtensionSettings() as Settings,
    workspaceSettings,
    isTrusted,
  );

  // loadEnvironment depends on settings so we have to create a temp version of
  // the settings to avoid a cycle
  loadEnvironment(tempMergedSettings);

  // Create LoadedSettings first

  if (settingsErrors.length > 0) {
    const errorMessages = settingsErrors.map(
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
    migratedInMemoryScopes,
  );
}

export function migrateDeprecatedSettings(
  loadedSettings: LoadedSettings,
  extensionManager: ExtensionManager,
): void {
  const processScope = (scope: LoadableSettingScope) => {
    const settings = loadedSettings.forScope(scope).settings;
    if (settings.extensions?.disabled) {
      debugLogger.log(
        `Migrating deprecated extensions.disabled settings from ${scope} settings...`,
      );
      for (const extension of settings.extensions.disabled ?? []) {
        extensionManager.disableExtension(extension, scope);
      }

      const newExtensionsValue = { ...settings.extensions };
      newExtensionsValue.disabled = undefined;

      loadedSettings.setValue(scope, 'extensions', newExtensionsValue);
    }
  };

  processScope(SettingScope.User);
  processScope(SettingScope.Workspace);
}

export function saveSettings(settingsFile: SettingsFile): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(settingsFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let settingsToSave = settingsFile.originalSettings;
    if (!MIGRATE_V2_OVERWRITE) {
      settingsToSave = migrateSettingsToV1(
        settingsToSave as Record<string, unknown>,
      ) as Settings;
    }

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
