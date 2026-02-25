/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useMemo, useSyncExternalStore } from 'react';
import type {
  LoadableSettingScope,
  LoadedSettings,
  LoadedSettingsSnapshot,
  SettingsFile,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';

export const SettingsContext = React.createContext<LoadedSettings | undefined>(
  undefined,
);

export const useSettings = (): LoadedSettings => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export interface SettingsState extends LoadedSettingsSnapshot {
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

// Components that call this hook will re render when a settings change event is emitted
export const useSettingsStore = (): SettingsStoreValue => {
  const store = useContext(SettingsContext);
  if (store === undefined) {
    throw new Error('useSettingsStore must be used within a SettingsProvider');
  }

  // React passes a listener fn into the subscribe function
  // When the listener runs, it re renders the component if the snapshot changed
  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
  );

  const settings: SettingsState = useMemo(
    () => ({
      ...snapshot,
      forScope: (scope: LoadableSettingScope) => {
        switch (scope) {
          case SettingScope.User:
            return snapshot.user;
          case SettingScope.Workspace:
            return snapshot.workspace;
          case SettingScope.System:
            return snapshot.system;
          case SettingScope.SystemDefaults:
            return snapshot.systemDefaults;
          default:
            throw new Error(`Invalid scope: ${scope}`);
        }
      },
    }),
    [snapshot],
  );

  return useMemo(
    () => ({
      settings,
      setSetting: (scope: LoadableSettingScope, key: string, value: unknown) =>
        store.setValue(scope, key, value),
    }),
    [settings, store],
  );
};
