/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Settings } from '../config/settings.js';
import type {
  SettingDefinition,
  SettingsSchema,
  SettingsType,
  SettingsValue,
} from '../config/settingsSchema.js';
import { getSettingsSchema } from '../config/settingsSchema.js';
import type { Config } from '@google/gemini-cli-core';
import { ExperimentFlags } from '@google/gemini-cli-core';

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

export function getSettingDefinition(
  key: string,
): (SettingDefinition & { key: string }) | undefined {
  return getFlattenedSchema()[key];
}

export function requiresRestart(key: string): boolean {
  return getFlattenedSchema()[key]?.requiresRestart ?? false;
}

export function getDefaultValue(key: string): SettingsValue {
  return getFlattenedSchema()[key]?.default;
}

/**
 * Get the effective default value for a setting, checking experiment values when available.
 * For settings like compressionThreshold, this will return the experiment value if set,
 * otherwise falls back to the schema default.
 */
export function getEffectiveDefaultValue(
  key: string,
  config?: Config,
): SettingsValue {
  if (key === 'model.compressionThreshold' && config) {
    const experiments = config.getExperiments();
    const experimentValue =
      experiments?.flags[ExperimentFlags.CONTEXT_COMPRESSION_THRESHOLD]
        ?.floatValue;
    if (experimentValue !== undefined && experimentValue !== 0) {
      return experimentValue;
    }
  }

  return getDefaultValue(key);
}

export function getRestartRequiredSettings(): string[] {
  return Object.values(getFlattenedSchema())
    .filter((definition) => definition.requiresRestart)
    .map((definition) => definition.key);
}

/**
 * Get restart-required setting keys that are also visible in the dialog.
 * Non-dialog restart keys (e.g. parent container objects like mcpServers, tools)
 * are excluded because users cannot change them through the dialog.
 */
export function getDialogRestartRequiredSettings(): string[] {
  return Object.values(getFlattenedSchema())
    .filter(
      (definition) =>
        definition.requiresRestart && definition.showInDialog !== false,
    )
    .map((definition) => definition.key);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSettingsValue(value: unknown): value is SettingsValue {
  if (value === undefined) return true;
  if (value === null) return false;
  const type = typeof value;
  return (
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'object'
  );
}

/**
 * Gets a value from a nested object using a key path array iteratively.
 */
export function getNestedValue(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Get the effective value for a setting falling back to the default value
 */
export function getEffectiveValue(
  key: string,
  settings: Settings,
): SettingsValue {
  const definition = getSettingDefinition(key);
  if (!definition) {
    return undefined;
  }

  const path = key.split('.');

  // Check the current scope's settings first
  const value = getNestedValue(settings, path);
  if (value !== undefined && isSettingsValue(value)) {
    return value;
  }

  // Return default value if no value is set anywhere
  return definition.default;
}

export function getAllSettingKeys(): string[] {
  return Object.keys(getFlattenedSchema());
}

export function getSettingsByType(
  type: SettingsType,
): Array<SettingDefinition & { key: string }> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) => definition.type === type,
  );
}

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

export function getSettingCategory(key: string): string | undefined {
  return getFlattenedSchema()[key]?.category;
}

export function shouldShowInDialog(key: string): boolean {
  return getFlattenedSchema()[key]?.showInDialog ?? true; // Default to true for backward compatibility
}

export function getDialogSettingKeys(): string[] {
  return Object.values(getFlattenedSchema())
    .filter((definition) => definition.showInDialog !== false)
    .map((definition) => definition.key);
}

/**
 * Get all settings that should be shown in the dialog, grouped by category like "Advanced", "General", etc.
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

export function getDialogSettingsByType(
  type: SettingsType,
): Array<SettingDefinition & { key: string }> {
  return Object.values(getFlattenedSchema()).filter(
    (definition) =>
      definition.type === type && definition.showInDialog !== false,
  );
}

export function isInScope(key: string, scopeSettings: Settings): boolean {
  const path = key.split('.');
  const value = getNestedValue(scopeSettings, path);
  return value !== undefined;
}

/**
 * Appends a star (*) to settings that exist in the scope
 */
export function getDisplayValue(
  key: string,
  scopeSettings: Settings,
  _mergedSettings: Settings,
): string {
  const definition = getSettingDefinition(key);
  const existsInScope = isInScope(key, scopeSettings);

  let value: SettingsValue;
  if (existsInScope) {
    value = getEffectiveValue(key, scopeSettings);
  } else {
    value = getDefaultValue(key);
  }

  let valueString = String(value);

  if (definition?.type === 'enum' && definition.options) {
    const option = definition.options?.find((option) => option.value === value);
    valueString = option?.label ?? `${value}`;
  }

  if (existsInScope) {
    return `${valueString}*`;
  }

  return valueString;
}

/**Utilities for parsing Settings that can be inline edited by the user typing out values */
function tryParseJsonStringArray(input: string): string[] | null {
  try {
    const parsed = JSON.parse(input);
    if (
      Array.isArray(parsed) &&
      parsed.every((item): item is string => typeof item === 'string')
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function tryParseJsonObject(input: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(input);
    if (isRecord(parsed) && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseStringArrayValue(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed === '') return [];

  return (
    tryParseJsonStringArray(trimmed) ??
    input
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  );
}

function parseObjectValue(input: string): Record<string, unknown> | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }

  return tryParseJsonObject(trimmed);
}

export function parseEditedValue(
  type: SettingsType,
  newValue: string,
): SettingsValue | null {
  if (type === 'number') {
    if (newValue.trim() === '') {
      return null;
    }

    const numParsed = Number(newValue.trim());
    if (Number.isNaN(numParsed)) {
      return null;
    }

    return numParsed;
  }

  if (type === 'array') {
    return parseStringArrayValue(newValue);
  }

  if (type === 'object') {
    return parseObjectValue(newValue);
  }

  return newValue;
}

export function getEditValue(
  type: SettingsType,
  rawValue: SettingsValue,
): string | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (type === 'array' && Array.isArray(rawValue)) {
    return rawValue.join(', ');
  }

  if (type === 'object' && rawValue !== null && typeof rawValue === 'object') {
    return JSON.stringify(rawValue);
  }

  return undefined;
}

export const TEST_ONLY = { clearFlattenedSchema };
