/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Settings,
  SettingScope,
  LoadedSettings,
} from '../config/settings.js';
import type {
  SettingDefinition,
  SettingsSchema,
  SettingsType,
  SettingsValue,
} from '../config/settingsSchema.js';
import { getSettingsSchema } from '../config/settingsSchema.js';

// The schema is now nested, but many parts of the UI and logic work better
// with a flattened structure and dot-notation keys. This section flattens the
// schema into a map for easier lookups.

type FlattenedSchema = Record<string, SettingDefinition & { key: string }>;

function flattenSchema(schema: SettingsSchema, prefix = ''): FlattenedSchema {
  let result: FlattenedSchema = {};
  for (const key in schema) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const definition = schema[key];
    result[newKey] = { ...definition, key: newKey };
    if (definition.properties) {
      result = { ...result, ...flattenSchema(definition.properties, newKey) };
    }
  }
  return result;
}

let _FLATTENED_SCHEMA: FlattenedSchema | undefined;

/** Returns a flattened schema, the first call is memoized for future requests. */
export function getFlattenedSchema() {
  return (
    _FLATTENED_SCHEMA ??
    (_FLATTENED_SCHEMA = flattenSchema(getSettingsSchema()))
  );
}

function clearFlattenedSchema() {
  _FLATTENED_SCHEMA = undefined;
}

/**
 * Get all settings grouped by category
 */
export function getSettingsByCategory(): Record<
  string,
  Array<SettingDefinition & { key: string }>
> {
  const categories: Record<
    string,
    Array<SettingDefinition & { key: string }>
  > = {};

  Object.values(getFlattenedSchema()).forEach((definition) => {
    const category = definition.category;
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(definition);
  });

  return categories;
}

/**
 * Get a setting definition by key
 */
export function getSettingDefinition(
  key: string,
): (SettingDefinition & { key: string }) | undefined {
  return getFlattenedSchema()[key];
}

/**
 * Check if a setting requires restart
 */
export function requiresRestart(key: string): boolean {
  return getFlattenedSchema()[key]?.requiresRestart ?? false;
}

/**
 * Get the default value for a setting
 */
export function getDefaultValue(key: string): SettingsValue {
  return getFlattenedSchema()[key]?.default;
}

/**
 * Get all setting keys that require restart
 */
export function getRestartRequiredSettings(): string[] {
  return Object.values(getFlattenedSchema())
    .filter((definition) => definition.requiresRestart)
    .map((definition) => definition.key);
}

/**
 * Recursively gets a value from a nested object using a key path array.
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string[],
): unknown {
  const [first, ...rest] = path;
  if (!first || !(first in obj)) {
    return undefined;
  }
  const value = obj[first];
  if (rest.length === 0) {
    return value;
  }
  if (value && typeof value === 'object' && value !== null) {
    return getNestedValue(value as Record<string, unknown>, rest);
  }
  return undefined;
}

/**
 * Get the effective value for a setting, considering inheritance from higher scopes
 * Always returns a value (never undefined) - falls back to default if not set anywhere
 */
export function getEffectiveValue(
  key: string,
  settings: Settings,
  mergedSettings: Settings,
): SettingsValue {
  const definition = getSettingDefinition(key);
  if (!definition) {
    return undefined;
  }

  const path = key.split('.');

  // Check the current scope's settings first
  let value = getNestedValue(settings as Record<string, unknown>, path);
  if (value !== undefined) {
    return value as SettingsValue;
  }

  // Check the merged settings for an inherited value
  value = getNestedValue(mergedSettings as Record<string, unknown>, path);
  if (value !== undefined) {
    return value as SettingsValue;
  }

  // Return default value if no value is set anywhere
  return definition.default;
}

/**
 * Get all setting keys from the schema
 */
export function getAllSettingKeys(): string[] {
  return Object.keys(getFlattenedSchema());
}

/**
 * Get settings by type
 */
export function getSettingsByType(
  type: SettingsType,
): Array<SettingDefinition & { key: string }> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) => definition.type === type,
  );
}

