/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useMemo, useSyncExternalStore } from 'react';
import { CoreEvent, coreEvents } from '@google/gemini-cli-core';
import type {
  LoadableSettingScope,
  LoadedSettings,
  Settings,
  SettingsFile,
} from '../../config/settings.js';

export const SettingsContext = React.createContext<LoadedSettings | undefined>(
  undefined,
);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export interface SettingsState {
  merged: Settings;
  user: SettingsFile;
  workspace: SettingsFile;
  system: SettingsFile;
  systemDefaults: SettingsFile;
  forScope: (scope: LoadableSettingScope) => SettingsFile;
}

export interface SettingsStoreValue {
  settings: SettingsState;
  setSetting: (
    scope: LoadableSettingScope,
    key: string,
    value: unknown,
  ) => void;
}

export const useSettingsStore = (): SettingsStoreValue => {
  const loadedSettings = useSettings();

  const snapshot = useSyncExternalStore(
    (callback) => {
      // The store subscription simply listens for the global SettingsChanged event
      const handler = () => callback();
      coreEvents.on(CoreEvent.SettingsChanged, handler);
      return () => coreEvents.off(CoreEvent.SettingsChanged, handler);
    },
    () => loadedSettings.merged,
  );

  const settings: SettingsState = useMemo(
    () => ({
      merged: snapshot,
      // We expose the raw files from the loadedSettings instance.
      // Note: These object references are stable in LoadedSettings,
      // but their internal 'settings' property is mutated by setValue.
      // Re-creating this wrapper object when 'snapshot' (merged) changes
      // ensures downstream consumers receive a new object reference.
      user: loadedSettings.user,
      workspace: loadedSettings.workspace,
      system: loadedSettings.system,
      systemDefaults: loadedSettings.systemDefaults,
      forScope: (scope: LoadableSettingScope) => loadedSettings.forScope(scope),
    }),
    [snapshot, loadedSettings],
  );

  return useMemo(
    () => ({
      settings,
      setSetting: (scope: LoadableSettingScope, key: string, value: unknown) =>
        loadedSettings.setValue(scope, key, value),
    }),
    [settings, loadedSettings],
  );
};
