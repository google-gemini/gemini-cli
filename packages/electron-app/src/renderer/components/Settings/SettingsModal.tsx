/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './SettingsModal.css';
import type {
  Settings,
  ThemeDisplay,
  SettingsSchema,
  SettingDefinition,
} from '@google/gemini-cli';
import { McpServerManager } from './McpServer/McpServerManager';
import { LanguageMappingsManager } from './LanguageMappings/LanguageMappingsManager';
import { useSettings } from '../../contexts/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper to get nested properties safely
const get = (
  obj: Record<string, unknown>,
  path: string,
  defaultValue: unknown,
) => {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return defaultValue;
    }
    if (result === undefined || result === null || typeof result !== 'object') {
      return defaultValue;
    }
    result = (result as Record<string, unknown>)[key] as Record<
      string,
      unknown
    >;
  }
  return result === undefined ? defaultValue : result;
};

// Helper to set nested properties safely
const set = (obj: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return;
    }
    current[key] = current[key] || {};
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1];
  if (
    lastKey === '__proto__' ||
    lastKey === 'constructor' ||
    lastKey === 'prototype'
  ) {
    return;
  }
  current[lastKey] = value;
};

interface FlattenedSetting extends SettingDefinition {
  key: string;
}

function flattenSchema(
  schema: SettingsSchema,
  parentPath = '',
): FlattenedSetting[] {
  let result: FlattenedSetting[] = [];
  for (const key in schema) {
    const setting = schema[key];
    const path = parentPath ? `${parentPath}.${key}` : key;

    if (setting.showInDialog) {
      result.push({
        ...setting,
        key: path,
      });
    }

    if (setting.properties) {
      result = result.concat(flattenSchema(setting.properties, path));
    }
  }
  return result;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    settings: fullSettings,
    schema,
    refreshSettings,
    loading,
  } = useSettings();
  const [settings, setSettings] = useState<Partial<Settings>>(
    fullSettings?.merged || {},
  );
  const [availableThemes, setAvailableThemes] = useState<ThemeDisplay[]>([]);
  const [scope, setScope] = useState('User');
  const [activeCategory, setActiveCategory] = useState('General');
  const [envInput, setEnvInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const envDirty = useRef(false);
  const pendingChanges = useRef<Record<string, Record<string, unknown>>>({});
  const overrides = useRef<Map<string, unknown>>(new Map());

  const flattenedSettings = useMemo(
    () => (schema ? flattenSchema(schema) : []),
    [schema],
  );

  const categories = useMemo(() => {
    const cats = new Set(flattenedSettings.map((s) => s.category));
    cats.add('MCP Servers');
    cats.add('General');
    cats.add('UI');
    const sortedCats = Array.from(cats).sort((a, b) => {
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b);
    });
    return sortedCats;
  }, [flattenedSettings]);

  const prevIsOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      window.electron?.themes
        ?.get()
        .then(setAvailableThemes)
        .catch((err: Error) => console.error('Failed to get themes', err));

      refreshSettings();
      pendingChanges.current = {};
      overrides.current.clear();
      envDirty.current = false;
    }
    prevIsOpen.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (fullSettings?.merged) {
      const next = JSON.parse(JSON.stringify(fullSettings.merged)) as Record<
        string,
        unknown
      >;
      overrides.current.forEach((value, key) => {
        set(next, key, value);
      });
      setSettings(next);

      if (!envDirty.current) {
        setEnvInput(
          ((fullSettings.merged as Record<string, unknown>).env as string) ||
            '',
        );
      }
    }
  }, [fullSettings]);

  const handleChange = useCallback(
    (
      field: string,
      value: string | boolean | number | Record<string, unknown>,
    ) => {
      setSettings((prev) => {
        const newSettings = JSON.parse(JSON.stringify(prev)) as Record<
          string,
          unknown
        >;
        set(newSettings, field, value);
        return newSettings;
      });

      overrides.current.set(field, value);

      if (!pendingChanges.current[scope]) {
        pendingChanges.current[scope] = {};
      }
      set(pendingChanges.current[scope], field, value);
    },
    [scope],
  );

  const handleClose = async () => {
    setIsSaving(true);

    if (envDirty.current) {
      if (!pendingChanges.current[scope]) {
        pendingChanges.current[scope] = {};
      }
      pendingChanges.current[scope].env = envInput;
    }

    try {
      const promises = Object.entries(pendingChanges.current).map(
        ([s, changes]) => window.electron.settings.set({ changes, scope: s }),
      );
      await Promise.all(promises);
      await window.electron.settings.restartTerminal();
      await refreshSettings();
    } catch (error) {
      console.error('Failed to save settings or restart terminal:', error);
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  const renderSetting = (config: FlattenedSetting) => {
    const value = get(settings as Record<string, unknown>, config.key, '');
    switch (config.type) {
      case 'boolean':
        return (
          <input
            type="checkbox"
            id={config.key}
            checked={!!value}
            onChange={(e) => handleChange(config.key, e.target.checked)}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            id={config.key}
            value={value as number}
            onChange={(e) =>
              handleChange(config.key, parseInt(e.target.value, 10))
            }
          />
        );
      case 'string':
        return (
          <input
            type="text"
            id={config.key}
            value={value as string}
            onChange={(e) => handleChange(config.key, e.target.value)}
          />
        );
      case 'enum':
        return (
          <select
            id={config.key}
            value={value as string}
            onChange={(e) => handleChange(config.key, e.target.value)}
          >
            {config.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  if (loading && !fullSettings) {
    return (
      <div
        className="settings-container"
        style={{ justifyContent: 'center', alignItems: 'center' }}
      >
        <h2>Loading settings...</h2>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-sidebar">
        <h2>Settings</h2>
        <div className="scope-selector">
          <label htmlFor="scope">Scope</label>
          <select
            id="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="User">User</option>
            <option value="Workspace">Workspace</option>
            <option value="System">System</option>
          </select>
        </div>
        <ul>
          {categories.map((category) => (
            <li
              key={category}
              className={activeCategory === category ? 'active' : ''}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </li>
          ))}
        </ul>
        <button
          className="close-button"
          onClick={handleClose}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Close'}
        </button>
      </div>
      <div className="settings-content">
        <h3>{activeCategory}</h3>
        {activeCategory === 'UI' && (
          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="ui.theme">Theme</label>
              <p>The color theme for the application.</p>
            </div>
            <div className="setting-control">
              <select
                id="ui.theme"
                value={
                  get(
                    settings as Record<string, unknown>,
                    'ui.theme',
                    '',
                  ) as string
                }
                onChange={(e) => handleChange('ui.theme', e.target.value)}
              >
                <option value="">Default</option>
                {availableThemes.map((theme) => (
                  <option key={theme.name} value={theme.name}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {flattenedSettings
          .filter((s) => s.category === activeCategory)
          .map((config) => (
            <div className="setting-item" key={config.key}>
              <div className="setting-info">
                <label htmlFor={config.key}>{config.label}</label>
                <p>{config.description}</p>
              </div>
              <div className="setting-control">{renderSetting(config)}</div>
            </div>
          ))}
        {activeCategory === 'General' && (
          <>
            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="env">Environment Variables</label>
                <p>
                  Set environment variables for the terminal session (e.g.
                  API_KEY=value). Separate entries with newlines or spaces.
                </p>
              </div>
              <div className="setting-control">
                <textarea
                  id="env"
                  value={envInput}
                  onChange={(e) => {
                    setEnvInput(e.target.value);
                    envDirty.current = true;
                  }}
                  placeholder="KEY=VALUE ANOTHER_KEY=VALUE"
                />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <label>Language Mappings</label>
                <p>
                  Map file extensions to language names for syntax highlighting.
                </p>
              </div>
              <div className="setting-control">
                <LanguageMappingsManager />
              </div>
            </div>
          </>
        )}
        {activeCategory === 'MCP Servers' && (
          <McpServerManager
            mcpServers={settings.mcpServers || {}}
            onChange={(newMcpServers) =>
              handleChange('mcpServers', newMcpServers)
            }
          />
        )}
      </div>
    </div>
  );
}
