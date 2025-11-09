/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --------------------------------------------------------------------------
// IMPORTANT: After adding or updating settings, run `npm run docs:settings`
// to regenerate the settings reference in `docs/get-started/configuration.md`.
// --------------------------------------------------------------------------

import type {
  MCPServerConfig,
  BugCommandSettings,
  TelemetrySettings,
  AuthType,
  HookDefinition,
  HookEventName,
} from '@google/gemini-cli-core';
import {
  DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES,
  DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MODEL_CONFIGS,
} from '@google/gemini-cli-core';
import type { CustomTheme } from '../ui/themes/theme.js';
import type { SessionRetentionSettings } from './settings.js';
import { DEFAULT_MIN_RETENTION } from '../utils/sessionCleanup.js';

export type SettingsType =
  | 'boolean'
  | 'string'
  | 'number'
  | 'array'
  | 'object'
  | 'enum';

export type SettingsValue =
  | boolean
  | string
  | number
  | string[]
  | object
  | undefined;

/**
 * Setting datatypes that "toggle" through a fixed list of options
 * (e.g. an enum or true/false) rather than allowing for free form input
 * (like a number or string).
 */
export const TOGGLE_TYPES: ReadonlySet<SettingsType | undefined> = new Set([
  'boolean',
  'enum',
]);

export interface SettingEnumOption {
  value: string | number;
  label: string;
}

function oneLine(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += String(values[i]);
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}

export interface SettingCollectionDefinition {
  type: SettingsType;
  description?: string;
  properties?: SettingsSchema;
  /** Enum type options  */
  options?: readonly SettingEnumOption[];
  /**
   * Optional reference identifier for generators that emit a `$ref`.
   * For example, a JSON schema generator can use this to point to a shared definition.
   */
  ref?: string;
}

export enum MergeStrategy {
  // Replace the old value with the new value. This is the default.
  REPLACE = 'replace',
  // Concatenate arrays.
  CONCAT = 'concat',
  // Merge arrays, ensuring unique values.
  UNION = 'union',
  // Shallow merge objects.
  SHALLOW_MERGE = 'shallow_merge',
}

