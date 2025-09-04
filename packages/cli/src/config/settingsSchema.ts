/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MCPServerConfig,
  BugCommandSettings,
  TelemetrySettings,
  AuthType,
  ChatCompressionSettings,
} from '@google/gemini-cli-core';
import { CustomTheme } from '../ui/themes/theme.js';
import i18n from '../i18n/index.js';

export interface SettingOption {
  label: string;
  value: string;
}

export interface SettingDefinition {
  type: 'boolean' | 'string' | 'number' | 'array' | 'object' | 'enum';
  label: string | (() => string);
  category: string;
  requiresRestart: boolean;
  default: boolean | string | number | string[] | object | undefined;
  description?: string | (() => string);
  parentKey?: string;
  childKey?: string;
  key?: string;
  properties?: SettingsSchema;
  showInDialog?: boolean;
  options?: readonly SettingOption[]; // Available for 'enum' type
}

export interface SettingsSchema {
  [key: string]: SettingDefinition;
}

export type MemoryImportFormat = 'tree' | 'flat';
export type DnsResolutionOrder = 'ipv4first' | 'verbatim';

/**
 * The canonical schema for all settings.
 * The structure of this object defines the structure of the `Settings` type.
 * `as const` is crucial for TypeScript to infer the most specific types possible.
 */
