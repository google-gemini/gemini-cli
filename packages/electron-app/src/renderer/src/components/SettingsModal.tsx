/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import './SettingsModal.css';
import type { Settings, ThemeDisplay } from '@google/gemini-cli';
import { McpServerManager } from './McpServerManager';
import { LanguageMappingsManager } from './LanguageMappingsManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultSettings: Partial<Settings> = {
  theme: 'Default Dark',
  vimMode: false,
  hideTips: false,
  hideBanner: false,
  telemetry: {
    enabled: true,
  },
  fileFiltering: {
    respectGitIgnore: true,
    respectGeminiIgnore: true,
  },
  showMemoryUsage: false,
  maxSessionTurns: -1,
  memoryImportFormat: 'tree',
  disableAutoUpdate: false,
  mcpServers: {},
};

// Helper to get nested properties safely
const get = (
  obj: Record<string, unknown>,
  path: string,
  defaultValue: unknown,
) => {
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result === undefined || result === null) {
      return defaultValue;
    }
    result = result[key] as Record<string, unknown>;
  }
  return result === undefined ? defaultValue : result;
};

// Helper to set nested properties safely
const set = (obj: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = current[keys[i]] || {};
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
};

const SETTINGS_CONFIG = [
  // Appearance
  {
    key: 'hideBanner',
    label: 'Hide Startup Banner',
    description: 'Hides the welcome banner at startup.',
    type: 'checkbox',
    category: 'Appearance',
  },
  {
    key: 'hideTips',
    label: 'Hide Startup Tips',
    description: 'Hides the helpful tips displayed at startup.',
    type: 'checkbox',
    category: 'Appearance',
  },
  {
    key: 'showMemoryUsage',
    label: 'Show Memory Usage',
    description: 'Displays memory usage in the status bar.',
    type: 'checkbox',
    category: 'Appearance',
  },
  {
    key: 'hideWindowTitle',
    label: 'Hide Window Title',
    description: 'Hides the window title bar.',
    type: 'checkbox',
    category: 'Appearance',
  },
  {
    key: 'accessibility.disableLoadingPhrases',
    label: 'Disable Loading Phrases',
    description: 'Disables the animated loading phrases.',
    type: 'checkbox',
    category: 'Appearance',
  },

  // Behavior
  {
    key: 'vimMode',
    label: 'Vim Mode',
    description: 'Enables Vim keybindings for input.',
    type: 'checkbox',
    category: 'Behavior',
  },
  {
    key: 'maxSessionTurns',
    label: 'Maximum Session Turns',
    description: 'The maximum number of turns to keep in a session.',
    type: 'number',
    category: 'Behavior',
  },
  {
    key: 'memoryImportFormat',
    label: 'Memory Import Format',
    description: 'The format to use when importing memory.',
    type: 'select',
    options: ['tree', 'flat'],
    category: 'Behavior',
  },
  {
    key: 'preferredEditor',
    label: 'Preferred Editor',
    description: 'The command to launch your preferred editor.',
    type: 'text',
    category: 'Behavior',
  },
  {
    key: 'terminalCwd',
    label: 'Terminal Working Directory',
    description:
      'The starting directory for the integrated terminal. Defaults to your Documents folder if not set.',
    type: 'text',
    category: 'Behavior',
  },
  {
    key: 'selectedAuthType',
    label: 'Selected Authentication Type',
    description: 'The authentication method to use.',
    type: 'select',
    options: ['google-auth', 'gcloud'],
    category: 'Behavior',
  },
  {
    key: 'contextFileName',
    label: 'Context File Name(s)',
    description: 'Comma-separated list of context file names.',
    type: 'text',
    category: 'Behavior',
  },
  {
    key: 'languageMappings',
    label: 'Language Mappings',
    description:
      'Map file extensions to language names for syntax highlighting.',
    type: 'custom',
    category: 'Behavior',
    render: () => <LanguageMappingsManager />,
  },

  // File Filtering
  {
    key: 'fileFiltering.respectGitIgnore',
    label: 'Respect .gitignore',
    description: 'Respects .gitignore files when searching for files.',
    type: 'checkbox',
    category: 'File Filtering',
  },
  {
    key: 'fileFiltering.respectGeminiIgnore',
    label: 'Respect .geminiignore',
    description: 'Respects .geminiignore files when searching for files.',
    type: 'checkbox',
    category: 'File Filtering',
  },
  {
    key: 'fileFiltering.enableRecursiveFileSearch',
    label: 'Enable Recursive File Search',
    description: 'Enables recursive file searching.',
    type: 'checkbox',
    category: 'File Filtering',
  },

  // Updates & Telemetry
  {
    key: 'disableAutoUpdate',
    label: 'Disable Auto-Update',
    description: 'Disables automatic application updates.',
    type: 'checkbox',
    category: 'Updates & Telemetry',
  },
  {
    key: 'telemetry.enabled',
    label: 'Enable Telemetry',
    description: 'Enables telemetry to help improve the application.',
    type: 'checkbox',
    category: 'Updates & Telemetry',
  },
  {
    key: 'usageStatisticsEnabled',
    label: 'Enable Usage Statistics',
    description: 'Enables the collection of usage statistics.',
    type: 'checkbox',
    category: 'Updates & Telemetry',
  },

  // Advanced
  {
    key: 'sandbox',
    label: 'Enable Sandbox',
    description: 'Enables the sandbox for running tools.',
    type: 'checkbox',
    category: 'Advanced',
  },
  {
    key: 'autoConfigureMaxOldSpaceSize',
    label: 'Auto-Configure Max Old Space Size',
    description: 'Automatically configures the max old space size for Node.js.',
    type: 'checkbox',
    category: 'Advanced',
  },
  {
    key: 'checkpointing.enabled',
    label: 'Enable Checkpointing',
    description: 'Enables session checkpointing.',
    type: 'checkbox',
    category: 'Advanced',
  },
  {
    key: 'ideMode',
    label: 'Enable IDE Mode',
    description: 'Enables IDE integration features.',
    type: 'checkbox',
    category: 'Advanced',
  },
  {
    key: 'ideModeFeature',
    label: 'Enable IDE Mode Feature',
    description: 'Enables experimental IDE mode features.',
    type: 'checkbox',
    category: 'Advanced',
  },
  {
    key: 'memoryDiscoveryMaxDirs',
    label: 'Memory Discovery Max Directories',
    description: 'The maximum number of directories to search for memory.',
    type: 'number',
    category: 'Advanced',
  },
  {
    key: 'toolDiscoveryCommand',
    label: 'Tool Discovery Command',
    description: 'The command to use for discovering tools.',
    type: 'text',
    category: 'Advanced',
  },
  {
    key: 'toolCallCommand',
    label: 'Tool Call Command',
    description: 'The command to use for calling tools.',
    type: 'text',
    category: 'Advanced',
  },
  {
    key: 'mcpServerCommand',
    label: 'MCP Server Command',
    description: 'The command to start the MCP server.',
    type: 'text',
    category: 'Advanced',
  },
  {
    key: 'coreTools',
    label: 'Core Tools',
    description: 'Comma-separated list of core tools.',
    type: 'text',
    category: 'Advanced',
  },
  {
    key: 'excludeTools',
    label: 'Exclude Tools',
    description: 'Comma-separated list of tools to exclude.',
    type: 'text',
    category: 'Advanced',
  },
  {
    key: 'allowMCPServers',
    label: 'Allow MCP Servers',
    description: 'Comma-separated list of allowed MCP servers.',
    type: 'text',
    category: 'Advanced',
  },
  {
    key: 'excludeMCPServers',
    label: 'Exclude MCP Servers',
    description: 'Comma-separated list of excluded MCP servers.',
    type: 'text',
    category: 'Advanced',
  },
  {
    key: 'env',
    label: 'Environment Variables',
    description:
      'Set environment variables for the application, one per line, in the format KEY=VALUE.',
    type: 'textarea',
    category: 'Advanced',
  },
];

