/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type AdminControlsSettings } from '@google/gemini-cli-core';
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
export declare function getMergeStrategyForPath(
  path: string[],
): MergeStrategy | undefined;
export declare const USER_SETTINGS_PATH: string;
export declare const USER_SETTINGS_DIR: string;
export declare const DEFAULT_EXCLUDED_ENV_VARS: string[];
/**
 * Sanitizes an environment variable value to prevent shell injection.
 * Restricts values to a safe character set: alphanumeric, -, _, ., /
 */
export declare function sanitizeEnvVar(value: string): string;
export declare function getSystemSettingsPath(): string;
export declare function getSystemDefaultsPath(): string;
export type { DnsResolutionOrder } from './settingsSchema.js';
export declare enum SettingScope {
  User = 'User',
  Workspace = 'Workspace',
  System = 'System',
  SystemDefaults = 'SystemDefaults',
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
 * A type guard function that checks if `scope` is a loadable settings scope,
 * and allows promotion to the `LoadableSettingsScope` type based on the result.
 */
export declare function isLoadableSettingScope(
  scope: SettingScope,
): scope is LoadableSettingScope;
export interface CheckpointingSettings {
  enabled?: boolean;
}
export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}
export type LoadingPhrasesMode = 'tips' | 'witty' | 'all' | 'off';
export interface AccessibilitySettings {
  /** @deprecated Use ui.loadingPhrases instead. */
  enableLoadingPhrases?: boolean;
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
  /** INTERNAL: Whether the user has acknowledged the session retention warning */
  warningAcknowledged?: boolean;
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
  readOnly?: boolean;
}
export declare function getDefaultsFromSchema(
  schema?: SettingsSchema,
): Settings;
export declare function mergeSettings(
  system: Settings,
  systemDefaults: Settings,
  user: Settings,
  workspace: Settings,
  isTrusted: boolean,
): MergedSettings;
/**
 * Creates a fully populated MergedSettings object for testing purposes.
 * It merges the provided overrides with the default settings from the schema.
 *
 * @param overrides Partial settings to override the defaults.
 * @returns A complete MergedSettings object.
 */
export declare function createTestMergedSettings(
  overrides?: Partial<Settings>,
): MergedSettings;
/**
 * An immutable snapshot of settings state.
 * Used with useSyncExternalStore for reactive updates.
 */
export interface LoadedSettingsSnapshot {
  system: SettingsFile;
  systemDefaults: SettingsFile;
  user: SettingsFile;
  workspace: SettingsFile;
  isTrusted: boolean;
  errors: SettingsError[];
  merged: MergedSettings;
}
export declare class LoadedSettings {
  constructor(
    system: SettingsFile,
    systemDefaults: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    isTrusted: boolean,
    errors?: SettingsError[],
  );
  readonly system: SettingsFile;
  readonly systemDefaults: SettingsFile;
  readonly user: SettingsFile;
  workspace: SettingsFile;
  isTrusted: boolean;
  readonly errors: SettingsError[];
  private _workspaceFile;
  private _merged;
  private _snapshot;
  private _remoteAdminSettings;
  get merged(): MergedSettings;
  setTrusted(isTrusted: boolean): void;
  private createEmptyWorkspace;
  private computeMergedSettings;
  private computeSnapshot;
  subscribe(listener: () => void): () => void;
  getSnapshot(): LoadedSettingsSnapshot;
  forScope(scope: LoadableSettingScope): SettingsFile;
  private isPersistable;
  setValue(scope: LoadableSettingScope, key: string, value: unknown): void;
  setRemoteAdminSettings(remoteSettings: AdminControlsSettings): void;
}
export declare function setUpCloudShellEnvironment(
  envFilePath: string | null,
  isTrusted: boolean,
  isSandboxed: boolean,
): void;
export declare function loadEnvironment(
  settings: Settings,
  workspaceDir: string,
  isWorkspaceTrustedFn?: typeof isWorkspaceTrusted,
): void;
/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 */
export declare function loadSettings(workspaceDir?: string): LoadedSettings;
/**
 * Migrates deprecated settings to their new counterparts.
 *
 * TODO: After a couple of weeks (around early Feb 2026), we should start removing
 * the deprecated settings from the settings files by default.
 *
 * @returns true if any changes were made and need to be saved.
 */
export declare function migrateDeprecatedSettings(
  loadedSettings: LoadedSettings,
  removeDeprecated?: boolean,
): boolean;
export declare function saveSettings(settingsFile: SettingsFile): void;
export declare function saveModelChange(
  loadedSettings: LoadedSettings,
  model: string,
): void;