export const SETTINGS_SCHEMA = {
  // UI Settings
  theme: {
    type: 'string',
    label: () => i18n.t('settings:labels.theme'),
    category: 'UI',
    requiresRestart: false,
    default: undefined as string | undefined,
    description: () => i18n.t('settings:descriptions.theme'),
    showInDialog: false,
  },
  customThemes: {
    type: 'object',
    label: () => i18n.t('settings:labels.customThemes'),
    category: 'UI',
    requiresRestart: false,
    default: {} as Record<string, CustomTheme>,
    description: () => i18n.t('settings:descriptions.customThemes'),
    showInDialog: false,
  },
  hideWindowTitle: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.hideWindowTitle'),
    category: 'UI',
    requiresRestart: true,
    default: false,
    description: () => i18n.t('settings:descriptions.hideWindowTitle'),
    showInDialog: true,
  },
  hideTips: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.hideTips'),
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.hideTips'),
    showInDialog: true,
  },
  hideBanner: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.hideBanner'),
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.hideBanner'),
    showInDialog: true,
  },
  hideFooter: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.hideFooter'),
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.hideFooter'),
    showInDialog: true,
  },
  showMemoryUsage: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.showMemoryUsage'),
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.showMemoryUsage'),
    showInDialog: true,
  },
  language: {
    type: 'enum',
    label: () => i18n.t('settings:labels.language'),
    category: 'UI',
    requiresRestart: false,
    default: '' as string, // Empty string means use environment variables
    description: () => i18n.t('settings:descriptions.language'),
    showInDialog: true,
    options: [
      { label: 'Use GEMINI_LANG (Environment Variable)', value: '' },
      { label: 'English', value: 'en' },
      { label: '中文', value: 'zh' },
      { label: 'Español', value: 'es' },
      { label: 'Français', value: 'fr' },
    ],
  },
  usageStatisticsEnabled: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.enableUsageStatistics'),
    category: 'General',
    requiresRestart: true,
    default: true,
    description: () => i18n.t('settings:descriptions.enableUsageStatistics'),
    showInDialog: false, // All details are shown in /privacy and dependent on auth type
  },
  autoConfigureMaxOldSpaceSize: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.autoConfigureMaxOldSpaceSize'),
    category: 'General',
    requiresRestart: true,
    default: false,
    description: () =>
      i18n.t('settings:descriptions.autoConfigureMaxOldSpaceSize'),
    showInDialog: true,
  },
  preferredEditor: {
    type: 'string',
    label: () => i18n.t('settings:labels.preferredEditor'),
    category: 'General',
    requiresRestart: false,
    default: undefined as string | undefined,
    description: () => i18n.t('settings:descriptions.preferredEditor'),
    showInDialog: false,
  },
  maxSessionTurns: {
    type: 'number',
    label: () => i18n.t('settings:labels.maxSessionTurns'),
    category: 'General',
    requiresRestart: false,
    default: -1,
    description: () => i18n.t('settings:descriptions.maxSessionTurns'),
    showInDialog: true,
  },
  memoryImportFormat: {
    type: 'string',
    label: () => i18n.t('settings:labels.memoryImportFormat'),
    category: 'General',
    requiresRestart: false,
    default: undefined as MemoryImportFormat | undefined,
    description: () => i18n.t('settings:descriptions.memoryImportFormat'),
    showInDialog: false,
  },
  memoryDiscoveryMaxDirs: {
    type: 'number',
    label: () => i18n.t('settings:labels.memoryDiscoveryMaxDirs'),
    category: 'General',
    requiresRestart: false,
    default: 200,
    description: () => i18n.t('settings:descriptions.memoryDiscoveryMaxDirs'),
    showInDialog: true,
  },
  contextFileName: {
    type: 'object',
    label: () => i18n.t('settings:labels.contextFileName'),
    category: 'General',
    requiresRestart: false,
    default: undefined as string | string[] | undefined,
    description: () => i18n.t('settings:descriptions.contextFileName'),
    showInDialog: false,
  },
  vimMode: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.vimMode'),
    category: 'Mode',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.vimMode'),
    showInDialog: true,
  },
  ideMode: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.ideMode'),
    category: 'Mode',
    requiresRestart: true,
    default: false,
    description: () => i18n.t('settings:descriptions.ideMode'),
    showInDialog: true,
  },

  accessibility: {
    type: 'object',
    label: () => i18n.t('settings:labels.accessibility'),
    category: 'Accessibility',
    requiresRestart: true,
    default: {},
    description: () => i18n.t('settings:descriptions.accessibility'),
    showInDialog: false,
    properties: {
      disableLoadingPhrases: {
        type: 'boolean',
        label: () => i18n.t('settings:labels.disableLoadingPhrases'),
        category: 'Accessibility',
        requiresRestart: true,
        default: false,
        description: () =>
          i18n.t('settings:descriptions.disableLoadingPhrases'),
        showInDialog: true,
      },
    },
  },
  checkpointing: {
    type: 'object',
    label: () => i18n.t('settings:labels.checkpointing'),
    category: 'Checkpointing',
    requiresRestart: true,
    default: {},
    description: () => i18n.t('settings:descriptions.checkpointing'),
    showInDialog: false,
    properties: {
      enabled: {
        type: 'boolean',
        label: () => i18n.t('settings:labels.enableCheckpointing'),
        category: 'Checkpointing',
        requiresRestart: true,
        default: false,
        description: () => i18n.t('settings:descriptions.enableCheckpointing'),
        showInDialog: false,
      },
    },
  },
  fileFiltering: {
    type: 'object',
    label: () => i18n.t('settings:labels.fileFiltering'),
    category: 'File Filtering',
    requiresRestart: true,
    default: {},
    description: () => i18n.t('settings:descriptions.fileFiltering'),
    showInDialog: false,
    properties: {
      respectGitIgnore: {
        type: 'boolean',
        label: () => i18n.t('settings:labels.respectGitIgnore'),
        category: 'File Filtering',
        requiresRestart: true,
        default: true,
        description: () => i18n.t('settings:descriptions.respectGitIgnore'),
        showInDialog: true,
      },
      respectGeminiIgnore: {
        type: 'boolean',
        label: () => i18n.t('settings:labels.respectGeminiIgnore'),
        category: 'File Filtering',
        requiresRestart: true,
        default: true,
        description: () => i18n.t('settings:descriptions.respectGeminiIgnore'),
        showInDialog: true,
      },
      enableRecursiveFileSearch: {
        type: 'boolean',
        label: () => i18n.t('settings:labels.enableRecursiveFileSearch'),
        category: 'File Filtering',
        requiresRestart: true,
        default: true,
        description: () =>
          i18n.t('settings:descriptions.enableRecursiveFileSearch'),
        showInDialog: true,
      },
    },
  },

  disableAutoUpdate: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.disableAutoUpdate'),
    category: 'Updates',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.disableAutoUpdate'),
    showInDialog: true,
  },

  shouldUseNodePtyShell: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.shouldUseNodePtyShell'),
    category: 'Shell',
    requiresRestart: true,
    default: false,
    description: () => i18n.t('settings:descriptions.shouldUseNodePtyShell'),
    showInDialog: true,
  },

  selectedAuthType: {
    type: 'string',
    label: () => i18n.t('settings:labels.selectedAuthType'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as AuthType | undefined,
    description: () => i18n.t('settings:descriptions.selectedAuthType'),
    showInDialog: false,
  },
  useExternalAuth: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.useExternalAuth'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as boolean | undefined,
    description: () => i18n.t('settings:descriptions.useExternalAuth'),
    showInDialog: false,
  },
  sandbox: {
    type: 'object',
    label: () => i18n.t('settings:labels.sandbox'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as boolean | string | undefined,
    description: () => i18n.t('settings:descriptions.sandbox'),
    showInDialog: false,
  },
  coreTools: {
    type: 'array',
    label: () => i18n.t('settings:labels.coreTools'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string[] | undefined,
    description: () => i18n.t('settings:descriptions.coreTools'),
    showInDialog: false,
  },
  excludeTools: {
    type: 'array',
    label: () => i18n.t('settings:labels.excludeTools'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string[] | undefined,
    description: () => i18n.t('settings:descriptions.excludeTools'),
    showInDialog: false,
  },
  toolDiscoveryCommand: {
    type: 'string',
    label: () => i18n.t('settings:labels.toolDiscoveryCommand'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string | undefined,
    description: () => i18n.t('settings:descriptions.toolDiscoveryCommand'),
    showInDialog: false,
  },
  toolCallCommand: {
    type: 'string',
    label: () => i18n.t('settings:labels.toolCallCommand'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string | undefined,
    description: () => i18n.t('settings:descriptions.toolCallCommand'),
    showInDialog: false,
  },
  mcpServerCommand: {
    type: 'string',
    label: 'MCP Server Command',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string | undefined,
    description: 'Command to start an MCP server.',
    showInDialog: false,
  },
  mcpServers: {
    type: 'object',
    label: 'MCP Servers',
    category: 'Advanced',
    requiresRestart: true,
    default: {} as Record<string, MCPServerConfig>,
    description: 'Configuration for MCP servers.',
    showInDialog: false,
  },
  allowMCPServers: {
    type: 'array',
    label: 'Allow MCP Servers',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string[] | undefined,
    description: 'A whitelist of MCP servers to allow.',
    showInDialog: false,
  },
  excludeMCPServers: {
    type: 'array',
    label: 'Exclude MCP Servers',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string[] | undefined,
    description: 'A blacklist of MCP servers to exclude.',
    showInDialog: false,
  },
  telemetry: {
    type: 'object',
    label: 'Telemetry',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as TelemetrySettings | undefined,
    description: 'Telemetry configuration.',
    showInDialog: false,
  },
  bugCommand: {
    type: 'object',
    label: () => i18n.t('settings:labels.bugCommand'),
    category: 'Advanced',
    requiresRestart: false,
    default: undefined as BugCommandSettings | undefined,
    description: () => i18n.t('settings:descriptions.bugCommand'),
    showInDialog: false,
  },
  summarizeToolOutput: {
    type: 'object',
    label: () => i18n.t('settings:labels.summarizeToolOutput'),
    category: 'Advanced',
    requiresRestart: false,
    default: undefined as Record<string, { tokenBudget?: number }> | undefined,
    description: () => i18n.t('settings:descriptions.summarizeToolOutput'),
    showInDialog: false,
  },

  dnsResolutionOrder: {
    type: 'string',
    label: () => i18n.t('settings:labels.dnsResolutionOrder'),
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as DnsResolutionOrder | undefined,
    description: () => i18n.t('settings:descriptions.dnsResolutionOrder'),
    showInDialog: false,
  },
  excludedProjectEnvVars: {
    type: 'array',
    label: () => i18n.t('settings:labels.excludedProjectEnvironmentVariables'),
    category: 'Advanced',
    requiresRestart: false,
    default: ['DEBUG', 'DEBUG_MODE'] as string[],
    description: () =>
      i18n.t('settings:descriptions.excludedProjectEnvironmentVariables'),
    showInDialog: false,
  },
  disableUpdateNag: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.disableUpdateNag'),
    category: 'Updates',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.disableUpdateNag'),
    showInDialog: false,
  },
  includeDirectories: {
    type: 'array',
    label: () => i18n.t('settings:labels.includeDirectories'),
    category: 'General',
    requiresRestart: false,
    default: [] as string[],
    description: () => i18n.t('settings:descriptions.includeDirectories'),
    showInDialog: false,
  },
  loadMemoryFromIncludeDirectories: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.loadMemoryFromIncludeDirectories'),
    category: 'General',
    requiresRestart: false,
    default: false,
    description: () =>
      i18n.t('settings:descriptions.loadMemoryFromIncludeDirectories'),
    showInDialog: true,
  },
  model: {
    type: 'string',
    label: () => i18n.t('settings:labels.model'),
    category: 'General',
    requiresRestart: false,
    default: undefined as string | undefined,
    description: () => i18n.t('settings:descriptions.model'),
    showInDialog: false,
  },
  hasSeenIdeIntegrationNudge: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.hasSeenIdeIntegrationNudge'),
    category: 'General',
    requiresRestart: false,
    default: false,
    description: () =>
      i18n.t('settings:descriptions.hasSeenIdeIntegrationNudge'),
    showInDialog: false,
  },
  folderTrustFeature: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.folderTrustFeature'),
    category: 'General',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.folderTrustFeature'),
    showInDialog: true,
  },
  folderTrust: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.folderTrust'),
    category: 'General',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.folderTrust'),
    showInDialog: true,
  },
  chatCompression: {
    type: 'object',
    label: () => i18n.t('settings:labels.chatCompression'),
    category: 'General',
    requiresRestart: false,
    default: undefined as ChatCompressionSettings | undefined,
    description: () => i18n.t('settings:descriptions.chatCompression'),
    showInDialog: false,
  },
  showLineNumbers: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.showLineNumbers'),
    category: 'General',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.showLineNumbers'),
    showInDialog: true,
  },
  skipNextSpeakerCheck: {
    type: 'boolean',
    label: () => i18n.t('settings:labels.skipNextSpeakerCheck'),
    category: 'General',
    requiresRestart: false,
    default: false,
    description: () => i18n.t('settings:descriptions.skipNextSpeakerCheck'),
    showInDialog: true,
  },
} as const;

type InferSettings<T extends SettingsSchema> = {
  -readonly [K in keyof T]?: T[K] extends { properties: SettingsSchema }
    ? InferSettings<T[K]['properties']>
    : T[K]['default'] extends boolean
      ? boolean
      : T[K]['default'];
};

export type Settings = InferSettings<typeof SETTINGS_SCHEMA>;
