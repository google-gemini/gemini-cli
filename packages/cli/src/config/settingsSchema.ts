/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SettingDefinition {
  type: 'boolean' | 'string' | 'number' | 'array' | 'object';
  label: string;
  category: string;
  requiresRestart: boolean;
  default: boolean | string | number | string[] | object;
  description?: string;
  parentKey?: string;
  childKey?: string;
  key?: string;
}

export interface SettingsSchema {
  [key: string]: SettingDefinition;
}

export const SETTINGS_SCHEMA: SettingsSchema = {
  showMemoryUsage: {
    type: 'boolean',
    label: 'Show Memory Usage',
    category: 'General',
    requiresRestart: false,
    default: false,
    description: 'Display memory usage information in the UI',
  },

  usageStatisticsEnabled: {
    type: 'boolean',
    label: 'Enable Usage Statistics',
    category: 'General',
    requiresRestart: true,
    default: false,
    description: 'Enable collection of usage statistics',
  },

  autoConfigureMaxOldSpaceSize: {
    type: 'boolean',
    label: 'Auto Configure Max Old Space Size',
    category: 'General',
    requiresRestart: true,
    default: false,
    description: 'Automatically configure Node.js memory limits',
  },

  'accessibility.disableLoadingPhrases': {
    type: 'boolean',
    label: 'Disable Loading Phrases (Accessibility)',
    category: 'Accessibility',
    requiresRestart: true,
    default: false,
    description: 'Disable loading phrases for accessibility',
    parentKey: 'accessibility',
    childKey: 'disableLoadingPhrases',
  },

  'checkpointing.enabled': {
    type: 'boolean',
    label: 'Enable Checkpointing',
    category: 'Checkpointing',
    requiresRestart: true,
    default: false,
    description: 'Enable session checkpointing for recovery',
    parentKey: 'checkpointing',
    childKey: 'enabled',
  },

  'fileFiltering.respectGitIgnore': {
    type: 'boolean',
    label: 'Respect .gitignore',
    category: 'File Filtering',
    requiresRestart: true,
    default: true,
    description: 'Respect .gitignore files when searching',
    parentKey: 'fileFiltering',
    childKey: 'respectGitIgnore',
  },

  'fileFiltering.respectGeminiIgnore': {
    type: 'boolean',
    label: 'Respect .geminiignore',
    category: 'File Filtering',
    requiresRestart: true,
    default: true,
    description: 'Respect .geminiignore files when searching',
    parentKey: 'fileFiltering',
    childKey: 'respectGeminiIgnore',
  },

  'fileFiltering.enableRecursiveFileSearch': {
    type: 'boolean',
    label: 'Enable Recursive File Search',
    category: 'File Filtering',
    requiresRestart: true,
    default: true,
    description: 'Enable recursive file search functionality',
    parentKey: 'fileFiltering',
    childKey: 'enableRecursiveFileSearch',
  },

  hideWindowTitle: {
    type: 'boolean',
    label: 'Hide Window Title',
    category: 'UI',
    requiresRestart: true,
    default: false,
    description: 'Hide the window title bar',
  },

  hideTips: {
    type: 'boolean',
    label: 'Hide Tips',
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: 'Hide helpful tips in the UI',
  },

  hideBanner: {
    type: 'boolean',
    label: 'Hide Banner',
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: 'Hide the application banner',
  },

  ideMode: {
    type: 'boolean',
    label: 'IDE Mode',
    category: 'Mode',
    requiresRestart: true,
    default: false,
    description: 'Enable IDE integration mode',
  },

  vimMode: {
    type: 'boolean',
    label: 'Vim Mode',
    category: 'Mode',
    requiresRestart: false,
    default: false,
    description: 'Enable Vim keybindings',
  },

  disableAutoUpdate: {
    type: 'boolean',
    label: 'Disable Auto Update',
    category: 'Updates',
    requiresRestart: false,
    default: false,
    description: 'Disable automatic updates',
  },
};
