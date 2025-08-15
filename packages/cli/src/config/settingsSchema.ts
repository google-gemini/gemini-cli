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

export interface SettingDefinition {
  type: 'boolean' | 'string' | 'number' | 'array' | 'object';
  label: string;
  category: string;
  requiresRestart: boolean;
  default: boolean | string | number | string[] | object | undefined;
  description?: string;
  parentKey?: string;
  childKey?: string;
  key?: string;
  properties?: SettingsSchema;
  showInDialog?: boolean;
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
    label: 'Theme',
    category: 'UI',
    requiresRestart: false,
    default: undefined as string | undefined,
    description: 'The color theme for the UI.',
    showInDialog: false,
  },
  customThemes: {
    type: 'object',
    label: 'Custom Themes',
    category: 'UI',
    requiresRestart: false,
    default: {} as Record<string, CustomTheme>,
    description: 'Custom theme definitions.',
    showInDialog: false,
  },
  hideWindowTitle: {
    type: 'boolean',
    label: 'Hide Window Title',
    category: 'UI',
    requiresRestart: true,
    default: false,
    description: 'Hide the window title bar',
    showInDialog: true,
  },
  hideTips: {
    type: 'boolean',
    label: 'Hide Tips',
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: 'Hide helpful tips in the UI',
    showInDialog: true,
  },
  hideBanner: {
    type: 'boolean',
    label: 'Hide Banner',
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: 'Hide the application banner',
    showInDialog: true,
  },
  showMemoryUsage: {
    type: 'boolean',
    label: 'Show Memory Usage',
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: 'Display memory usage information in the UI',
    showInDialog: true,
  },

  usageStatisticsEnabled: {
    type: 'boolean',
    label: 'Enable Usage Statistics',
    category: 'General',
    requiresRestart: true,
    default: true,
    description: 'Enable collection of usage statistics',
    showInDialog: true,
  },
  autoConfigureMaxOldSpaceSize: {
    type: 'boolean',
    label: 'Auto Configure Max Old Space Size',
    category: 'General',
    requiresRestart: true,
    default: false,
    description: 'Automatically configure Node.js memory limits',
    showInDialog: true,
  },
  preferredEditor: {
    type: 'string',
    label: 'Preferred Editor',
    category: 'General',
    requiresRestart: false,
    default: undefined as string | undefined,
    description: 'The preferred editor to open files in.',
    showInDialog: false,
  },
  maxSessionTurns: {
    type: 'number',
    label: 'Max Session Turns',
    category: 'General',
    requiresRestart: false,
    default: undefined as number | undefined,
    description:
      'Maximum number of user/model/tool turns to keep in a session.',
    showInDialog: false,
  },
  memoryImportFormat: {
    type: 'string',
    label: 'Memory Import Format',
    category: 'General',
    requiresRestart: false,
    default: undefined as MemoryImportFormat | undefined,
    description: 'The format to use when importing memory.',
    showInDialog: false,
  },
  memoryDiscoveryMaxDirs: {
    type: 'number',
    label: 'Memory Discovery Max Dirs',
    category: 'General',
    requiresRestart: false,
    default: undefined as number | undefined,
    description: 'Maximum number of directories to search for memory.',
    showInDialog: false,
  },
  contextFileName: {
    type: 'object',
    label: 'Context File Name',
    category: 'General',
    requiresRestart: false,
    default: undefined as string | string[] | undefined,
    description: 'The name of the context file.',
    showInDialog: false,
  },
  vimMode: {
    type: 'boolean',
    label: 'Vim Mode',
    category: 'Mode',
    requiresRestart: false,
    default: false,
    description: 'Enable Vim keybindings',
    showInDialog: true,
  },
  ideMode: {
    type: 'boolean',
    label: 'IDE Mode',
    category: 'Mode',
    requiresRestart: true,
    default: false,
    description: 'Enable IDE integration mode',
    showInDialog: true,
  },

  accessibility: {
    type: 'object',
    label: 'Accessibility',
    category: 'Accessibility',
    requiresRestart: true,
    default: {},
    description: 'Accessibility settings.',
    showInDialog: false,
    properties: {
      disableLoadingPhrases: {
        type: 'boolean',
        label: 'Disable Loading Phrases',
        category: 'Accessibility',
        requiresRestart: true,
        default: false,
        description: 'Disable loading phrases for accessibility',
        showInDialog: true,
      },
    },
  },
  checkpointing: {
    type: 'object',
    label: 'Checkpointing',
    category: 'Checkpointing',
    requiresRestart: true,
    default: {},
    description: 'Session checkpointing settings.',
    showInDialog: false,
    properties: {
      enabled: {
        type: 'boolean',
        label: 'Enable Checkpointing',
        category: 'Checkpointing',
        requiresRestart: true,
        default: false,
        description: 'Enable session checkpointing for recovery',
        showInDialog: false,
      },
    },
  },
  fileFiltering: {
    type: 'object',
    label: 'File Filtering',
    category: 'File Filtering',
    requiresRestart: true,
    default: {},
    description: 'Settings for git-aware file filtering.',
    showInDialog: false,
    properties: {
      respectGitIgnore: {
        type: 'boolean',
        label: 'Respect .gitignore',
        category: 'File Filtering',
        requiresRestart: true,
        default: true,
        description: 'Respect .gitignore files when searching',
        showInDialog: true,
      },
      respectGeminiIgnore: {
        type: 'boolean',
        label: 'Respect .geminiignore',
        category: 'File Filtering',
        requiresRestart: true,
        default: true,
        description: 'Respect .geminiignore files when searching',
        showInDialog: true,
      },
      enableRecursiveFileSearch: {
        type: 'boolean',
        label: 'Enable Recursive File Search',
        category: 'File Filtering',
        requiresRestart: true,
        default: true,
        description: 'Enable recursive file search functionality',
        showInDialog: true,
      },
    },
  },

  disableAutoUpdate: {
    type: 'boolean',
    label: 'Disable Auto Update',
    category: 'Updates',
    requiresRestart: false,
    default: false,
    description: 'Disable automatic updates',
    showInDialog: true,
  },

  selectedAuthType: {
    type: 'string',
    label: 'Selected Auth Type',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as AuthType | undefined,
    description: 'The currently selected authentication type.',
    showInDialog: false,
  },
  useExternalAuth: {
    type: 'boolean',
    label: 'Use External Auth',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as boolean | undefined,
    description: 'Whether to use an external authentication flow.',
    showInDialog: false,
  },
  sandbox: {
    type: 'object',
    label: 'Sandbox',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as boolean | string | undefined,
    description:
      'Sandbox execution environment (can be a boolean or a path string).',
    showInDialog: false,
  },
  coreTools: {
    type: 'array',
    label: 'Core Tools',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string[] | undefined,
    description: 'Paths to core tool definitions.',
    showInDialog: false,
  },
  excludeTools: {
    type: 'array',
    label: 'Exclude Tools',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string[] | undefined,
    description: 'Tool names to exclude from discovery.',
    showInDialog: false,
  },
  toolDiscoveryCommand: {
    type: 'string',
    label: 'Tool Discovery Command',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string | undefined,
    description: 'Command to run for tool discovery.',
    showInDialog: false,
  },
  toolCallCommand: {
    type: 'string',
    label: 'Tool Call Command',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as string | undefined,
    description: 'Command to run for tool calls.',
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
    label: 'Bug Command',
    category: 'Advanced',
    requiresRestart: false,
    default: undefined as BugCommandSettings | undefined,
    description: 'Configuration for the bug report command.',
    showInDialog: false,
  },
  summarizeToolOutput: {
    type: 'object',
    label: 'Summarize Tool Output',
    category: 'Advanced',
    requiresRestart: false,
    default: undefined as Record<string, { tokenBudget?: number }> | undefined,
    description: 'Settings for summarizing tool output.',
    showInDialog: false,
  },

  dnsResolutionOrder: {
    type: 'string',
    label: 'DNS Resolution Order',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as DnsResolutionOrder | undefined,
    description: 'The DNS resolution order.',
    showInDialog: false,
  },
  excludedProjectEnvVars: {
    type: 'array',
    label: 'Excluded Project Environment Variables',
    category: 'Advanced',
    requiresRestart: false,
    default: ['DEBUG', 'DEBUG_MODE'] as string[],
    description: 'Environment variables to exclude from project context.',
    showInDialog: false,
  },
  disableUpdateNag: {
    type: 'boolean',
    label: 'Disable Update Nag',
    category: 'Updates',
    requiresRestart: false,
    default: false,
    description: 'Disable update notification prompts.',
    showInDialog: false,
  },
  includeDirectories: {
    type: 'array',
    label: 'Include Directories',
    category: 'General',
    requiresRestart: false,
    default: [] as string[],
    description: 'Additional directories to include in the workspace context.',
    showInDialog: false,
  },
  loadMemoryFromIncludeDirectories: {
    type: 'boolean',
    label: 'Load Memory From Include Directories',
    category: 'General',
    requiresRestart: false,
    default: false,
    description: 'Whether to load memory files from include directories.',
    showInDialog: true,
  },
  model: {
    type: 'string',
    label: 'Model',
    category: 'General',
    requiresRestart: false,
    default: undefined as string | undefined,
    description: 'The Gemini model to use for conversations.',
    showInDialog: false,
  },
  hasSeenIdeIntegrationNudge: {
    type: 'boolean',
    label: 'Has Seen IDE Integration Nudge',
    category: 'General',
    requiresRestart: false,
    default: false,
    description: 'Whether the user has seen the IDE integration nudge.',
    showInDialog: false,
  },
  folderTrustFeature: {
    type: 'boolean',
    label: 'Folder Trust Feature',
    category: 'General',
    requiresRestart: false,
    default: false,
    description: 'Enable folder trust feature for enhanced security.',
    showInDialog: true,
  },
  folderTrust: {
    type: 'boolean',
    label: 'Folder Trust',
    category: 'General',
    requiresRestart: false,
    default: false,
    description: 'Setting to track whether Folder trust is enabled.',
    showInDialog: true,
  },
  chatCompression: {
    type: 'object',
    label: 'Chat Compression',
    category: 'General',
    requiresRestart: false,
    default: undefined as ChatCompressionSettings | undefined,
    description: 'Chat compression settings.',
    showInDialog: false,
  },
  showLineNumbers: {
    type: 'boolean',
    label: 'Show Line Numbers',
    category: 'General',
    requiresRestart: false,
    default: false,
    description: 'Show line numbers in the chat.',
    showInDialog: true,
  },
  loadUserMemoryInHistory: {
    type: 'boolean',
    label: 'Preload User Memory for New Chats',
    category: 'General',
    requiresRestart: false,
    default: false,
    description:
      'Load user memory (including GEMINI.md files) into the chat history for new / cleared chats.',
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