/**
 * Get settings that require restart
 */
export function getSettingsRequiringRestart(): Array<
  SettingDefinition & {
    key: string;
  }
> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) => definition.requiresRestart,
  );
}

/**
 * Validate if a setting key exists in the schema
 */
export function isValidSettingKey(key: string): boolean {
  return key in getFlattenedSchema();
}

/**
 * Get the category for a setting
 */
export function getSettingCategory(key: string): string | undefined {
  return getFlattenedSchema()[key]?.category;
}

/**
 * Check if a setting should be shown in the settings dialog
 */
export function shouldShowInDialog(key: string): boolean {
  return getFlattenedSchema()[key]?.showInDialog ?? true; // Default to true for backward compatibility
}

/**
 * Get all settings that should be shown in the dialog, grouped by category
 */
export function getDialogSettingsByCategory(): Record<
  string,
  Array<SettingDefinition & { key: string }>
> {
  const categories: Record<
    string,
    Array<SettingDefinition & { key: string }>
  > = {};

  Object.values(getFlattenedSchema())
    .filter((definition) => definition.showInDialog !== false)
    .forEach((definition) => {
      const category = definition.category;
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(definition);
    });

  return categories;
}

/**
 * Get settings by type that should be shown in the dialog
 */
export function getDialogSettingsByType(
  type: SettingsType,
): Array<SettingDefinition & { key: string }> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) =>
      definition.type === type && definition.showInDialog !== false,
  );
}

/**
 * Get all setting keys that should be shown in the dialog
 */
export function getDialogSettingKeys(): string[] {
  return Object.values(getFlattenedSchema())
    .filter((definition) => definition.showInDialog !== false)
    .map((definition) => definition.key);
}

// ============================================================================
// BUSINESS LOGIC UTILITIES (Higher-level utilities for setting operations)
// ============================================================================

/**
 * Get the current value for a setting in a specific scope
 * Always returns a value (never undefined) - falls back to default if not set anywhere
 */
export function getSettingValue(
  key: string,
  settings: Settings,
  mergedSettings: Settings,
): boolean {
  const definition = getSettingDefinition(key);
  if (!definition) {
    return false; // Default fallback for invalid settings
  }

  const value = getEffectiveValue(key, settings, mergedSettings);
  // Ensure we return a boolean value, converting from the more general type
  if (typeof value === 'boolean') {
    return value;
  }
  // Fall back to default value, ensuring it's a boolean
  const defaultValue = definition.default;
  if (typeof defaultValue === 'boolean') {
    return defaultValue;
  }
  return false; // Final fallback
}

/**
 * Check if a setting value is modified from its default
 */
export function isSettingModified(key: string, value: boolean): boolean {
  const defaultValue = getDefaultValue(key);
  // Handle type comparison properly
  if (typeof defaultValue === 'boolean') {
    return value !== defaultValue;
  }
  // If default is not a boolean, consider it modified if value is true
  return value === true;
}

/**
 * Check if a setting exists in the original settings file for a scope
 */
export function settingExistsInScope(
  key: string,
  scopeSettings: Settings,
): boolean {
  const path = key.split('.');
  const value = getNestedValue(scopeSettings as Record<string, unknown>, path);
  return value !== undefined;
}

/**
 * Recursively sets a value in a nested object using a key path array.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const [first, ...rest] = path;
  if (!first) {
    return obj;
  }

  if (rest.length === 0) {
    obj[first] = value;
    return obj;
  }

  if (!obj[first] || typeof obj[first] !== 'object') {
    obj[first] = {};
  }

  setNestedValue(obj[first] as Record<string, unknown>, rest, value);
  return obj;
}

/**
 * Set a setting value in the pending settings
 */
export function setPendingSettingValue(
  key: string,
  value: boolean,
  pendingSettings: Settings,
): Settings {
  const path = key.split('.');
  const newSettings = JSON.parse(JSON.stringify(pendingSettings));
  setNestedValue(newSettings, path, value);
  return newSettings;
}

/**
 * Generic setter: Set a setting value (boolean, number, string, etc.) in the pending settings
 */
