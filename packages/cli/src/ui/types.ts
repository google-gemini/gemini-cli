/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolCallConfirmationDetails,
  ToolResultDisplay,
} from '@google/gemini-cli-core';

// Only defining the state enum needed by the UI
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
}

// Copied from server/src/core/turn.ts for CLI usage
export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  // Add other event types if the UI hook needs to handle them
}

export enum ToolCallStatus {
  Pending = 'Pending',
  Canceled = 'Canceled',
  Confirming = 'Confirming',
  Executing = 'Executing',
  Success = 'Success',
  Error = 'Error',
}

export interface ToolCallEvent {
  type: 'tool_call';
  status: ToolCallStatus;
  callId: string;
  name: string;
  args: Record<string, never>;
  resultDisplay: ToolResultDisplay | undefined;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
}

export interface IndividualToolCallDisplay {
  callId: string;
  name: string;
  description: string;
  resultDisplay: ToolResultDisplay | undefined;
  status: ToolCallStatus;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
  renderOutputAsMarkdown?: boolean;
}

export interface CompressionProps {
  isPending: boolean;
  originalTokenCount: number | null;
  newTokenCount: number | null;
}

export interface HistoryItemBase {
  text?: string; // Text content for user/gemini/info/error messages
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
};

export type HistoryItemError = HistoryItemBase & {
  type: 'error';
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
};

export type HistoryItemHelp = HistoryItemBase & {
  type: 'help';
  timestamp: Date;
};

export type HistoryItemStats = HistoryItemBase & {
  type: 'stats';
  duration: string;
};

export type HistoryItemModelStats = HistoryItemBase & {
  type: 'model_stats';
};

export type HistoryItemToolStats = HistoryItemBase & {
  type: 'tool_stats';
};

export type HistoryItemQuit = HistoryItemBase & {
  type: 'quit';
  duration: string;
};

export type HistoryItemToolGroup = HistoryItemBase & {
  type: 'tool_group';
  tools: IndividualToolCallDisplay[];
};

export type HistoryItemUserShell = HistoryItemBase & {
  type: 'user_shell';
  text: string;
};

export type HistoryItemCompression = HistoryItemBase & {
  type: 'compression';
  compression: CompressionProps;
};

// Using Omit<HistoryItem, 'id'> seems to have some issues with typescript's
// type inference e.g. historyItem.type === 'tool_group' isn't auto-inferring that
// 'tools' in historyItem.
// Individually exported types extending HistoryItemBase
export type HistoryItemWithoutId =
  | HistoryItemUser
  | HistoryItemUserShell
  | HistoryItemGemini
  | HistoryItemGeminiContent
  | HistoryItemInfo
  | HistoryItemError
  | HistoryItemAbout
  | HistoryItemHelp
  | HistoryItemToolGroup
  | HistoryItemStats
  | HistoryItemModelStats
  | HistoryItemToolStats
  | HistoryItemQuit
  | HistoryItemCompression;

export type HistoryItem = HistoryItemWithoutId & { id: number };

// Message types used by internal command feedback (subset of HistoryItem types)
export enum MessageType {
  INFO = 'info',
  ERROR = 'error',
  USER = 'user',
  ABOUT = 'about',
  HELP = 'help',
  STATS = 'stats',
  MODEL_STATS = 'model_stats',
  TOOL_STATS = 'tool_stats',
  QUIT = 'quit',
  GEMINI = 'gemini',
  COMPRESSION = 'compression',
}

// Simplified message structure for internal feedback
export type Message =
  | {
      type: MessageType.INFO | MessageType.ERROR | MessageType.USER;
      content: string; // Renamed from text for clarity in this context
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
      content?: string; // Optional content, not really used for ABOUT
    }
  | {
      type: MessageType.HELP;
      timestamp: Date;
      content?: string; // Optional content, not really used for HELP
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
  type: 'log' | 'warn' | 'error' | 'debug';
  content: string;
  count: number;
}

/**
 * Result type for a slash command that should immediately result in a prompt
 * being submitted to the Gemini model.
 */
export interface SubmitPromptResult {
  type: 'submit_prompt';
  content: string;
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
      type: 'handled'; // Indicates the command was processed and no further action is needed.
    }
  | SubmitPromptResult;
