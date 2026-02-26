/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type CompressionStatus,
  type GeminiCLIExtension,
  type MCPServerConfig,
  type ThoughtSummary,
  type SerializableConfirmationDetails,
  type ToolResultDisplay,
  type RetrieveUserQuotaResponse,
  type SkillDefinition,
  type AgentDefinition,
  type ApprovalMode,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import type { PartListUnion } from '@google/genai';
import { type ReactNode } from 'react';
export type { ThoughtSummary, SkillDefinition };
export declare enum AuthState {
  Unauthenticated = 'unauthenticated',
  Updating = 'updating',
  AwaitingApiKeyInput = 'awaiting_api_key_input',
  Authenticated = 'authenticated',
  AwaitingGoogleLoginRestart = 'awaiting_google_login_restart',
}
export declare enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
}
export declare enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
}
export declare enum ToolCallStatus {
  Pending = 'Pending',
  Canceled = 'Canceled',
  Confirming = 'Confirming',
  Executing = 'Executing',
  Success = 'Success',
  Error = 'Error',
}
/**
 * Maps core tool call status to a simplified UI status.
 */
export declare function mapCoreStatusToDisplayStatus(
  coreStatus: CoreToolCallStatus,
): ToolCallStatus;
export interface ToolCallEvent {
  type: 'tool_call';
  status: CoreToolCallStatus;
  callId: string;
  name: string;
  args: Record<string, never>;
  resultDisplay: ToolResultDisplay | undefined;
  confirmationDetails: SerializableConfirmationDetails | undefined;
  correlationId?: string;
}
export interface IndividualToolCallDisplay {
  callId: string;
  name: string;
  description: string;
  resultDisplay: ToolResultDisplay | undefined;
  status: CoreToolCallStatus;
  confirmationDetails: SerializableConfirmationDetails | undefined;
  renderOutputAsMarkdown?: boolean;
  ptyId?: number;
  outputFile?: string;
  correlationId?: string;
  approvalMode?: ApprovalMode;
  progressMessage?: string;
  progressPercent?: number;
}
export interface CompressionProps {
  isPending: boolean;
  originalTokenCount: number | null;
  newTokenCount: number | null;
  compressionStatus: CompressionStatus | null;
}
/**
 * For use when you want no icon.
 */
export declare const emptyIcon = '  ';
export interface HistoryItemBase {
  text?: string;
}
export type HistoryItemUser = HistoryItemBase & {
  type: 'user';
  text: string;
};
export type HistoryItemGemini = HistoryItemBase & {
  type: 'gemini';
  text: string;
};
export type HistoryItemGeminiContent = HistoryItemBase & {
  type: 'gemini_content';
  text: string;
};
export type HistoryItemInfo = HistoryItemBase & {
  type: 'info';
  text: string;
  icon?: string;
  color?: string;
  marginBottom?: number;
};
export type HistoryItemError = HistoryItemBase & {
  type: 'error';
  text: string;
};
export type HistoryItemWarning = HistoryItemBase & {
  type: 'warning';
  text: string;
};
export type HistoryItemAbout = HistoryItemBase & {
  type: 'about';
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion: string;
  selectedAuthType: string;
  gcpProject: string;
  ideClient: string;
  userEmail?: string;
  tier?: string;
};
export type HistoryItemHelp = HistoryItemBase & {
  type: 'help';
  timestamp: Date;
};
export interface HistoryItemQuotaBase extends HistoryItemBase {
  selectedAuthType?: string;
  userEmail?: string;
  tier?: string;
  currentModel?: string;
  pooledRemaining?: number;
  pooledLimit?: number;
  pooledResetTime?: string;
}
export interface QuotaStats {
  remaining: number | undefined;
  limit: number | undefined;
  resetTime?: string;
}
export type HistoryItemStats = HistoryItemQuotaBase & {
  type: 'stats';
  duration: string;
  quotas?: RetrieveUserQuotaResponse;
};
export type HistoryItemModelStats = HistoryItemQuotaBase & {
  type: 'model_stats';
};
export type HistoryItemToolStats = HistoryItemBase & {
  type: 'tool_stats';
};
export type HistoryItemModel = HistoryItemBase & {
  type: 'model';
  model: string;
};
export type HistoryItemQuit = HistoryItemBase & {
  type: 'quit';
  duration: string;
};
export type HistoryItemToolGroup = HistoryItemBase & {
  type: 'tool_group';
  tools: IndividualToolCallDisplay[];
  borderTop?: boolean;
  borderBottom?: boolean;
  borderColor?: string;
  borderDimColor?: boolean;
};
export type HistoryItemUserShell = HistoryItemBase & {
  type: 'user_shell';
  text: string;
};
export type HistoryItemCompression = HistoryItemBase & {
  type: 'compression';
  compression: CompressionProps;
};
export type HistoryItemExtensionsList = HistoryItemBase & {
  type: 'extensions_list';
  extensions: GeminiCLIExtension[];
};
export interface ChatDetail {
  name: string;
  mtime: string;
}
export type HistoryItemThinking = HistoryItemBase & {
  type: 'thinking';
  thought: ThoughtSummary;
};
export type HistoryItemHint = HistoryItemBase & {
  type: 'hint';
  text: string;
};
export type HistoryItemChatList = HistoryItemBase & {
  type: 'chat_list';
  chats: ChatDetail[];
};
export interface ToolDefinition {
  name: string;
  displayName: string;
  description?: string;
}
export type HistoryItemToolsList = HistoryItemBase & {
  type: 'tools_list';
  tools: ToolDefinition[];
  showDescriptions: boolean;
};
export type HistoryItemSkillsList = HistoryItemBase & {
  type: 'skills_list';
  skills: SkillDefinition[];
  showDescriptions: boolean;
};
export type AgentDefinitionJson = Pick<
  AgentDefinition,
  'name' | 'displayName' | 'description' | 'kind'
