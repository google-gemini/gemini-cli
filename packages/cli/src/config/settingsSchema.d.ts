/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type MCPServerConfig,
  type BugCommandSettings,
  type TelemetrySettings,
  type AuthType,
  type AgentOverride,
  type CustomTheme,
} from '@google/gemini-cli-core';
import type { SessionRetentionSettings } from './settings.js';
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
export declare const TOGGLE_TYPES: ReadonlySet<SettingsType | undefined>;
export interface SettingEnumOption {
  value: string | number;
  label: string;
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
  /**
   * Optional merge strategy for dynamically added properties.
   * Used when this collection definition is referenced via additionalProperties.
   */
  mergeStrategy?: MergeStrategy;
}
export declare enum MergeStrategy {
  REPLACE = 'replace',
  CONCAT = 'concat',
  UNION = 'union',
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
  ignoreInDocs?: boolean;
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
declare const SETTINGS_SCHEMA: {
  readonly mcpServers: {
    readonly type: 'object';
    readonly label: 'MCP Servers';
    readonly category: 'Advanced';
    readonly requiresRestart: true;
    readonly default: Record<string, MCPServerConfig>;
    readonly description: 'Configuration for MCP servers.';
    readonly showInDialog: false;
    readonly mergeStrategy: MergeStrategy.SHALLOW_MERGE;
    readonly additionalProperties: {
      readonly type: 'object';
      readonly ref: 'MCPServerConfig';
    };
  };
  readonly policyPaths: {
    readonly type: 'array';
    readonly label: 'Policy Paths';
    readonly category: 'Advanced';
    readonly requiresRestart: true;
    readonly default: string[];
    readonly description: 'Additional policy files or directories to load.';
    readonly showInDialog: false;
    readonly items: {
      readonly type: 'string';
    };
    readonly mergeStrategy: MergeStrategy.UNION;
  };
  readonly general: {
    readonly type: 'object';
    readonly label: 'General';
    readonly category: 'General';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'General application settings.';
    readonly showInDialog: false;
    readonly properties: {
      readonly preferredEditor: {
        readonly type: 'string';
        readonly label: 'Preferred Editor';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: string | undefined;
        readonly description: 'The preferred editor to open files in.';
        readonly showInDialog: false;
      };
      readonly vimMode: {
        readonly type: 'boolean';
        readonly label: 'Vim Mode';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Enable Vim keybindings';
        readonly showInDialog: true;
      };
      readonly defaultApprovalMode: {
        readonly type: 'enum';
        readonly label: 'Default Approval Mode';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: 'default';
        readonly description: string;
        readonly showInDialog: true;
        readonly options: readonly [
          {
            readonly value: 'default';
            readonly label: 'Default';
          },
          {
            readonly value: 'auto_edit';
            readonly label: 'Auto Edit';
          },
          {
            readonly value: 'plan';
            readonly label: 'Plan';
          },
        ];
      };
      readonly devtools: {
        readonly type: 'boolean';
        readonly label: 'DevTools';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Enable DevTools inspector on launch.';
        readonly showInDialog: false;
      };
      readonly enableAutoUpdate: {
        readonly type: 'boolean';
        readonly label: 'Enable Auto Update';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Enable automatic updates.';
        readonly showInDialog: true;
      };
      readonly enableAutoUpdateNotification: {
        readonly type: 'boolean';
        readonly label: 'Enable Auto Update Notification';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Enable update notification prompts.';
        readonly showInDialog: false;
      };
      readonly enableNotifications: {
        readonly type: 'boolean';
        readonly label: 'Enable Notifications';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Enable run-event notifications for action-required prompts and session completion. Currently macOS only.';
        readonly showInDialog: true;
      };
      readonly checkpointing: {
        readonly type: 'object';
        readonly label: 'Checkpointing';
        readonly category: 'General';
        readonly requiresRestart: true;
        readonly default: {};
        readonly description: 'Session checkpointing settings.';
        readonly showInDialog: false;
        readonly properties: {
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'Enable Checkpointing';
            readonly category: 'General';
            readonly requiresRestart: true;
            readonly default: false;
            readonly description: 'Enable session checkpointing for recovery';
            readonly showInDialog: false;
          };
        };
      };
      readonly plan: {
        readonly type: 'object';
        readonly label: 'Plan';
        readonly category: 'General';
        readonly requiresRestart: true;
        readonly default: {};
        readonly description: 'Planning features configuration.';
        readonly showInDialog: false;
        readonly properties: {
          readonly directory: {
            readonly type: 'string';
            readonly label: 'Plan Directory';
            readonly category: 'General';
            readonly requiresRestart: true;
            readonly default: string | undefined;
            readonly description: 'The directory where planning artifacts are stored. If not specified, defaults to the system temporary directory.';
            readonly showInDialog: true;
          };
        };
      };
      readonly enablePromptCompletion: {
        readonly type: 'boolean';
        readonly label: 'Enable Prompt Completion';
        readonly category: 'General';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Enable AI-powered prompt completion suggestions while typing.';
        readonly showInDialog: true;
      };
      readonly retryFetchErrors: {
        readonly type: 'boolean';
        readonly label: 'Retry Fetch Errors';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Retry on "exception TypeError: fetch failed sending request" errors.';
        readonly showInDialog: false;
      };
      readonly debugKeystrokeLogging: {
        readonly type: 'boolean';
        readonly label: 'Debug Keystroke Logging';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Enable debug logging of keystrokes to the console.';
        readonly showInDialog: true;
      };
      readonly sessionRetention: {
        readonly type: 'object';
        readonly label: 'Session Retention';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: SessionRetentionSettings | undefined;
        readonly showInDialog: false;
        readonly properties: {
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'Enable Session Cleanup';
            readonly category: 'General';
            readonly requiresRestart: false;
            readonly default: false;
            readonly description: 'Enable automatic session cleanup';
            readonly showInDialog: true;
          };
          readonly maxAge: {
            readonly type: 'string';
            readonly label: 'Keep chat history';
            readonly category: 'General';
            readonly requiresRestart: false;
            readonly default: string | undefined;
            readonly description: 'Automatically delete chats older than this time period (e.g., "30d", "7d", "24h", "1w")';
            readonly showInDialog: true;
          };
          readonly maxCount: {
            readonly type: 'number';
            readonly label: 'Max Session Count';
            readonly category: 'General';
            readonly requiresRestart: false;
            readonly default: number | undefined;
            readonly description: 'Alternative: Maximum number of sessions to keep (most recent)';
            readonly showInDialog: false;
          };
          readonly minRetention: {
            readonly type: 'string';
            readonly label: 'Min Retention Period';
            readonly category: 'General';
            readonly requiresRestart: false;
            readonly default: string;
            readonly description: `Minimum retention period (safety limit, defaults to "${string}")`;
            readonly showInDialog: false;
          };
          readonly warningAcknowledged: {
            readonly type: 'boolean';
            readonly label: 'Warning Acknowledged';
            readonly category: 'General';
            readonly requiresRestart: false;
            readonly default: false;
            readonly showInDialog: false;
            readonly description: 'INTERNAL: Whether the user has acknowledged the session retention warning';
          };
        };
        readonly description: 'Settings for automatic session cleanup.';
      };
    };
  };
  readonly output: {
    readonly type: 'object';
    readonly label: 'Output';
    readonly category: 'General';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'Settings for the CLI output.';
    readonly showInDialog: false;
    readonly properties: {
      readonly format: {
        readonly type: 'enum';
        readonly label: 'Output Format';
        readonly category: 'General';
        readonly requiresRestart: false;
        readonly default: 'text';
        readonly description: 'The format of the CLI output. Can be `text` or `json`.';
        readonly showInDialog: true;
        readonly options: readonly [
          {
            readonly value: 'text';
            readonly label: 'Text';
          },
          {
            readonly value: 'json';
            readonly label: 'JSON';
          },
        ];
      };
    };
  };
  readonly ui: {
    readonly type: 'object';
    readonly label: 'UI';
    readonly category: 'UI';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'User interface settings.';
    readonly showInDialog: false;
    readonly properties: {
      readonly theme: {
        readonly type: 'string';
        readonly label: 'Theme';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: string | undefined;
        readonly description: 'The color theme for the UI. See the CLI themes guide for available options.';
        readonly showInDialog: false;
      };
      readonly autoThemeSwitching: {
        readonly type: 'boolean';
        readonly label: 'Auto Theme Switching';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Automatically switch between default light and dark themes based on terminal background color.';
        readonly showInDialog: true;
      };
      readonly terminalBackgroundPollingInterval: {
        readonly type: 'number';
        readonly label: 'Terminal Background Polling Interval';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: 60;
        readonly description: 'Interval in seconds to poll the terminal background color.';
        readonly showInDialog: true;
      };
      readonly customThemes: {
        readonly type: 'object';
        readonly label: 'Custom Themes';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: Record<string, CustomTheme>;
        readonly description: 'Custom theme definitions.';
        readonly showInDialog: false;
        readonly additionalProperties: {
          readonly type: 'object';
          readonly ref: 'CustomTheme';
        };
      };
      readonly hideWindowTitle: {
        readonly type: 'boolean';
        readonly label: 'Hide Window Title';
        readonly category: 'UI';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Hide the window title bar';
        readonly showInDialog: true;
      };
      readonly inlineThinkingMode: {
        readonly type: 'enum';
        readonly label: 'Inline Thinking';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: 'off';
        readonly description: 'Display model thinking inline: off or full.';
        readonly showInDialog: true;
        readonly options: readonly [
          {
            readonly value: 'off';
            readonly label: 'Off';
          },
          {
            readonly value: 'full';
            readonly label: 'Full';
          },
        ];
      };
      readonly showStatusInTitle: {
        readonly type: 'boolean';
        readonly label: 'Show Thoughts in Title';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Show Gemini CLI model thoughts in the terminal window title during the working phase';
        readonly showInDialog: true;
      };
      readonly dynamicWindowTitle: {
        readonly type: 'boolean';
        readonly label: 'Dynamic Window Title';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Update the terminal window title with current status icons (Ready: ◇, Action Required: ✋, Working: ✦)';
        readonly showInDialog: true;
      };
      readonly showHomeDirectoryWarning: {
        readonly type: 'boolean';
        readonly label: 'Show Home Directory Warning';
        readonly category: 'UI';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Show a warning when running Gemini CLI in the home directory.';
        readonly showInDialog: true;
      };
      readonly showCompatibilityWarnings: {
        readonly type: 'boolean';
        readonly label: 'Show Compatibility Warnings';
        readonly category: 'UI';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Show warnings about terminal or OS compatibility issues.';
        readonly showInDialog: true;
      };
      readonly hideTips: {
        readonly type: 'boolean';
        readonly label: 'Hide Tips';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Hide helpful tips in the UI';
        readonly showInDialog: true;
      };
      readonly showShortcutsHint: {
        readonly type: 'boolean';
        readonly label: 'Show Shortcuts Hint';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Show the "? for shortcuts" hint above the input.';
        readonly showInDialog: true;
      };
      readonly hideBanner: {
        readonly type: 'boolean';
        readonly label: 'Hide Banner';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Hide the application banner';
        readonly showInDialog: true;
      };
      readonly hideContextSummary: {
        readonly type: 'boolean';
        readonly label: 'Hide Context Summary';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Hide the context summary (GEMINI.md, MCP servers) above the input.';
        readonly showInDialog: true;
      };
      readonly footer: {
        readonly type: 'object';
        readonly label: 'Footer';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'Settings for the footer.';
        readonly showInDialog: false;
        readonly properties: {
          readonly hideCWD: {
            readonly type: 'boolean';
            readonly label: 'Hide CWD';
            readonly category: 'UI';
            readonly requiresRestart: false;
            readonly default: false;
            readonly description: 'Hide the current working directory path in the footer.';
            readonly showInDialog: true;
          };
          readonly hideSandboxStatus: {
            readonly type: 'boolean';
            readonly label: 'Hide Sandbox Status';
            readonly category: 'UI';
            readonly requiresRestart: false;
            readonly default: false;
            readonly description: 'Hide the sandbox status indicator in the footer.';
            readonly showInDialog: true;
          };
          readonly hideModelInfo: {
            readonly type: 'boolean';
            readonly label: 'Hide Model Info';
            readonly category: 'UI';
            readonly requiresRestart: false;
            readonly default: false;
            readonly description: 'Hide the model name and context usage in the footer.';
            readonly showInDialog: true;
          };
          readonly hideContextPercentage: {
            readonly type: 'boolean';
            readonly label: 'Hide Context Window Percentage';
            readonly category: 'UI';
            readonly requiresRestart: false;
            readonly default: true;
            readonly description: 'Hides the context window remaining percentage.';
            readonly showInDialog: true;
          };
        };
      };
      readonly hideFooter: {
        readonly type: 'boolean';
        readonly label: 'Hide Footer';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Hide the footer from the UI';
        readonly showInDialog: true;
      };
      readonly showMemoryUsage: {
        readonly type: 'boolean';
        readonly label: 'Show Memory Usage';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Display memory usage information in the UI';
        readonly showInDialog: true;
      };
      readonly showLineNumbers: {
        readonly type: 'boolean';
        readonly label: 'Show Line Numbers';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Show line numbers in the chat.';
        readonly showInDialog: true;
      };
      readonly showCitations: {
        readonly type: 'boolean';
        readonly label: 'Show Citations';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Show citations for generated text in the chat.';
        readonly showInDialog: true;
      };
      readonly showModelInfoInChat: {
        readonly type: 'boolean';
        readonly label: 'Show Model Info In Chat';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Show the model name in the chat for each model turn.';
        readonly showInDialog: true;
      };
      readonly showUserIdentity: {
        readonly type: 'boolean';
        readonly label: 'Show User Identity';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: "Show the logged-in user's identity (e.g. email) in the UI.";
        readonly showInDialog: true;
      };
      readonly useAlternateBuffer: {
        readonly type: 'boolean';
        readonly label: 'Use Alternate Screen Buffer';
        readonly category: 'UI';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Use an alternate screen buffer for the UI, preserving shell history.';
        readonly showInDialog: true;
      };
      readonly useBackgroundColor: {
        readonly type: 'boolean';
        readonly label: 'Use Background Color';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Whether to use background colors in the UI.';
        readonly showInDialog: true;
      };
      readonly incrementalRendering: {
        readonly type: 'boolean';
        readonly label: 'Incremental Rendering';
        readonly category: 'UI';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Enable incremental rendering for the UI. This option will reduce flickering but may cause rendering artifacts. Only supported when useAlternateBuffer is enabled.';
        readonly showInDialog: true;
      };
      readonly showSpinner: {
        readonly type: 'boolean';
        readonly label: 'Show Spinner';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Show the spinner during operations.';
        readonly showInDialog: true;
      };
      readonly loadingPhrases: {
        readonly type: 'enum';
        readonly label: 'Loading Phrases';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: 'tips';
        readonly description: 'What to show while the model is working: tips, witty comments, both, or nothing.';
        readonly showInDialog: true;
        readonly options: readonly [
          {
            readonly value: 'tips';
            readonly label: 'Tips';
          },
          {
            readonly value: 'witty';
            readonly label: 'Witty';
          },
          {
            readonly value: 'all';
            readonly label: 'All';
          },
          {
            readonly value: 'off';
            readonly label: 'Off';
          },
        ];
      };
      readonly customWittyPhrases: {
        readonly type: 'array';
        readonly label: 'Custom Witty Phrases';
        readonly category: 'UI';
        readonly requiresRestart: false;
        readonly default: string[];
        readonly description: string;
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
      };
      readonly accessibility: {
        readonly type: 'object';
        readonly label: 'Accessibility';
        readonly category: 'UI';
        readonly requiresRestart: true;
        readonly default: {};
        readonly description: 'Accessibility settings.';
        readonly showInDialog: false;
        readonly properties: {
          readonly enableLoadingPhrases: {
            readonly type: 'boolean';
            readonly label: 'Enable Loading Phrases';
            readonly category: 'UI';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: '@deprecated Use ui.loadingPhrases instead. Enable loading phrases during operations.';
            readonly showInDialog: false;
          };
          readonly screenReader: {
            readonly type: 'boolean';
            readonly label: 'Screen Reader Mode';
            readonly category: 'UI';
            readonly requiresRestart: true;
            readonly default: false;
            readonly description: 'Render output in plain-text to be more screen reader accessible';
            readonly showInDialog: true;
          };
        };
      };
    };
  };
  readonly ide: {
    readonly type: 'object';
    readonly label: 'IDE';
    readonly category: 'IDE';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'IDE integration settings.';
    readonly showInDialog: false;
    readonly properties: {
      readonly enabled: {
        readonly type: 'boolean';
        readonly label: 'IDE Mode';
        readonly category: 'IDE';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Enable IDE integration mode.';
        readonly showInDialog: true;
      };
      readonly hasSeenNudge: {
        readonly type: 'boolean';
        readonly label: 'Has Seen IDE Integration Nudge';
        readonly category: 'IDE';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Whether the user has seen the IDE integration nudge.';
        readonly showInDialog: false;
      };
    };
  };
  readonly privacy: {
    readonly type: 'object';
    readonly label: 'Privacy';
    readonly category: 'Privacy';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Privacy-related settings.';
    readonly showInDialog: false;
    readonly properties: {
      readonly usageStatisticsEnabled: {
        readonly type: 'boolean';
        readonly label: 'Enable Usage Statistics';
        readonly category: 'Privacy';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Enable collection of usage statistics';
        readonly showInDialog: false;
      };
    };
  };
  readonly telemetry: {
    readonly type: 'object';
    readonly label: 'Telemetry';
    readonly category: 'Advanced';
    readonly requiresRestart: true;
    readonly default: TelemetrySettings | undefined;
    readonly description: 'Telemetry configuration.';
    readonly showInDialog: false;
    readonly ref: 'TelemetrySettings';
  };
  readonly model: {
    readonly type: 'object';
    readonly label: 'Model';
    readonly category: 'Model';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'Settings related to the generative model.';
    readonly showInDialog: false;
    readonly properties: {
      readonly name: {
        readonly type: 'string';
        readonly label: 'Model';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default: string | undefined;
        readonly description: 'The Gemini model to use for conversations.';
        readonly showInDialog: false;
      };
      readonly maxSessionTurns: {
        readonly type: 'number';
        readonly label: 'Max Session Turns';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default: -1;
        readonly description: 'Maximum number of user/model/tool turns to keep in a session. -1 means unlimited.';
        readonly showInDialog: true;
      };
      readonly summarizeToolOutput: {
        readonly type: 'object';
        readonly label: 'Summarize Tool Output';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default:
          | Record<
              string,
              {
                tokenBudget?: number;
              }
            >
          | undefined;
        readonly description: string;
        readonly showInDialog: false;
        readonly additionalProperties: {
          readonly type: 'object';
          readonly description: 'Per-tool summarization settings with an optional tokenBudget.';
          readonly ref: 'SummarizeToolOutputSettings';
        };
      };
      readonly compressionThreshold: {
        readonly type: 'number';
        readonly label: 'Compression Threshold';
        readonly category: 'Model';
        readonly requiresRestart: true;
        readonly default: number;
        readonly description: 'The fraction of context usage at which to trigger context compression (e.g. 0.2, 0.3).';
        readonly showInDialog: true;
      };
      readonly disableLoopDetection: {
        readonly type: 'boolean';
        readonly label: 'Disable Loop Detection';
        readonly category: 'Model';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Disable automatic detection and prevention of infinite loops.';
        readonly showInDialog: true;
      };
      readonly skipNextSpeakerCheck: {
        readonly type: 'boolean';
        readonly label: 'Skip Next Speaker Check';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Skip the next speaker check.';
        readonly showInDialog: true;
      };
    };
  };
  readonly modelConfigs: {
    readonly type: 'object';
    readonly label: 'Model Configs';
    readonly category: 'Model';
    readonly requiresRestart: false;
    readonly default: import('@google/gemini-cli-core/dist/src/services/modelConfigService.js').ModelConfigServiceConfig;
    readonly description: 'Model configurations.';
    readonly showInDialog: false;
    readonly properties: {
      readonly aliases: {
        readonly type: 'object';
        readonly label: 'Model Config Aliases';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default: Record<
          string,
          import('@google/gemini-cli-core/dist/src/services/modelConfigService.js').ModelConfigAlias
        >;
        readonly description: 'Named presets for model configs. Can be used in place of a model name and can inherit from other aliases using an `extends` property.';
        readonly showInDialog: false;
      };
      readonly customAliases: {
        readonly type: 'object';
        readonly label: 'Custom Model Config Aliases';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'Custom named presets for model configs. These are merged with (and override) the built-in aliases.';
        readonly showInDialog: false;
      };
      readonly customOverrides: {
        readonly type: 'array';
        readonly label: 'Custom Model Config Overrides';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Custom model config overrides. These are merged with (and added to) the built-in overrides.';
        readonly showInDialog: false;
      };
      readonly overrides: {
        readonly type: 'array';
        readonly label: 'Model Config Overrides';
        readonly category: 'Model';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Apply specific configuration overrides based on matches, with a primary key of model (or alias). The most specific match will be used.';
        readonly showInDialog: false;
      };
    };
  };
  readonly agents: {
    readonly type: 'object';
    readonly label: 'Agents';
    readonly category: 'Advanced';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Settings for subagents.';
    readonly showInDialog: false;
    readonly properties: {
      readonly overrides: {
        readonly type: 'object';
        readonly label: 'Agent Overrides';
        readonly category: 'Advanced';
        readonly requiresRestart: true;
        readonly default: Record<string, AgentOverride>;
        readonly description: 'Override settings for specific agents, e.g. to disable the agent, set a custom model config, or run config.';
        readonly showInDialog: false;
        readonly additionalProperties: {
          readonly type: 'object';
          readonly ref: 'AgentOverride';
        };
      };
    };
  };
  readonly context: {
    readonly type: 'object';
    readonly label: 'Context';
    readonly category: 'Context';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'Settings for managing context provided to the model.';
    readonly showInDialog: false;
    readonly properties: {
      readonly fileName: {
        readonly type: 'string';
        readonly label: 'Context File Name';
        readonly category: 'Context';
        readonly requiresRestart: false;
        readonly default: string | string[] | undefined;
        readonly ref: 'StringOrStringArray';
        readonly description: 'The name of the context file or files to load into memory. Accepts either a single string or an array of strings.';
        readonly showInDialog: false;
      };
      readonly importFormat: {
        readonly type: 'string';
        readonly label: 'Memory Import Format';
        readonly category: 'Context';
        readonly requiresRestart: false;
        readonly default: MemoryImportFormat | undefined;
        readonly description: 'The format to use when importing memory.';
        readonly showInDialog: false;
      };
      readonly includeDirectoryTree: {
        readonly type: 'boolean';
        readonly label: 'Include Directory Tree';
        readonly category: 'Context';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Whether to include the directory tree of the current working directory in the initial request to the model.';
        readonly showInDialog: false;
      };
      readonly discoveryMaxDirs: {
        readonly type: 'number';
        readonly label: 'Memory Discovery Max Dirs';
        readonly category: 'Context';
        readonly requiresRestart: false;
        readonly default: 200;
        readonly description: 'Maximum number of directories to search for memory.';
        readonly showInDialog: true;
      };
      readonly includeDirectories: {
        readonly type: 'array';
        readonly label: 'Include Directories';
        readonly category: 'Context';
        readonly requiresRestart: false;
        readonly default: string[];
        readonly description: string;
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly loadMemoryFromIncludeDirectories: {
        readonly type: 'boolean';
        readonly label: 'Load Memory From Include Directories';
        readonly category: 'Context';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: string;
        readonly showInDialog: true;
      };
      readonly fileFiltering: {
        readonly type: 'object';
        readonly label: 'File Filtering';
        readonly category: 'Context';
        readonly requiresRestart: true;
        readonly default: {};
        readonly description: 'Settings for git-aware file filtering.';
        readonly showInDialog: false;
        readonly properties: {
          readonly respectGitIgnore: {
            readonly type: 'boolean';
            readonly label: 'Respect .gitignore';
            readonly category: 'Context';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: 'Respect .gitignore files when searching.';
            readonly showInDialog: true;
          };
          readonly respectGeminiIgnore: {
            readonly type: 'boolean';
            readonly label: 'Respect .geminiignore';
            readonly category: 'Context';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: 'Respect .geminiignore files when searching.';
            readonly showInDialog: true;
          };
          readonly enableRecursiveFileSearch: {
            readonly type: 'boolean';
            readonly label: 'Enable Recursive File Search';
            readonly category: 'Context';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: string;
            readonly showInDialog: true;
          };
          readonly enableFuzzySearch: {
            readonly type: 'boolean';
            readonly label: 'Enable Fuzzy Search';
            readonly category: 'Context';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: 'Enable fuzzy search when searching for files.';
            readonly showInDialog: true;
          };
          readonly customIgnoreFilePaths: {
            readonly type: 'array';
            readonly label: 'Custom Ignore File Paths';
            readonly category: 'Context';
            readonly requiresRestart: true;
            readonly default: string[];
            readonly description: 'Additional ignore file paths to respect. These files take precedence over .geminiignore and .gitignore. Files earlier in the array take precedence over files later in the array, e.g. the first file takes precedence over the second one.';
            readonly showInDialog: true;
            readonly items: {
              readonly type: 'string';
            };
            readonly mergeStrategy: MergeStrategy.UNION;
          };
        };
      };
    };
  };
  readonly tools: {
    readonly type: 'object';
    readonly label: 'Tools';
    readonly category: 'Tools';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Settings for built-in and custom tools.';
    readonly showInDialog: false;
    readonly properties: {
      readonly sandbox: {
        readonly type: 'string';
        readonly label: 'Sandbox';
        readonly category: 'Tools';
        readonly requiresRestart: true;
        readonly default: boolean | string | undefined;
        readonly ref: 'BooleanOrString';
        readonly description: string;
        readonly showInDialog: false;
      };
      readonly shell: {
        readonly type: 'object';
        readonly label: 'Shell';
        readonly category: 'Tools';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'Settings for shell execution.';
        readonly showInDialog: false;
        readonly properties: {
          readonly enableInteractiveShell: {
            readonly type: 'boolean';
            readonly label: 'Enable Interactive Shell';
            readonly category: 'Tools';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: string;
            readonly showInDialog: true;
          };
          readonly pager: {
            readonly type: 'string';
            readonly label: 'Pager';
            readonly category: 'Tools';
            readonly requiresRestart: false;
            readonly default: string | undefined;
            readonly description: 'The pager command to use for shell output. Defaults to `cat`.';
            readonly showInDialog: false;
          };
          readonly showColor: {
            readonly type: 'boolean';
            readonly label: 'Show Color';
            readonly category: 'Tools';
            readonly requiresRestart: false;
            readonly default: false;
            readonly description: 'Show color in shell output.';
            readonly showInDialog: true;
          };
          readonly inactivityTimeout: {
            readonly type: 'number';
            readonly label: 'Inactivity Timeout';
            readonly category: 'Tools';
            readonly requiresRestart: false;
            readonly default: 300;
            readonly description: 'The maximum time in seconds allowed without output from the shell command. Defaults to 5 minutes.';
            readonly showInDialog: false;
          };
          readonly enableShellOutputEfficiency: {
            readonly type: 'boolean';
            readonly label: 'Enable Shell Output Efficiency';
            readonly category: 'Tools';
            readonly requiresRestart: false;
            readonly default: true;
            readonly description: 'Enable shell output efficiency optimizations for better performance.';
            readonly showInDialog: false;
          };
        };
      };
      readonly core: {
        readonly type: 'array';
        readonly label: 'Core Tools';
        readonly category: 'Tools';
        readonly requiresRestart: true;
        readonly default: string[] | undefined;
        readonly description: string;
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
      };
      readonly allowed: {
        readonly type: 'array';
        readonly label: 'Allowed Tools';
        readonly category: 'Advanced';
        readonly requiresRestart: true;
        readonly default: string[] | undefined;
        readonly description: string;
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
      };
      readonly exclude: {
        readonly type: 'array';
        readonly label: 'Exclude Tools';
        readonly category: 'Tools';
        readonly requiresRestart: true;
        readonly default: string[] | undefined;
        readonly description: 'Tool names to exclude from discovery.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
        readonly mergeStrategy: MergeStrategy.UNION;
      };
      readonly discoveryCommand: {
        readonly type: 'string';
        readonly label: 'Tool Discovery Command';
        readonly category: 'Tools';
        readonly requiresRestart: true;
        readonly default: string | undefined;
        readonly description: 'Command to run for tool discovery.';
        readonly showInDialog: false;
      };
      readonly callCommand: {
        readonly type: 'string';
        readonly label: 'Tool Call Command';
        readonly category: 'Tools';
        readonly requiresRestart: true;
        readonly default: string | undefined;
        readonly description: string;
        readonly showInDialog: false;
      };
      readonly useRipgrep: {
        readonly type: 'boolean';
        readonly label: 'Use Ripgrep';
        readonly category: 'Tools';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Use ripgrep for file content search instead of the fallback implementation. Provides faster search performance.';
        readonly showInDialog: true;
      };
      readonly truncateToolOutputThreshold: {
        readonly type: 'number';
        readonly label: 'Tool Output Truncation Threshold';
        readonly category: 'General';
        readonly requiresRestart: true;
        readonly default: 40000;
        readonly description: 'Maximum characters to show when truncating large tool outputs. Set to 0 or negative to disable truncation.';
        readonly showInDialog: true;
      };
      readonly disableLLMCorrection: {
        readonly type: 'boolean';
        readonly label: 'Disable LLM Correction';
        readonly category: 'Tools';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: string;
        readonly showInDialog: true;
      };
    };
  };
  readonly mcp: {
    readonly type: 'object';
    readonly label: 'MCP';
    readonly category: 'MCP';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Settings for Model Context Protocol (MCP) servers.';
    readonly showInDialog: false;
    readonly properties: {
      readonly serverCommand: {
        readonly type: 'string';
        readonly label: 'MCP Server Command';
        readonly category: 'MCP';
        readonly requiresRestart: true;
        readonly default: string | undefined;
        readonly description: 'Command to start an MCP server.';
        readonly showInDialog: false;
      };
      readonly allowed: {
        readonly type: 'array';
        readonly label: 'Allow MCP Servers';
        readonly category: 'MCP';
        readonly requiresRestart: true;
        readonly default: string[] | undefined;
        readonly description: 'A list of MCP servers to allow.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
      };
      readonly excluded: {
        readonly type: 'array';
        readonly label: 'Exclude MCP Servers';
        readonly category: 'MCP';
        readonly requiresRestart: true;
        readonly default: string[] | undefined;
        readonly description: 'A list of MCP servers to exclude.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
      };
    };
  };
  readonly useWriteTodos: {
    readonly type: 'boolean';
    readonly label: 'Use WriteTodos';
    readonly category: 'Advanced';
    readonly requiresRestart: false;
    readonly default: true;
    readonly description: 'Enable the write_todos tool.';
    readonly showInDialog: false;
  };
  readonly security: {
    readonly type: 'object';
    readonly label: 'Security';
    readonly category: 'Security';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Security-related settings.';
    readonly showInDialog: false;
    readonly properties: {
      readonly disableYoloMode: {
        readonly type: 'boolean';
        readonly label: 'Disable YOLO Mode';
        readonly category: 'Security';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Disable YOLO mode, even if enabled by a flag.';
        readonly showInDialog: true;
      };
      readonly enablePermanentToolApproval: {
        readonly type: 'boolean';
        readonly label: 'Allow Permanent Tool Approval';
        readonly category: 'Security';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Enable the "Allow for all future sessions" option in tool confirmation dialogs.';
        readonly showInDialog: true;
      };
      readonly blockGitExtensions: {
        readonly type: 'boolean';
        readonly label: 'Blocks extensions from Git';
        readonly category: 'Security';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Blocks installing and loading extensions from Git.';
        readonly showInDialog: true;
      };
      readonly allowedExtensions: {
        readonly type: 'array';
        readonly label: 'Extension Source Regex Allowlist';
        readonly category: 'Security';
        readonly requiresRestart: true;
        readonly default: string[];
        readonly description: 'List of Regex patterns for allowed extensions. If nonempty, only extensions that match the patterns in this list are allowed. Overrides the blockGitExtensions setting.';
        readonly showInDialog: true;
        readonly items: {
          readonly type: 'string';
        };
      };
      readonly folderTrust: {
        readonly type: 'object';
        readonly label: 'Folder Trust';
        readonly category: 'Security';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'Settings for folder trust.';
        readonly showInDialog: false;
        readonly properties: {
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'Folder Trust';
            readonly category: 'Security';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: 'Setting to track whether Folder trust is enabled.';
            readonly showInDialog: true;
          };
        };
      };
      readonly environmentVariableRedaction: {
        readonly type: 'object';
        readonly label: 'Environment Variable Redaction';
        readonly category: 'Security';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'Settings for environment variable redaction.';
        readonly showInDialog: false;
        readonly properties: {
          readonly allowed: {
            readonly type: 'array';
            readonly label: 'Allowed Environment Variables';
            readonly category: 'Security';
            readonly requiresRestart: true;
            readonly default: string[];
            readonly description: 'Environment variables to always allow (bypass redaction).';
            readonly showInDialog: false;
            readonly items: {
              readonly type: 'string';
            };
          };
          readonly blocked: {
            readonly type: 'array';
            readonly label: 'Blocked Environment Variables';
            readonly category: 'Security';
            readonly requiresRestart: true;
            readonly default: string[];
            readonly description: 'Environment variables to always redact.';
            readonly showInDialog: false;
            readonly items: {
              readonly type: 'string';
            };
          };
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'Enable Environment Variable Redaction';
            readonly category: 'Security';
            readonly requiresRestart: true;
            readonly default: false;
            readonly description: 'Enable redaction of environment variables that may contain secrets.';
            readonly showInDialog: true;
          };
        };
      };
      readonly auth: {
        readonly type: 'object';
        readonly label: 'Authentication';
        readonly category: 'Security';
        readonly requiresRestart: true;
        readonly default: {};
        readonly description: 'Authentication settings.';
        readonly showInDialog: false;
        readonly properties: {
          readonly selectedType: {
            readonly type: 'string';
            readonly label: 'Selected Auth Type';
            readonly category: 'Security';
            readonly requiresRestart: true;
            readonly default: AuthType | undefined;
            readonly description: 'The currently selected authentication type.';
            readonly showInDialog: false;
          };
          readonly enforcedType: {
            readonly type: 'string';
            readonly label: 'Enforced Auth Type';
            readonly category: 'Advanced';
            readonly requiresRestart: true;
            readonly default: AuthType | undefined;
            readonly description: 'The required auth type. If this does not match the selected auth type, the user will be prompted to re-authenticate.';
            readonly showInDialog: false;
          };
          readonly useExternal: {
            readonly type: 'boolean';
            readonly label: 'Use External Auth';
            readonly category: 'Security';
            readonly requiresRestart: true;
            readonly default: boolean | undefined;
            readonly description: 'Whether to use an external authentication flow.';
            readonly showInDialog: false;
          };
        };
      };
    };
  };
  readonly advanced: {
    readonly type: 'object';
    readonly label: 'Advanced';
    readonly category: 'Advanced';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Advanced settings for power users.';
    readonly showInDialog: false;
    readonly properties: {
      readonly autoConfigureMemory: {
        readonly type: 'boolean';
        readonly label: 'Auto Configure Max Old Space Size';
        readonly category: 'Advanced';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Automatically configure Node.js memory limits';
        readonly showInDialog: true;
      };
      readonly dnsResolutionOrder: {
        readonly type: 'string';
        readonly label: 'DNS Resolution Order';
        readonly category: 'Advanced';
        readonly requiresRestart: true;
        readonly default: DnsResolutionOrder | undefined;
        readonly description: 'The DNS resolution order.';
        readonly showInDialog: false;
      };
      readonly excludedEnvVars: {
        readonly type: 'array';
        readonly label: 'Excluded Project Environment Variables';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: string[];
        readonly description: 'Environment variables to exclude from project context.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
        readonly mergeStrategy: MergeStrategy.UNION;
      };
      readonly bugCommand: {
        readonly type: 'object';
        readonly label: 'Bug Command';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: BugCommandSettings | undefined;
        readonly description: 'Configuration for the bug report command.';
        readonly showInDialog: false;
        readonly ref: 'BugCommandSettings';
      };
    };
  };
  readonly experimental: {
    readonly type: 'object';
    readonly label: 'Experimental';
    readonly category: 'Experimental';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Setting to enable experimental features';
    readonly showInDialog: false;
    readonly properties: {
      readonly toolOutputMasking: {
        readonly type: 'object';
        readonly label: 'Tool Output Masking';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly ignoreInDocs: false;
        readonly default: {};
        readonly description: 'Advanced settings for tool output masking to manage context window efficiency.';
        readonly showInDialog: false;
        readonly properties: {
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'Enable Tool Output Masking';
            readonly category: 'Experimental';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: 'Enables tool output masking to save tokens.';
            readonly showInDialog: true;
          };
          readonly toolProtectionThreshold: {
            readonly type: 'number';
            readonly label: 'Tool Protection Threshold';
            readonly category: 'Experimental';
            readonly requiresRestart: true;
            readonly default: 50000;
            readonly description: 'Minimum number of tokens to protect from masking (most recent tool outputs).';
            readonly showInDialog: false;
          };
          readonly minPrunableTokensThreshold: {
            readonly type: 'number';
            readonly label: 'Min Prunable Tokens Threshold';
            readonly category: 'Experimental';
            readonly requiresRestart: true;
            readonly default: 30000;
            readonly description: 'Minimum prunable tokens required to trigger a masking pass.';
            readonly showInDialog: false;
          };
          readonly protectLatestTurn: {
            readonly type: 'boolean';
            readonly label: 'Protect Latest Turn';
            readonly category: 'Experimental';
            readonly requiresRestart: true;
            readonly default: true;
            readonly description: 'Ensures the absolute latest turn is never masked, regardless of token count.';
            readonly showInDialog: false;
          };
        };
      };
      readonly enableAgents: {
        readonly type: 'boolean';
        readonly label: 'Enable Agents';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Enable local and remote subagents. Warning: Experimental feature, uses YOLO mode for subagents';
        readonly showInDialog: false;
      };
      readonly extensionManagement: {
        readonly type: 'boolean';
        readonly label: 'Extension Management';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Enable extension management features.';
        readonly showInDialog: false;
      };
      readonly extensionConfig: {
        readonly type: 'boolean';
        readonly label: 'Extension Configuration';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Enable requesting and fetching of extension settings.';
        readonly showInDialog: false;
      };
      readonly extensionRegistry: {
        readonly type: 'boolean';
        readonly label: 'Extension Registry Explore UI';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Enable extension registry explore UI.';
        readonly showInDialog: false;
      };
      readonly extensionReloading: {
        readonly type: 'boolean';
        readonly label: 'Extension Reloading';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Enables extension loading/unloading within the CLI session.';
        readonly showInDialog: false;
      };
      readonly jitContext: {
        readonly type: 'boolean';
        readonly label: 'JIT Context Loading';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Enable Just-In-Time (JIT) context loading.';
        readonly showInDialog: false;
      };
      readonly useOSC52Paste: {
        readonly type: 'boolean';
        readonly label: 'Use OSC 52 Paste';
        readonly category: 'Experimental';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Use OSC 52 for pasting. This may be more robust than the default system when using remote terminal sessions (if your terminal is configured to allow it).';
        readonly showInDialog: true;
      };
      readonly useOSC52Copy: {
        readonly type: 'boolean';
        readonly label: 'Use OSC 52 Copy';
        readonly category: 'Experimental';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Use OSC 52 for copying. This may be more robust than the default system when using remote terminal sessions (if your terminal is configured to allow it).';
        readonly showInDialog: true;
      };
      readonly plan: {
        readonly type: 'boolean';
        readonly label: 'Plan';
        readonly category: 'Experimental';
        readonly requiresRestart: true;
        readonly default: false;
        readonly description: 'Enable planning features (Plan Mode and tools).';
        readonly showInDialog: true;
      };
      readonly modelSteering: {
        readonly type: 'boolean';
        readonly label: 'Model Steering';
        readonly category: 'Experimental';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'Enable model steering (user hints) to guide the model during tool execution.';
        readonly showInDialog: true;
      };
    };
  };
  readonly extensions: {
    readonly type: 'object';
    readonly label: 'Extensions';
    readonly category: 'Extensions';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Settings for extensions.';
    readonly showInDialog: false;
    readonly properties: {
      readonly disabled: {
        readonly type: 'array';
        readonly label: 'Disabled Extensions';
        readonly category: 'Extensions';
        readonly requiresRestart: true;
        readonly default: string[];
        readonly description: 'List of disabled extensions.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
        readonly mergeStrategy: MergeStrategy.UNION;
      };
      readonly workspacesWithMigrationNudge: {
        readonly type: 'array';
        readonly label: 'Workspaces with Migration Nudge';
        readonly category: 'Extensions';
        readonly requiresRestart: false;
        readonly default: string[];
        readonly description: 'List of workspaces for which the migration nudge has been shown.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
        readonly mergeStrategy: MergeStrategy.UNION;
      };
    };
  };
  readonly skills: {
    readonly type: 'object';
    readonly label: 'Skills';
    readonly category: 'Advanced';
    readonly requiresRestart: true;
    readonly default: {};
    readonly description: 'Settings for agent skills.';
    readonly showInDialog: false;
    readonly properties: {
      readonly enabled: {
        readonly type: 'boolean';
        readonly label: 'Enable Agent Skills';
        readonly category: 'Advanced';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Enable Agent Skills.';
        readonly showInDialog: true;
      };
      readonly disabled: {
        readonly type: 'array';
        readonly label: 'Disabled Skills';
        readonly category: 'Advanced';
        readonly requiresRestart: true;
        readonly default: string[];
        readonly description: 'List of disabled skills.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
        };
        readonly mergeStrategy: MergeStrategy.UNION;
      };
    };
  };
  readonly hooksConfig: {
    readonly type: 'object';
    readonly label: 'HooksConfig';
    readonly category: 'Advanced';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'Hook configurations for intercepting and customizing agent behavior.';
    readonly showInDialog: false;
    readonly properties: {
      readonly enabled: {
        readonly type: 'boolean';
        readonly label: 'Enable Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: true;
        readonly default: true;
        readonly description: 'Canonical toggle for the hooks system. When disabled, no hooks will be executed.';
        readonly showInDialog: true;
      };
      readonly disabled: {
        readonly type: 'array';
        readonly label: 'Disabled Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: string[];
        readonly description: 'List of hook names (commands) that should be disabled. Hooks in this list will not execute even if configured.';
        readonly showInDialog: false;
        readonly items: {
          readonly type: 'string';
          readonly description: 'Hook command name';
        };
        readonly mergeStrategy: MergeStrategy.UNION;
      };
      readonly notifications: {
        readonly type: 'boolean';
        readonly label: 'Hook Notifications';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: true;
        readonly description: 'Show visual indicators when hooks are executing.';
        readonly showInDialog: true;
      };
    };
  };
  readonly hooks: {
    readonly type: 'object';
    readonly label: 'Hook Events';
    readonly category: 'Advanced';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'Event-specific hook configurations.';
    readonly showInDialog: false;
    readonly properties: {
      readonly BeforeTool: {
        readonly type: 'array';
        readonly label: 'Before Tool Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute before tool execution. Can intercept, validate, or modify tool calls.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly AfterTool: {
        readonly type: 'array';
        readonly label: 'After Tool Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute after tool execution. Can process results, log outputs, or trigger follow-up actions.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly BeforeAgent: {
        readonly type: 'array';
        readonly label: 'Before Agent Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute before agent loop starts. Can set up context or initialize resources.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly AfterAgent: {
        readonly type: 'array';
        readonly label: 'After Agent Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute after agent loop completes. Can perform cleanup or summarize results.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly Notification: {
        readonly type: 'array';
        readonly label: 'Notification Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute on notification events (errors, warnings, info). Can log or alert on specific conditions.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly SessionStart: {
        readonly type: 'array';
        readonly label: 'Session Start Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute when a session starts. Can initialize session-specific resources or state.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly SessionEnd: {
        readonly type: 'array';
        readonly label: 'Session End Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute when a session ends. Can perform cleanup or persist session data.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly PreCompress: {
        readonly type: 'array';
        readonly label: 'Pre-Compress Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute before chat history compression. Can back up or analyze conversation before compression.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly BeforeModel: {
        readonly type: 'array';
        readonly label: 'Before Model Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute before LLM requests. Can modify prompts, inject context, or control model parameters.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly AfterModel: {
        readonly type: 'array';
        readonly label: 'After Model Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute after LLM responses. Can process outputs, extract information, or log interactions.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
      readonly BeforeToolSelection: {
        readonly type: 'array';
        readonly label: 'Before Tool Selection Hooks';
        readonly category: 'Advanced';
        readonly requiresRestart: false;
        readonly default: [];
        readonly description: 'Hooks that execute before tool selection. Can filter or prioritize available tools dynamically.';
        readonly showInDialog: false;
        readonly ref: 'HookDefinitionArray';
        readonly mergeStrategy: MergeStrategy.CONCAT;
      };
    };
    readonly additionalProperties: {
      readonly type: 'array';
      readonly description: 'Custom hook event arrays that contain hook definitions for user-defined events';
      readonly mergeStrategy: MergeStrategy.CONCAT;
    };
  };
  readonly admin: {
    readonly type: 'object';
    readonly label: 'Admin';
    readonly category: 'Admin';
    readonly requiresRestart: false;
    readonly default: {};
    readonly description: 'Settings configured remotely by enterprise admins.';
    readonly showInDialog: false;
    readonly mergeStrategy: MergeStrategy.REPLACE;
    readonly properties: {
      readonly secureModeEnabled: {
        readonly type: 'boolean';
        readonly label: 'Secure Mode Enabled';
        readonly category: 'Admin';
        readonly requiresRestart: false;
        readonly default: false;
        readonly description: 'If true, disallows yolo mode from being used.';
        readonly showInDialog: false;
        readonly mergeStrategy: MergeStrategy.REPLACE;
      };
      readonly extensions: {
        readonly type: 'object';
        readonly label: 'Extensions Settings';
        readonly category: 'Admin';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'Extensions-specific admin settings.';
        readonly showInDialog: false;
        readonly mergeStrategy: MergeStrategy.REPLACE;
        readonly properties: {
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'Extensions Enabled';
            readonly category: 'Admin';
            readonly requiresRestart: false;
            readonly default: true;
            readonly description: 'If false, disallows extensions from being installed or used.';
            readonly showInDialog: false;
            readonly mergeStrategy: MergeStrategy.REPLACE;
          };
        };
      };
      readonly mcp: {
        readonly type: 'object';
        readonly label: 'MCP Settings';
        readonly category: 'Admin';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'MCP-specific admin settings.';
        readonly showInDialog: false;
        readonly mergeStrategy: MergeStrategy.REPLACE;
        readonly properties: {
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'MCP Enabled';
            readonly category: 'Admin';
            readonly requiresRestart: false;
            readonly default: true;
            readonly description: 'If false, disallows MCP servers from being used.';
            readonly showInDialog: false;
            readonly mergeStrategy: MergeStrategy.REPLACE;
          };
          readonly config: {
            readonly type: 'object';
            readonly label: 'MCP Config';
            readonly category: 'Admin';
            readonly requiresRestart: false;
            readonly default: Record<string, MCPServerConfig>;
            readonly description: 'Admin-configured MCP servers.';
            readonly showInDialog: false;
            readonly mergeStrategy: MergeStrategy.REPLACE;
            readonly additionalProperties: {
              readonly type: 'object';
              readonly ref: 'MCPServerConfig';
            };
          };
        };
      };
      readonly skills: {
        readonly type: 'object';
        readonly label: 'Skills Settings';
        readonly category: 'Admin';
        readonly requiresRestart: false;
        readonly default: {};
        readonly description: 'Agent Skills-specific admin settings.';
        readonly showInDialog: false;
        readonly mergeStrategy: MergeStrategy.REPLACE;
        readonly properties: {
          readonly enabled: {
            readonly type: 'boolean';
            readonly label: 'Skills Enabled';
            readonly category: 'Admin';
            readonly requiresRestart: false;
            readonly default: true;
            readonly description: 'If false, disallows agent skills from being used.';
            readonly showInDialog: false;
            readonly mergeStrategy: MergeStrategy.REPLACE;
          };
        };
      };
    };
  };
};
export type SettingsSchemaType = typeof SETTINGS_SCHEMA;
export type SettingsJsonSchemaDefinition = Record<string, unknown>;
export declare const SETTINGS_SCHEMA_DEFINITIONS: Record<
  string,
  SettingsJsonSchemaDefinition
>;
export declare function getSettingsSchema(): SettingsSchemaType;
type InferSettings<T extends SettingsSchema> = {
  -readonly [K in keyof T]?: T[K] extends {
    properties: SettingsSchema;
  }
    ? InferSettings<T[K]['properties']>
    : T[K]['type'] extends 'enum'
      ? T[K]['options'] extends readonly SettingEnumOption[]
        ? T[K]['options'][number]['value']
        : T[K]['default']
      : T[K]['default'] extends boolean
        ? boolean
        : T[K]['default'];
};
type InferMergedSettings<T extends SettingsSchema> = {
  -readonly [K in keyof T]-?: T[K] extends {
    properties: SettingsSchema;
  }
    ? InferMergedSettings<T[K]['properties']>
    : T[K]['type'] extends 'enum'
      ? T[K]['options'] extends readonly SettingEnumOption[]
        ? T[K]['options'][number]['value']
        : T[K]['default']
      : T[K]['default'] extends boolean
        ? boolean
        : T[K]['default'];
};
export type Settings = InferSettings<SettingsSchemaType>;
export type MergedSettings = InferMergedSettings<SettingsSchemaType>;
export {};
