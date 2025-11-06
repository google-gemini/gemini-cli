/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ContextSettings {
  fileName?: string | string[];
  importFormat?: string;
  discoveryMaxDirs?: number;
  includeDirectories?: string[];
  loadMemoryFromIncludeDirectories?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
    disableFuzzySearch?: boolean;
  };
}

export interface ToolSettings {
  shell?: {
    enableInteractiveShell?: boolean;
    pager?: string;
    showColor?: boolean;
  };
  autoAccept?: boolean; // Only false allowed, not true
  core?: string[];
  allowed?: string[];
  exclude?: string[];
  discoveryCommand?: string;
  callCommand?: string;
  useRipgrep?: boolean;
  enableToolOutputTruncation?: boolean;
  truncateToolOutputThreshold?: number;
  truncateToolOutputLines?: number;
  enableMessageBusIntegration?: boolean;
  enableHooks?: boolean;
}

export interface UISettings {
  theme?: string;
  customThemes?: Record<string, unknown>;
  hideWindowTitle?: boolean;
  showStatusInTitle?: boolean;
  hideTips?: boolean;
  hideBanner?: boolean;
  hideContextSummary?: boolean;
  footer?: {
    hideCWD?: boolean;
    hideSandboxStatus?: boolean;
    hideModelInfo?: boolean;
    hideContextPercentage?: boolean;
  };
  hideFooter?: boolean;
  showMemoryUsage?: boolean;
  showLineNumbers?: boolean;
  showCitations?: boolean;
  useFullWidth?: boolean;
  useAlternateBuffer?: boolean;
  customWittyPhrases?: string[];
  accessibility?: {
    disableLoadingPhrases?: boolean;
    screenReader?: boolean;
  };
}

export interface ModelSettings {
  name?: string;
  maxSessionTurns?: number;
  summarizeToolOutput?: Record<string, { tokenBudget: number }>;
  compressionThreshold?: number;
  skipNextSpeakerCheck?: boolean;
}

export interface GeneralSettings {
  preferredEditor?: string;
  vimMode?: boolean;
  disableAutoUpdate?: boolean;
  disableUpdateNag?: boolean;
  checkpointing?: {
    enabled?: boolean;
  };
  enablePromptCompletion?: boolean;
  retryFetchErrors?: boolean;
  debugKeystrokeLogging?: boolean;
  sessionRetention?: {
    enabled?: boolean;
    maxAge?: string;
    maxCount?: number;
    minRetention?: string;
  };
}

export interface OutputSettings {
  format?: 'text' | 'json';
}

export interface IDESettings {
  enabled?: boolean;
  hasSeenNudge?: boolean;
}

export interface MCPSettings {
  serverCommand?: string;
  allowed?: string[];
  excluded?: string[];
}

export interface ModelConfigsSettings {
  aliases?: Record<string, unknown>;
  overrides?: unknown[];
}

export interface AdvancedSettings {
  autoConfigureMemory?: boolean;
  dnsResolutionOrder?: string;
  excludedEnvVars?: string[];
  bugCommand?: Record<string, unknown>;
}

export interface ExperimentalSettings {
  extensionManagement?: boolean;
  extensionReloading?: boolean;
  useModelRouter?: boolean;
  codebaseInvestigatorSettings?: {
    enabled?: boolean;
    maxNumTurns?: number;
    maxTimeMinutes?: number;
    thinkingBudget?: number;
    model?: string;
  };
}

export interface HooksSettings {
  [key: string]: unknown;
}

export interface ExtensionSettings {
  general?: GeneralSettings;
  output?: OutputSettings;
  ui?: UISettings;
  ide?: IDESettings;
  context?: ContextSettings;
  tools?: ToolSettings;
  model?: ModelSettings;
  modelConfigs?: ModelConfigsSettings;
  mcp?: MCPSettings;
  useSmartEdit?: boolean;
  useWriteTodos?: boolean;
  advanced?: AdvancedSettings;
  experimental?: ExperimentalSettings;
  hooks?: HooksSettings;
  mcpServers?: Record<string, unknown>;
}
