/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  LoadedSettings,
  createTestMergedSettings,
  type SettingsError,
} from '../config/settings.js';

export interface MockSettingsFile {
  settings: any;
  originalSettings: any;
  path: string;
}

interface CreateMockSettingsOptions {
  system?: MockSettingsFile;
  systemDefaults?: MockSettingsFile;
  user?: MockSettingsFile;
  workspace?: MockSettingsFile;
  isTrusted?: boolean;
  errors?: SettingsError[];
  merged?: any;
  [key: string]: any;
}

/**
 * Creates a mock LoadedSettings object for testing.
 *
 * @param overrides - Partial settings or LoadedSettings properties to override.
 *                   If 'merged' is provided, it overrides the computed merged settings.
 *                   Any functions in overrides are assigned directly to the LoadedSettings instance.
 */
export const createMockSettings = (
  overrides: CreateMockSettingsOptions = {},
): LoadedSettings => {
  const {
    system,
    systemDefaults,
    user,
    workspace,
    isTrusted,
    errors,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    merged: mergedOverride,
    ...settingsOverrides
  } = overrides;

  const loaded = new LoadedSettings(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    (system as any) || { path: '', settings: {}, originalSettings: {} },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    (systemDefaults as any) || { path: '', settings: {}, originalSettings: {} },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    (user as any) || {
      path: '',
      settings: settingsOverrides,
      originalSettings: settingsOverrides,
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    (workspace as any) || { path: '', settings: {}, originalSettings: {} },
    isTrusted ?? true,
    errors || [],
  );

  if (mergedOverride) {
    // @ts-expect-error - overriding private field for testing
    loaded._merged = createTestMergedSettings(mergedOverride);
  }

  // Assign any function overrides (e.g., vi.fn() for methods)
  for (const key in overrides) {
    if (typeof overrides[key] === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment
      (loaded as any)[key] = overrides[key];
    }
  }

  return loaded;
};