export function setPendingSettingValueAny(
  key: string,
  value: SettingsValue,
  pendingSettings: Settings,
): Settings {
  const path = key.split('.');
  const newSettings = structuredClone(pendingSettings);
  setNestedValue(newSettings, path, value);
  return newSettings;
}

/**
 * Check if any modified settings require a restart
 */
export function hasRestartRequiredSettings(
  modifiedSettings: Set<string>,
): boolean {
  return Array.from(modifiedSettings).some((key) => requiresRestart(key));
}

/**
 * Get the restart required settings from a set of modified settings
 */
export function getRestartRequiredFromModified(
  modifiedSettings: Set<string>,
): string[] {
  return Array.from(modifiedSettings).filter((key) => requiresRestart(key));
}

/**
 * Save modified settings to the appropriate scope
 */
export function saveModifiedSettings(
  modifiedSettings: Set<string>,
  pendingSettings: Settings,
  loadedSettings: LoadedSettings,
  scope: SettingScope,
): void {
  modifiedSettings.forEach((settingKey) => {
    const path = settingKey.split('.');
    const value = getNestedValue(
      pendingSettings as Record<string, unknown>,
      path,
    );

    if (value === undefined) {
      return;
    }

    const existsInOriginalFile = settingExistsInScope(
      settingKey,
      loadedSettings.forScope(scope).settings,
    );

    const isDefaultValue = value === getDefaultValue(settingKey);

    if (existsInOriginalFile || !isDefaultValue) {
      loadedSettings.setValue(scope, settingKey, value);
    }
  });
}

/**
 * Get the display value for a setting, showing current scope value with default change indicator
 */
export function getDisplayValue(
  key: string,
  settings: Settings,
  _mergedSettings: Settings,
  modifiedSettings: Set<string>,
  pendingSettings?: Settings,
): string {
  // Prioritize pending changes if user has modified this setting
  const definition = getSettingDefinition(key);

  let value: SettingsValue;
  if (pendingSettings && settingExistsInScope(key, pendingSettings)) {
    // Show the value from the pending (unsaved) edits when it exists
    value = getEffectiveValue(key, pendingSettings, {});
  } else if (settingExistsInScope(key, settings)) {
    // Show the value defined at the current scope if present
    value = getEffectiveValue(key, settings, {});
  } else {
    // Fall back to the schema default when the key is unset in this scope
    value = getDefaultValue(key);
  }

  let valueString = String(value);

  if (definition?.type === 'enum' && definition.options) {
    const option = definition.options?.find((option) => option.value === value);
    valueString = option?.label ?? `${value}`;
  }

  // Check if value is different from default OR if it's in modified settings OR if there are pending changes
  const defaultValue = getDefaultValue(key);
  const isChangedFromDefault = value !== defaultValue;
  const isInModifiedSettings = modifiedSettings.has(key);

  // Mark as modified if setting exists in current scope OR is in modified settings
  if (settingExistsInScope(key, settings) || isInModifiedSettings) {
    return `${valueString}*`; // * indicates setting is set in current scope
  }
  if (isChangedFromDefault || isInModifiedSettings) {
    return `${valueString}*`; // * indicates changed from default value
  }

  return valueString;
}

/**
 * Check if a setting doesn't exist in current scope (should be greyed out)
 */
export function isDefaultValue(key: string, settings: Settings): boolean {
  return !settingExistsInScope(key, settings);
}

/**
 * Check if a setting value is inherited (not set at current scope)
 */
export function isValueInherited(
  key: string,
  settings: Settings,
  _mergedSettings: Settings,
): boolean {
  return !settingExistsInScope(key, settings);
}

/**
 * Get the effective value for display, considering inheritance
 * Always returns a boolean value (never undefined)
 */
export function getEffectiveDisplayValue(
  key: string,
  settings: Settings,
  mergedSettings: Settings,
): boolean {
  return getSettingValue(key, settings, mergedSettings);
}

export const TEST_ONLY = { clearFlattenedSchema };
