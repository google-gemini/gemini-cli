/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import type { Settings, SettingsSchema } from '@google/gemini-cli';

interface SettingsContextType {
  settings: {
    merged: Partial<Settings>;
    user: Partial<Settings>;
    workspace: Partial<Settings>;
    system: Partial<Settings>;
  } | null;
  schema: SettingsSchema | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] =
    useState<SettingsContextType['settings']>(null);
  const [schema, setSchema] = useState<SettingsSchema | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSettings = async () => {
    setLoading(true);
    try {
      const [fetchedSettings, fetchedSchema] = await Promise.all([
        window.electron.settings.get(),
        window.electron.settings.getSchema(),
      ]);
      setSettings(fetchedSettings);
      setSchema(fetchedSchema);
    } catch (error) {
      console.error('Failed to load settings or schema:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  return (
    <SettingsContext.Provider
      value={{ settings, schema, loading, refreshSettings }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