const CATEGORIES = [
  'Appearance',
  'Behavior',
  'File Filtering',
  'Updates & Telemetry',
  'MCP Servers',
  'Advanced',
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const [availableThemes, setAvailableThemes] = useState<ThemeDisplay[]>([]);
  const [scope, setScope] = useState('User');
  const [activeCategory, setActiveCategory] = useState('Appearance');

  useEffect(() => {
    if (isOpen) {
      window.electron?.themes
        ?.get()
        .then(setAvailableThemes)
        .catch((err: Error) =>
          console.error('Failed to get themes', err),
        );
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && window.electron?.settings) {
      window.electron.settings
        .get()
        .then((loadedSettings) => {
          const mergedSettings = loadedSettings.merged || {};
          const initialSettingsState: Partial<Settings> = {
            ...defaultSettings,
            ...mergedSettings,
          };

          setSettings(initialSettingsState);
        })
        .catch((err: Error) =>
          console.error('Failed to get settings', err),
        );
    }
  }, [isOpen, scope]);

  const handleChange = useCallback(
    async (
      field: string,
      value: string | boolean | number | Record<string, unknown>,
    ) => {
      const newSettings = { ...settings };
      set(newSettings, field, value);
      setSettings(newSettings);

      const changes = { [field]: value };
      try {
        await window.electron.settings.set({
          changes,
          scope,
        });
      } catch (error) {
        console.error('Failed to set settings:', error);
      }
    },
    [settings, scope],
  );

  const handleClose = async () => {
    try {
      await window.electron.settings.set({
        changes: settings as Partial<Settings>,
        scope,
      });
    } catch (error) {
      console.error('Failed to set settings:', error);
    }
    try {
      await window.electron.settings.restartTerminal();
    } catch (error) {
      console.error('Failed to restart terminal:', error);
    }
    onClose();
  };

  const renderSetting = (key: string, type: string, options?: string[]) => {
    const value = get(settings, key, '');
    switch (type) {
      case 'checkbox':
        return (
          <input
            type="checkbox"
            id={key}
            checked={!!value}
            onChange={(e) => handleChange(key, e.target.checked)}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            id={key}
            value={value as number}
            onChange={(e) => handleChange(key, parseInt(e.target.value, 10))}
          />
        );
      case 'text':
        return (
          <input
            type="text"
            id={key}
            value={value as string}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        );
      case 'textarea':
        return (
          <textarea
            id={key}
            value={value as string}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        );
      case 'select':
        return (
          <select
            id={key}
            value={value as string}
            onChange={(e) => handleChange(key, e.target.value)}
          >
            {options?.map((option) => (
              <option key={option} value={option}>
                {option}
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
          {CATEGORIES.map((category) => (
            <li
              key={category}
              className={activeCategory === category ? 'active' : ''}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </li>
          ))}
        </ul>
        <button className="close-button" onClick={handleClose}>
          Close
        </button>
      </div>
      <div className="settings-content">
        <h3>{activeCategory}</h3>
        {activeCategory === 'Appearance' && (
          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="theme">Theme</label>
              <p>The color theme for the application.</p>
            </div>
            <div className="setting-control">
              <select
                id="theme"
                value={settings.theme}
                onChange={(e) => handleChange('theme', e.target.value)}
              >
                {availableThemes.map((theme) => (
                  <option key={theme.name} value={theme.name}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {SETTINGS_CONFIG.filter((s) => s.category === activeCategory).map(
          (config) =>
            config.type === 'custom' ? (
              <div className="setting-item" key={config.key}>
                <div className="setting-info">
                  <label>{config.label}</label>
                  <p>{config.description}</p>
                </div>
                <div className="setting-control">{config.render?.()}</div>
              </div>
            ) : (
              <div className="setting-item" key={config.key}>
                <div className="setting-info">
                  <label htmlFor={config.key}>{config.label}</label>
                  <p>{config.description}</p>
                </div>
                <div className="setting-control">
                  {renderSetting(config.key, config.type, config.options)}
                </div>
              </div>
            ),
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