export interface SettingDefinition {
  type: SettingsType;
  label: string;
  category: string;
  requiresRestart: boolean;
  default: SettingsValue;
  description?: string;
  parentKey?: string;
  childKey?: string;
  key?: string;
  properties?: SettingsSchema;
  showInDialog?: boolean;
  mergeStrategy?: MergeStrategy;
  /** Enum type options  */
  options?: readonly SettingEnumOption[];
  /**
   * For collection types (e.g. arrays), describes the shape of each item.
   */
  items?: SettingCollectionDefinition;
  /**
   * For map-like objects without explicit `properties`, describes the shape of the values.
   */
  additionalProperties?: SettingCollectionDefinition;
  /**
   * Optional reference identifier for generators that emit a `$ref`.
   */
  ref?: string;
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
const SETTINGS_SCHEMA = {
  // Maintained for compatibility/criticality
  mcpServers: {
    type: 'object',
    label: 'MCP Servers',
    category: 'Advanced',
    requiresRestart: true,
    default: {} as Record<string, MCPServerConfig>,
    description: 'Configuration for MCP servers.',
    showInDialog: false,
    mergeStrategy: MergeStrategy.SHALLOW_MERGE,
    additionalProperties: {
      type: 'object',
      ref: 'MCPServerConfig',
    },
  },

  general: {
    type: 'object',
    label: 'General',
    category: 'General',
    requiresRestart: false,
    default: {},
    description: 'General application settings.',
    showInDialog: false,
    properties: {
      preferredEditor: {
        type: 'string',
        label: 'Preferred Editor',
        category: 'General',
        requiresRestart: false,
        default: undefined as string | undefined,
        description: 'The preferred editor to open files in.',
        showInDialog: false,
      },
      vimMode: {
        type: 'boolean',
        label: 'Vim Mode',
        category: 'General',
        requiresRestart: false,
        default: false,
        description: 'Enable Vim keybindings',
        showInDialog: true,
      },
      disableAutoUpdate: {
        type: 'boolean',
        label: 'Disable Auto Update',
        category: 'General',
        requiresRestart: false,
        default: false,
        description: 'Disable automatic updates',
        showInDialog: true,
      },
      disableUpdateNag: {
        type: 'boolean',
        label: 'Disable Update Nag',
        category: 'General',
        requiresRestart: false,
        default: false,
        description: 'Disable update notification prompts.',
        showInDialog: false,
      },
      checkpointing: {
        type: 'object',
        label: 'Checkpointing',
        category: 'General',
        requiresRestart: true,
        default: {},
        description: 'Session checkpointing settings.',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Enable Checkpointing',
            category: 'General',
            requiresRestart: true,
            default: false,
            description: 'Enable session checkpointing for recovery',
            showInDialog: false,
          },
        },
      },
      enablePromptCompletion: {
        type: 'boolean',
        label: 'Enable Prompt Completion',
        category: 'General',
        requiresRestart: true,
        default: false,
        description:
          'Enable AI-powered prompt completion suggestions while typing.',
        showInDialog: true,
      },
      retryFetchErrors: {
        type: 'boolean',
        label: 'Retry Fetch Errors',
        category: 'General',
        requiresRestart: false,
        default: false,
        description:
          'Retry on "exception TypeError: fetch failed sending request" errors.',
        showInDialog: false,
      },
      debugKeystrokeLogging: {
        type: 'boolean',
        label: 'Debug Keystroke Logging',
        category: 'General',
        requiresRestart: false,
        default: false,
        description: 'Enable debug logging of keystrokes to the console.',
        showInDialog: true,
      },
      sessionRetention: {
        type: 'object',
        label: 'Session Retention',
        category: 'General',
        requiresRestart: false,
        default: undefined as SessionRetentionSettings | undefined,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Enable Session Cleanup',
            category: 'General',
            requiresRestart: false,
            default: false,
            description: 'Enable automatic session cleanup',
            showInDialog: true,
          },
          maxAge: {
            type: 'string',
            label: 'Max Session Age',
            category: 'General',
            requiresRestart: false,
            default: undefined as string | undefined,
            description:
              'Maximum age of sessions to keep (e.g., "30d", "7d", "24h", "1w")',
            showInDialog: false,
          },
          maxCount: {
            type: 'number',
            label: 'Max Session Count',
            category: 'General',
            requiresRestart: false,
            default: undefined as number | undefined,
            description:
              'Alternative: Maximum number of sessions to keep (most recent)',
            showInDialog: false,
          },
          minRetention: {
            type: 'string',
            label: 'Min Retention Period',
            category: 'General',
            requiresRestart: false,
            default: DEFAULT_MIN_RETENTION,
            description: `Minimum retention period (safety limit, defaults to "${DEFAULT_MIN_RETENTION}")`,
            showInDialog: false,
          },
        },
        description: 'Settings for automatic session cleanup.',
      },
    },
  },
  output: {
    type: 'object',
    label: 'Output',
    category: 'General',
    requiresRestart: false,
    default: {},
    description: 'Settings for the CLI output.',
    showInDialog: false,
    properties: {
      format: {
        type: 'enum',
        label: 'Output Format',
        category: 'General',
        requiresRestart: false,
        default: 'text',
        description: 'The format of the CLI output.',
        showInDialog: true,
        options: [
          { value: 'text', label: 'Text' },
          { value: 'json', label: 'JSON' },
        ],
      },
    },
  },

  ui: {
    type: 'object',
    label: 'UI',
    category: 'UI',
    requiresRestart: false,
    default: {},
    description: 'User interface settings.',
    showInDialog: false,
    properties: {
      theme: {
        type: 'string',
        label: 'Theme',
        category: 'UI',
        requiresRestart: false,
        default: undefined as string | undefined,
        description:
          'The color theme for the UI. See the CLI themes guide for available options.',
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
        additionalProperties: {
          type: 'object',
          ref: 'CustomTheme',
        },
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
      showStatusInTitle: {
        type: 'boolean',
        label: 'Show Status in Title',
        category: 'UI',
        requiresRestart: false,
        default: false,
        description:
          'Show Gemini CLI status and thoughts in the terminal window title',
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
      hideContextSummary: {
        type: 'boolean',
        label: 'Hide Context Summary',
        category: 'UI',
        requiresRestart: false,
        default: false,
        description:
          'Hide the context summary (GEMINI.md, MCP servers) above the input.',
        showInDialog: true,
      },
      footer: {
        type: 'object',
        label: 'Footer',
        category: 'UI',
        requiresRestart: false,
        default: {},
        description: 'Settings for the footer.',
        showInDialog: false,
        properties: {
          hideCWD: {
            type: 'boolean',
            label: 'Hide CWD',
            category: 'UI',
            requiresRestart: false,
            default: false,
            description:
              'Hide the current working directory path in the footer.',
            showInDialog: true,
          },
          hideSandboxStatus: {
            type: 'boolean',
            label: 'Hide Sandbox Status',
            category: 'UI',
            requiresRestart: false,
            default: false,
            description: 'Hide the sandbox status indicator in the footer.',
            showInDialog: true,
          },
          hideModelInfo: {
            type: 'boolean',
            label: 'Hide Model Info',
            category: 'UI',
            requiresRestart: false,
            default: false,
            description: 'Hide the model name and context usage in the footer.',
            showInDialog: true,
          },
          hideContextPercentage: {
            type: 'boolean',
            label: 'Hide Context Window Percentage',
            category: 'UI',
            requiresRestart: false,
            default: true,
            description: 'Hides the context window remaining percentage.',
            showInDialog: true,
          },
        },
      },
      hideFooter: {
        type: 'boolean',
        label: 'Hide Footer',
        category: 'UI',
        requiresRestart: false,
        default: false,
        description: 'Hide the footer from the UI',
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
      showLineNumbers: {
        type: 'boolean',
        label: 'Show Line Numbers',
        category: 'UI',
        requiresRestart: false,
        default: false,
        description: 'Show line numbers in the chat.',
        showInDialog: true,
      },
      showCitations: {
        type: 'boolean',
        label: 'Show Citations',
        category: 'UI',
        requiresRestart: false,
        default: false,
        description: 'Show citations for generated text in the chat.',
        showInDialog: true,
      },
      useFullWidth: {
        type: 'boolean',
        label: 'Use Full Width',
        category: 'UI',
        requiresRestart: false,
        default: false,
        description: 'Use the entire width of the terminal for output.',
        showInDialog: true,
      },
      useAlternateBuffer: {
        type: 'boolean',
        label: 'Use Alternate Screen Buffer',
        category: 'UI',
        requiresRestart: true,
        default: false,
        description:
          'Use an alternate screen buffer for the UI, preserving shell history.',
        showInDialog: true,
      },
      customWittyPhrases: {
        type: 'array',
        label: 'Custom Witty Phrases',
        category: 'UI',
        requiresRestart: false,
        default: [] as string[],
        description: oneLine`
          Custom witty phrases to display during loading.
          When provided, the CLI cycles through these instead of the defaults.
        `,
        showInDialog: false,
        items: { type: 'string' },
      },
      accessibility: {
        type: 'object',
        label: 'Accessibility',
        category: 'UI',
        requiresRestart: true,
        default: {},
        description: 'Accessibility settings.',
        showInDialog: false,
        properties: {
          disableLoadingPhrases: {
            type: 'boolean',
            label: 'Disable Loading Phrases',
            category: 'UI',
            requiresRestart: true,
            default: false,
            description: 'Disable loading phrases for accessibility',
            showInDialog: true,
          },
          screenReader: {
            type: 'boolean',
            label: 'Screen Reader Mode',
            category: 'UI',
            requiresRestart: true,
            default: false,
            description:
              'Render output in plain-text to be more screen reader accessible',
            showInDialog: true,
          },
        },
      },
    },
  },

  ide: {
    type: 'object',
    label: 'IDE',
    category: 'IDE',
    requiresRestart: true,
    default: {},
    description: 'IDE integration settings.',
    showInDialog: false,
    properties: {
      enabled: {
        type: 'boolean',
        label: 'IDE Mode',
        category: 'IDE',
        requiresRestart: true,
        default: false,
        description: 'Enable IDE integration mode',
        showInDialog: true,
      },
      hasSeenNudge: {
        type: 'boolean',
        label: 'Has Seen IDE Integration Nudge',
        category: 'IDE',
        requiresRestart: false,
        default: false,
        description: 'Whether the user has seen the IDE integration nudge.',
        showInDialog: false,
      },
    },
  },

  privacy: {
    type: 'object',
    label: 'Privacy',
    category: 'Privacy',
    requiresRestart: true,
    default: {},
    description: 'Privacy-related settings.',
    showInDialog: false,
    properties: {
      usageStatisticsEnabled: {
        type: 'boolean',
        label: 'Enable Usage Statistics',
        category: 'Privacy',
        requiresRestart: true,
        default: true,
        description: 'Enable collection of usage statistics',
        showInDialog: false,
      },
    },
  },

  telemetry: {
    type: 'object',
    label: 'Telemetry',
    category: 'Advanced',
    requiresRestart: true,
    default: undefined as TelemetrySettings | undefined,
    description: 'Telemetry configuration.',
    showInDialog: false,
    ref: 'TelemetrySettings',
  },

  model: {
    type: 'object',
    label: 'Model',
    category: 'Model',
    requiresRestart: false,
    default: {},
    description: 'Settings related to the generative model.',
    showInDialog: false,
    properties: {
      name: {
        type: 'string',
        label: 'Model',
        category: 'Model',
        requiresRestart: false,
        default: undefined as string | undefined,
        description: 'The Gemini model to use for conversations.',
        showInDialog: false,
      },
      maxSessionTurns: {
        type: 'number',
        label: 'Max Session Turns',
        category: 'Model',
        requiresRestart: false,
        default: -1,
        description:
          'Maximum number of user/model/tool turns to keep in a session. -1 means unlimited.',
        showInDialog: true,
      },
      summarizeToolOutput: {
        type: 'object',
        label: 'Summarize Tool Output',
        category: 'Model',
        requiresRestart: false,
        default: undefined as
          | Record<string, { tokenBudget?: number }>
          | undefined,
        description: oneLine`
          Enables or disables summarization of tool output.
          Configure per-tool token budgets (for example {"run_shell_command": {"tokenBudget": 2000}}).
          Currently only the run_shell_command tool supports summarization.
        `,
        showInDialog: false,
        additionalProperties: {
          type: 'object',
          description:
            'Per-tool summarization settings with an optional tokenBudget.',
          ref: 'SummarizeToolOutputSettings',
        },
      },
      compressionThreshold: {
        type: 'number',
        label: 'Compression Threshold',
        category: 'Model',
        requiresRestart: true,
        default: 0.2 as number,
        description:
          'The fraction of context usage at which to trigger context compression (e.g. 0.2, 0.3).',
        showInDialog: true,
      },
      skipNextSpeakerCheck: {
        type: 'boolean',
        label: 'Skip Next Speaker Check',
        category: 'Model',
        requiresRestart: false,
        default: true,
        description: 'Skip the next speaker check.',
        showInDialog: true,
      },
    },
  },

  modelConfigs: {
    type: 'object',
    label: 'Model Configs',
    category: 'Model',
    requiresRestart: false,
    default: DEFAULT_MODEL_CONFIGS,
    description: 'Model configurations.',
    showInDialog: false,
    properties: {
      aliases: {
        type: 'object',
        label: 'Model Config Aliases',
        category: 'Model',
        requiresRestart: false,
        default: DEFAULT_MODEL_CONFIGS.aliases,
        description:
          'Named presets for model configs. Can be used in place of a model name and can inherit from other aliases using an `extends` property.',
        showInDialog: false,
      },
      overrides: {
        type: 'array',
        label: 'Model Config Overrides',
        category: 'Model',
        requiresRestart: false,
        default: [],
        description:
          'Apply specific configuration overrides based on matches, with a primary key of model (or alias). The most specific match will be used.',
        showInDialog: false,
      },
    },
  },

  context: {
    type: 'object',
    label: 'Context',
    category: 'Context',
    requiresRestart: false,
    default: {},
    description: 'Settings for managing context provided to the model.',
    showInDialog: false,
    properties: {
      fileName: {
        type: 'string',
        label: 'Context File Name',
        category: 'Context',
        requiresRestart: false,
        default: undefined as string | string[] | undefined,
        ref: 'StringOrStringArray',
        description:
          'The name of the context file or files to load into memory. Accepts either a single string or an array of strings.',
        showInDialog: false,
      },
      importFormat: {
        type: 'string',
        label: 'Memory Import Format',
        category: 'Context',
        requiresRestart: false,
        default: undefined as MemoryImportFormat | undefined,
        description: 'The format to use when importing memory.',
        showInDialog: false,
      },
      discoveryMaxDirs: {
        type: 'number',
        label: 'Memory Discovery Max Dirs',
        category: 'Context',
        requiresRestart: false,
        default: 200,
        description: 'Maximum number of directories to search for memory.',
        showInDialog: true,
      },
      includeDirectories: {
        type: 'array',
        label: 'Include Directories',
        category: 'Context',
        requiresRestart: false,
        default: [] as string[],
        description: oneLine`
          Additional directories to include in the workspace context.
          Missing directories will be skipped with a warning.
        `,
        showInDialog: false,
        items: { type: 'string' },
        mergeStrategy: MergeStrategy.CONCAT,
      },
      loadMemoryFromIncludeDirectories: {
        type: 'boolean',
        label: 'Load Memory From Include Directories',
        category: 'Context',
        requiresRestart: false,
        default: false,
        description: oneLine`
          Controls how /memory refresh loads GEMINI.md files.
          When true, include directories are scanned; when false, only the current directory is used.
        `,
        showInDialog: true,
      },
      fileFiltering: {
        type: 'object',
        label: 'File Filtering',
        category: 'Context',
        requiresRestart: true,
        default: {},
        description: 'Settings for git-aware file filtering.',
        showInDialog: false,
        properties: {
          respectGitIgnore: {
            type: 'boolean',
            label: 'Respect .gitignore',
            category: 'Context',
            requiresRestart: true,
            default: true,
            description: 'Respect .gitignore files when searching',
            showInDialog: true,
          },
          respectGeminiIgnore: {
            type: 'boolean',
            label: 'Respect .geminiignore',
            category: 'Context',
            requiresRestart: true,
            default: true,
            description: 'Respect .geminiignore files when searching',
            showInDialog: true,
          },
          enableRecursiveFileSearch: {
            type: 'boolean',
            label: 'Enable Recursive File Search',
            category: 'Context',
            requiresRestart: true,
            default: true,
            description: oneLine`
              Enable recursive file search functionality when completing @ references in the prompt.
            `,
            showInDialog: true,
          },
          disableFuzzySearch: {
            type: 'boolean',
            label: 'Disable Fuzzy Search',
            category: 'Context',
            requiresRestart: true,
            default: false,
            description: 'Disable fuzzy search when searching for files.',
            showInDialog: true,
          },
        },
      },
    },
  },

  tools: {
    type: 'object',
    label: 'Tools',
    category: 'Tools',
    requiresRestart: true,
    default: {},
    description: 'Settings for built-in and custom tools.',
    showInDialog: false,
    properties: {
      sandbox: {
        type: 'string',
        label: 'Sandbox',
        category: 'Tools',
        requiresRestart: true,
        default: undefined as boolean | string | undefined,
        ref: 'BooleanOrString',
        description: oneLine`
          Sandbox execution environment.
          Set to a boolean to enable or disable the sandbox, or provide a string path to a sandbox profile.
        `,
        showInDialog: false,
      },
      shell: {
        type: 'object',
        label: 'Shell',
        category: 'Tools',
        requiresRestart: false,
        default: {},
        description: 'Settings for shell execution.',
        showInDialog: false,
        properties: {
          enableInteractiveShell: {
            type: 'boolean',
            label: 'Enable Interactive Shell',
            category: 'Tools',
            requiresRestart: true,
            default: true,
            description: oneLine`
              Use node-pty for an interactive shell experience.
              Fallback to child_process still applies.
            `,
            showInDialog: true,
          },
          pager: {
            type: 'string',
            label: 'Pager',
            category: 'Tools',
            requiresRestart: false,
            default: 'cat' as string | undefined,
            description:
              'The pager command to use for shell output. Defaults to `cat`.',
            showInDialog: false,
          },
          showColor: {
            type: 'boolean',
            label: 'Show Color',
            category: 'Tools',
            requiresRestart: false,
            default: false,
            description: 'Show color in shell output.',
            showInDialog: true,
          },
        },
      },
      autoAccept: {
        type: 'boolean',
        label: 'Auto Accept',
        category: 'Tools',
        requiresRestart: false,
        default: false,
        description: oneLine`
          Automatically accept and execute tool calls that are considered safe (e.g., read-only operations).
        `,
        showInDialog: true,
      },
      core: {
        type: 'array',
        label: 'Core Tools',
        category: 'Tools',
        requiresRestart: true,
        default: undefined as string[] | undefined,
        description: oneLine`
          Restrict the set of built-in tools with an allowlist.
          Match semantics mirror tools.allowed; see the built-in tools documentation for available names.
        `,
        showInDialog: false,
        items: { type: 'string' },
      },
      allowed: {
        type: 'array',
        label: 'Allowed Tools',
        category: 'Advanced',
        requiresRestart: true,
        default: undefined as string[] | undefined,
        description: oneLine`
          Tool names that bypass the confirmation dialog.
          Useful for trusted commands (for example ["run_shell_command(git)", "run_shell_command(npm test)"]).
          See shell tool command restrictions for matching details.
        `,
        showInDialog: false,
        items: { type: 'string' },
      },
      exclude: {
        type: 'array',
        label: 'Exclude Tools',
        category: 'Tools',
        requiresRestart: true,
        default: undefined as string[] | undefined,
        description: 'Tool names to exclude from discovery.',
        showInDialog: false,
        items: { type: 'string' },
        mergeStrategy: MergeStrategy.UNION,
      },
      discoveryCommand: {
        type: 'string',
        label: 'Tool Discovery Command',
        category: 'Tools',
        requiresRestart: true,
        default: undefined as string | undefined,
        description: 'Command to run for tool discovery.',
        showInDialog: false,
      },
      callCommand: {
        type: 'string',
        label: 'Tool Call Command',
        category: 'Tools',
        requiresRestart: true,
        default: undefined as string | undefined,
        description: oneLine`
          Defines a custom shell command for invoking discovered tools.
          The command must take the tool name as the first argument, read JSON arguments from stdin, and emit JSON results on stdout.
        `,
        showInDialog: false,
      },
      useRipgrep: {
        type: 'boolean',
        label: 'Use Ripgrep',
        category: 'Tools',
        requiresRestart: false,
        default: true,
        description:
          'Use ripgrep for file content search instead of the fallback implementation. Provides faster search performance.',
        showInDialog: true,
      },
      enableToolOutputTruncation: {
        type: 'boolean',
        label: 'Enable Tool Output Truncation',
        category: 'General',
        requiresRestart: true,
        default: true,
        description: 'Enable truncation of large tool outputs.',
        showInDialog: true,
      },
      truncateToolOutputThreshold: {
        type: 'number',
        label: 'Tool Output Truncation Threshold',
        category: 'General',
        requiresRestart: true,
        default: DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
        description:
          'Truncate tool output if it is larger than this many characters. Set to -1 to disable.',
        showInDialog: true,
      },
      truncateToolOutputLines: {
        type: 'number',
        label: 'Tool Output Truncation Lines',
        category: 'General',
        requiresRestart: true,
        default: DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES,
        description: 'The number of lines to keep when truncating tool output.',
        showInDialog: true,
      },
      enableMessageBusIntegration: {
        type: 'boolean',
        label: 'Enable Message Bus Integration',
        category: 'Tools',
        requiresRestart: true,
        default: false,
        description: oneLine`
          Enable policy-based tool confirmation via message bus integration.
          When enabled, tools automatically respect policy engine decisions (ALLOW/DENY/ASK_USER) without requiring individual tool implementations.
        `,
        showInDialog: true,
      },
      enableHooks: {
        type: 'boolean',
        label: 'Enable Hooks System',
        category: 'Advanced',
        requiresRestart: true,
        default: false,
        description:
          'Enable the hooks system for intercepting and customizing Gemini CLI behavior. When enabled, hooks configured in settings will execute at appropriate lifecycle events (BeforeTool, AfterTool, BeforeModel, etc.). Requires MessageBus integration.',
        showInDialog: false,
      },
    },
  },

  mcp: {
    type: 'object',
    label: 'MCP',
    category: 'MCP',
    requiresRestart: true,
    default: {},
    description: 'Settings for Model Context Protocol (MCP) servers.',
    showInDialog: false,
    properties: {
      serverCommand: {
        type: 'string',
        label: 'MCP Server Command',
        category: 'MCP',
        requiresRestart: true,
        default: undefined as string | undefined,
        description: 'Command to start an MCP server.',
        showInDialog: false,
      },
      allowed: {
        type: 'array',
        label: 'Allow MCP Servers',
        category: 'MCP',
        requiresRestart: true,
        default: undefined as string[] | undefined,
        description: 'A list of MCP servers to allow.',
        showInDialog: false,
        items: { type: 'string' },
      },
      excluded: {
        type: 'array',
        label: 'Exclude MCP Servers',
        category: 'MCP',
        requiresRestart: true,
        default: undefined as string[] | undefined,
        description: 'A list of MCP servers to exclude.',
        showInDialog: false,
        items: { type: 'string' },
      },
    },
  },
  useSmartEdit: {
    type: 'boolean',
    label: 'Use Smart Edit',
    category: 'Advanced',
    requiresRestart: false,
    default: true,
    description: 'Enable the smart-edit tool instead of the replace tool.',
    showInDialog: false,
  },
  useWriteTodos: {
    type: 'boolean',
    label: 'Use Write Todos',
    category: 'Advanced',
    requiresRestart: false,
    default: false,
    description: 'Enable the write_todos_list tool.',
    showInDialog: false,
  },
  security: {
    type: 'object',
    label: 'Security',
    category: 'Security',
    requiresRestart: true,
    default: {},
    description: 'Security-related settings.',
    showInDialog: false,
    properties: {
      disableYoloMode: {
        type: 'boolean',
        label: 'Disable YOLO Mode',
        category: 'Security',
        requiresRestart: true,
        default: false,
        description: 'Disable YOLO mode, even if enabled by a flag.',
        showInDialog: true,
      },
      folderTrust: {
        type: 'object',
        label: 'Folder Trust',
        category: 'Security',
        requiresRestart: false,
        default: {},
        description: 'Settings for folder trust.',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Folder Trust',
            category: 'Security',
            requiresRestart: true,
            default: false,
            description: 'Setting to track whether Folder trust is enabled.',
            showInDialog: true,
          },
        },
      },
      auth: {
        type: 'object',
        label: 'Authentication',
        category: 'Security',
        requiresRestart: true,
        default: {},
        description: 'Authentication settings.',
        showInDialog: false,
        properties: {
          selectedType: {
            type: 'string',
            label: 'Selected Auth Type',
            category: 'Security',
            requiresRestart: true,
            default: undefined as AuthType | undefined,
            description: 'The currently selected authentication type.',
            showInDialog: false,
          },
          enforcedType: {
            type: 'string',
            label: 'Enforced Auth Type',
            category: 'Advanced',
            requiresRestart: true,
            default: undefined as AuthType | undefined,
            description:
              'The required auth type. If this does not match the selected auth type, the user will be prompted to re-authenticate.',
            showInDialog: false,
          },
          useExternal: {
            type: 'boolean',
            label: 'Use External Auth',
            category: 'Security',
            requiresRestart: true,
            default: undefined as boolean | undefined,
            description: 'Whether to use an external authentication flow.',
            showInDialog: false,
          },
        },
      },
    },
  },

  advanced: {
    type: 'object',
    label: 'Advanced',
    category: 'Advanced',
    requiresRestart: true,
    default: {},
    description: 'Advanced settings for power users.',
    showInDialog: false,
    properties: {
      autoConfigureMemory: {
        type: 'boolean',
        label: 'Auto Configure Max Old Space Size',
        category: 'Advanced',
        requiresRestart: true,
        default: false,
        description: 'Automatically configure Node.js memory limits',
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
      excludedEnvVars: {
        type: 'array',
        label: 'Excluded Project Environment Variables',
        category: 'Advanced',
        requiresRestart: false,
        default: ['DEBUG', 'DEBUG_MODE'] as string[],
        description: 'Environment variables to exclude from project context.',
        showInDialog: false,
        items: { type: 'string' },
        mergeStrategy: MergeStrategy.UNION,
      },
      bugCommand: {
        type: 'object',
        label: 'Bug Command',
        category: 'Advanced',
        requiresRestart: false,
        default: undefined as BugCommandSettings | undefined,
        description: 'Configuration for the bug report command.',
        showInDialog: false,
        ref: 'BugCommandSettings',
      },
    },
  },

  experimental: {
    type: 'object',
    label: 'Experimental',
    category: 'Experimental',
    requiresRestart: true,
    default: {},
    description: 'Setting to enable experimental features',
    showInDialog: false,
    properties: {
      extensionManagement: {
        type: 'boolean',
        label: 'Extension Management',
        category: 'Experimental',
        requiresRestart: true,
        default: true,
        description: 'Enable extension management features.',
        showInDialog: false,
      },
      extensionReloading: {
        type: 'boolean',
        label: 'Extension Reloading',
        category: 'Experimental',
        requiresRestart: true,
        default: false,
        description:
          'Enables extension loading/unloading within the CLI session.',
        showInDialog: false,
      },
      useModelRouter: {
        type: 'boolean',
        label: 'Use Model Router',
        category: 'Experimental',
        requiresRestart: true,
        default: true,
        description:
          'Enable model routing to route requests to the best model based on complexity.',
        showInDialog: true,
      },
      codebaseInvestigatorSettings: {
        type: 'object',
        label: 'Codebase Investigator Settings',
        category: 'Experimental',
        requiresRestart: true,
        default: {},
        description: 'Configuration for Codebase Investigator.',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Enable Codebase Investigator',
            category: 'Experimental',
            requiresRestart: true,
            default: true,
            description: 'Enable the Codebase Investigator agent.',
            showInDialog: true,
          },
          maxNumTurns: {
            type: 'number',
            label: 'Codebase Investigator Max Num Turns',
            category: 'Experimental',
            requiresRestart: true,
            default: 10,
            description:
              'Maximum number of turns for the Codebase Investigator agent.',
            showInDialog: true,
          },
          maxTimeMinutes: {
            type: 'number',
            label: 'Max Time (Minutes)',
            category: 'Experimental',
            requiresRestart: true,
            default: 3,
            description:
              'Maximum time for the Codebase Investigator agent (in minutes).',
            showInDialog: false,
          },
          thinkingBudget: {
            type: 'number',
            label: 'Thinking Budget',
            category: 'Experimental',
            requiresRestart: true,
            default: 8192,
            description:
              'The thinking budget for the Codebase Investigator agent.',
            showInDialog: false,
          },
          model: {
            type: 'string',
            label: 'Model',
            category: 'Experimental',
            requiresRestart: true,
            default: DEFAULT_GEMINI_MODEL,
            description:
              'The model to use for the Codebase Investigator agent.',
            showInDialog: false,
          },
        },
      },
    },
  },

  extensions: {
    type: 'object',
    label: 'Extensions',
    category: 'Extensions',
    requiresRestart: true,
    default: {},
    description: 'Settings for extensions.',
    showInDialog: false,
    properties: {
      disabled: {
        type: 'array',
        label: 'Disabled Extensions',
        category: 'Extensions',
        requiresRestart: true,
        default: [] as string[],
        description: 'List of disabled extensions.',
        showInDialog: false,
        items: { type: 'string' },
        mergeStrategy: MergeStrategy.UNION,
      },
      workspacesWithMigrationNudge: {
        type: 'array',
        label: 'Workspaces with Migration Nudge',
        category: 'Extensions',
        requiresRestart: false,
        default: [] as string[],
        description:
          'List of workspaces for which the migration nudge has been shown.',
        showInDialog: false,
        items: { type: 'string' },
        mergeStrategy: MergeStrategy.UNION,
      },
    },
  },

  hooks: {
    type: 'object',
    label: 'Hooks',
    category: 'Advanced',
    requiresRestart: false,
    default: {} as { [K in HookEventName]?: HookDefinition[] },
    description:
      'Hook configurations for intercepting and customizing agent behavior.',
    showInDialog: false,
    mergeStrategy: MergeStrategy.SHALLOW_MERGE,
  },
} as const satisfies SettingsSchema;