>;
export type HistoryItemAgentsList = HistoryItemBase & {
  type: 'agents_list';
  agents: AgentDefinitionJson[];
};
export interface JsonMcpTool {
  serverName: string;
  name: string;
  description?: string;
  schema?: {
    parametersJsonSchema?: unknown;
    parameters?: unknown;
  };
}
export interface JsonMcpPrompt {
  serverName: string;
  name: string;
  description?: string;
}
export interface JsonMcpResource {
  serverName: string;
  name?: string;
  uri?: string;
  mimeType?: string;
  description?: string;
}
export type HistoryItemMcpStatus = HistoryItemBase & {
  type: 'mcp_status';
  servers: Record<string, MCPServerConfig>;
  tools: JsonMcpTool[];
  prompts: JsonMcpPrompt[];
  resources: JsonMcpResource[];
  authStatus: Record<
    string,
    'authenticated' | 'expired' | 'unauthenticated' | 'not-configured'
  >;
  enablementState: Record<
    string,
    {
      enabled: boolean;
      isSessionDisabled: boolean;
      isPersistentDisabled: boolean;
    }
  >;
  blockedServers: Array<{
    name: string;
    extensionName: string;
  }>;
  discoveryInProgress: boolean;
  connectingServers: string[];
  showDescriptions: boolean;
  showSchema: boolean;
};
export type HistoryItemHooksList = HistoryItemBase & {
  type: 'hooks_list';
  hooks: Array<{
    config: {
      command?: string;
      type: string;
      timeout?: number;
    };
    source: string;
    eventName: string;
    matcher?: string;
    sequential?: boolean;
    enabled: boolean;
  }>;
};
export type HistoryItemWithoutId =
  | HistoryItemUser
  | HistoryItemUserShell
  | HistoryItemGemini
  | HistoryItemGeminiContent
  | HistoryItemInfo
  | HistoryItemError
  | HistoryItemWarning
  | HistoryItemAbout
  | HistoryItemHelp
  | HistoryItemToolGroup
  | HistoryItemStats
  | HistoryItemModelStats
  | HistoryItemToolStats
  | HistoryItemModel
  | HistoryItemQuit
  | HistoryItemCompression
  | HistoryItemExtensionsList
  | HistoryItemToolsList
  | HistoryItemSkillsList
  | HistoryItemAgentsList
  | HistoryItemMcpStatus
  | HistoryItemChatList
  | HistoryItemThinking
  | HistoryItemHint
  | HistoryItemHooksList;
export type HistoryItem = HistoryItemWithoutId & {
  id: number;
};
export declare enum MessageType {
  INFO = 'info',
  ERROR = 'error',
  WARNING = 'warning',
  USER = 'user',
  ABOUT = 'about',
  HELP = 'help',
  STATS = 'stats',
  MODEL_STATS = 'model_stats',
  TOOL_STATS = 'tool_stats',
  QUIT = 'quit',
  GEMINI = 'gemini',
  COMPRESSION = 'compression',
  EXTENSIONS_LIST = 'extensions_list',
  TOOLS_LIST = 'tools_list',
  SKILLS_LIST = 'skills_list',
  AGENTS_LIST = 'agents_list',
  MCP_STATUS = 'mcp_status',
  CHAT_LIST = 'chat_list',
  HOOKS_LIST = 'hooks_list',
  HINT = 'hint',
}
export type Message =
  | {
      type: MessageType.INFO | MessageType.ERROR | MessageType.USER;
      content: string;
      timestamp: Date;
    }
  | {
      type: MessageType.ABOUT;
      timestamp: Date;
      cliVersion: string;
      osVersion: string;
      sandboxEnv: string;
      modelVersion: string;
      selectedAuthType: string;
      gcpProject: string;
      ideClient: string;
      userEmail?: string;
      content?: string;
    }
  | {
      type: MessageType.HELP;
      timestamp: Date;
      content?: string;
    }
  | {
      type: MessageType.STATS;
      timestamp: Date;
      duration: string;
      content?: string;
    }
  | {
      type: MessageType.MODEL_STATS;
      timestamp: Date;
      content?: string;
    }
  | {
      type: MessageType.TOOL_STATS;
      timestamp: Date;
      content?: string;
    }
  | {
      type: MessageType.QUIT;
      timestamp: Date;
      duration: string;
      content?: string;
    }
  | {
      type: MessageType.COMPRESSION;
      compression: CompressionProps;
      timestamp: Date;
    };
export interface ConsoleMessageItem {
  type: 'log' | 'warn' | 'error' | 'debug' | 'info';
  content: string;
  count: number;
}
/**
 * Result type for a slash command that should immediately result in a prompt
 * being submitted to the Gemini model.
 */
export interface SubmitPromptResult {
  type: 'submit_prompt';
  content: PartListUnion;
}
/**
 * Defines the result of the slash command processor for its consumer (useGeminiStream).
 */
export type SlashCommandProcessorResult =
  | {
      type: 'schedule_tool';
      toolName: string;
      toolArgs: Record<string, unknown>;
    }
  | {
      type: 'handled';
    }
  | SubmitPromptResult;
export interface ConfirmationRequest {
  prompt: ReactNode;
  onConfirm: (confirm: boolean) => void;
}
export interface LoopDetectionConfirmationRequest {
  onComplete: (result: { userSelection: 'disable' | 'keep' }) => void;
}
export interface PermissionConfirmationRequest {
  files: string[];
  onComplete: (result: { allowed: boolean }) => void;
}
export interface ActiveHook {
  name: string;
  eventName: string;
  index?: number;
  total?: number;
}