export type SettingsSchemaType = typeof SETTINGS_SCHEMA;

export type SettingsJsonSchemaDefinition = Record<string, unknown>;

export const SETTINGS_SCHEMA_DEFINITIONS: Record<
  string,
  SettingsJsonSchemaDefinition
> = {
  MCPServerConfig: {
    type: 'object',
    description:
      'Definition of a Model Context Protocol (MCP) server configuration.',
    additionalProperties: false,
    properties: {
      command: {
        type: 'string',
        description: 'Executable invoked for stdio transport.',
      },
      args: {
        type: 'array',
        description: 'Command-line arguments for the stdio transport command.',
        items: { type: 'string' },
      },
      env: {
        type: 'object',
        description: 'Environment variables to set for the server process.',
        additionalProperties: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the server process.',
      },
      url: {
        type: 'string',
        description: 'SSE transport URL.',
      },
      httpUrl: {
        type: 'string',
        description: 'Streaming HTTP transport URL.',
      },
      headers: {
        type: 'object',
        description: 'Additional HTTP headers sent to the server.',
        additionalProperties: { type: 'string' },
      },
      tcp: {
        type: 'string',
        description: 'TCP address for websocket transport.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds for MCP requests.',
      },
      trust: {
        type: 'boolean',
        description:
          'Marks the server as trusted. Trusted servers may gain additional capabilities.',
      },
      description: {
        type: 'string',
        description: 'Human-readable description of the server.',
      },
      includeTools: {
        type: 'array',
        description:
          'Subset of tools that should be enabled for this server. When omitted all tools are enabled.',
        items: { type: 'string' },
      },
      excludeTools: {
        type: 'array',
        description:
          'Tools that should be disabled for this server even if exposed.',
        items: { type: 'string' },
      },
      extension: {
        type: 'object',
        description:
          'Metadata describing the Gemini CLI extension that owns this MCP server.',
        additionalProperties: { type: ['string', 'boolean', 'number'] },
      },
      oauth: {
        type: 'object',
        description: 'OAuth configuration for authenticating with the server.',
        additionalProperties: true,
      },
      authProviderType: {
        type: 'string',
        description:
          'Authentication provider used for acquiring credentials (for example `dynamic_discovery`).',
        enum: [
          'dynamic_discovery',
          'google_credentials',
          'service_account_impersonation',
        ],
      },
      targetAudience: {
        type: 'string',
        description:
          'OAuth target audience (CLIENT_ID.apps.googleusercontent.com).',
      },
      targetServiceAccount: {
        type: 'string',
        description:
          'Service account email to impersonate (name@project.iam.gserviceaccount.com).',
      },
    },
  },
  TelemetrySettings: {
    type: 'object',
    description: 'Telemetry configuration for Gemini CLI.',
    additionalProperties: false,
    properties: {
      enabled: {
        type: 'boolean',
        description: 'Enables telemetry emission.',
      },
      target: {
        type: 'string',
        description:
          'Telemetry destination (for example `stderr`, `stdout`, or `otlp`).',
      },
      otlpEndpoint: {
        type: 'string',
        description: 'Endpoint for OTLP exporters.',
      },
      otlpProtocol: {
        type: 'string',
        description: 'Protocol for OTLP exporters.',
        enum: ['grpc', 'http'],
      },
      logPrompts: {
        type: 'boolean',
        description: 'Whether prompts are logged in telemetry payloads.',
      },
      outfile: {
        type: 'string',
        description: 'File path for writing telemetry output.',
      },
      useCollector: {
        type: 'boolean',
        description: 'Whether to forward telemetry to an OTLP collector.',
      },
    },
  },
  BugCommandSettings: {
    type: 'object',
    description: 'Configuration for the bug report helper command.',
    additionalProperties: false,
    properties: {
      urlTemplate: {
        type: 'string',
        description:
          'Template used to open a bug report URL. Variables in the template are populated at runtime.',
      },
    },
    required: ['urlTemplate'],
  },
  SummarizeToolOutputSettings: {
    type: 'object',
    description:
      'Controls summarization behavior for individual tools. All properties are optional.',
    additionalProperties: false,
    properties: {
      tokenBudget: {
        type: 'number',
        description:
          'Maximum number of tokens used when summarizing tool output.',
      },
    },
  },
  CustomTheme: {
    type: 'object',
    description:
      'Custom theme definition used for styling Gemini CLI output. Colors are provided as hex strings or named ANSI colors.',
    additionalProperties: false,
    properties: {
      type: {
        type: 'string',
        enum: ['custom'],
        default: 'custom',
      },
      name: {
        type: 'string',
        description: 'Theme display name.',
      },
      text: {
        type: 'object',
        additionalProperties: false,
        properties: {
          primary: { type: 'string' },
          secondary: { type: 'string' },
          link: { type: 'string' },
          accent: { type: 'string' },
        },
      },
      background: {
        type: 'object',
        additionalProperties: false,
        properties: {
          primary: { type: 'string' },
          diff: {
            type: 'object',
            additionalProperties: false,
            properties: {
              added: { type: 'string' },
              removed: { type: 'string' },
            },
          },
        },
      },
      border: {
        type: 'object',
        additionalProperties: false,
        properties: {
          default: { type: 'string' },
          focused: { type: 'string' },
        },
      },
      ui: {
        type: 'object',
        additionalProperties: false,
        properties: {
          comment: { type: 'string' },
          symbol: { type: 'string' },
          gradient: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      status: {
        type: 'object',
        additionalProperties: false,
        properties: {
          error: { type: 'string' },
          success: { type: 'string' },
          warning: { type: 'string' },
        },
      },
      Background: { type: 'string' },
      Foreground: { type: 'string' },
      LightBlue: { type: 'string' },
      AccentBlue: { type: 'string' },
      AccentPurple: { type: 'string' },
      AccentCyan: { type: 'string' },
      AccentGreen: { type: 'string' },
      AccentYellow: { type: 'string' },
      AccentRed: { type: 'string' },
      DiffAdded: { type: 'string' },
      DiffRemoved: { type: 'string' },
      Comment: { type: 'string' },
      Gray: { type: 'string' },
      DarkGray: { type: 'string' },
      GradientColors: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['type', 'name'],
  },
  StringOrStringArray: {
    description: 'Accepts either a single string or an array of strings.',
    anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  },
  BooleanOrString: {
    description: 'Accepts either a boolean flag or a string command name.',
    anyOf: [{ type: 'boolean' }, { type: 'string' }],
  },
};

export function getSettingsSchema(): SettingsSchemaType {
  return SETTINGS_SCHEMA;
}

type InferSettings<T extends SettingsSchema> = {
  -readonly [K in keyof T]?: T[K] extends { properties: SettingsSchema }
    ? InferSettings<T[K]['properties']>
    : T[K]['type'] extends 'enum'
      ? T[K]['options'] extends readonly SettingEnumOption[]
        ? T[K]['options'][number]['value']
        : T[K]['default']
      : T[K]['default'] extends boolean
        ? boolean
        : T[K]['default'];
};

export type Settings = InferSettings<SettingsSchemaType>;

export interface FooterSettings {
  hideCWD?: boolean;
  hideSandboxStatus?: boolean;
  hideModelInfo?: boolean;
}
