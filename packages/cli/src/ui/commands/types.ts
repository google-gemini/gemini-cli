/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ReactNode } from 'react';
import type { Content, PartListUnion } from '@google/genai';
import type { HistoryItemWithoutId, HistoryItem } from '../types.js';
import type { Config, GitService, Logger } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import type { UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import type { SessionStatsState } from '../contexts/SessionContext.js';

// Grouped dependencies for clarity and easier mocking
export interface CommandContext {
  // Invocation properties for when commands are called.
  invocation?: {
    /** The raw, untrimmed input string from the user. */
    raw: string;
    /** The primary name of the command that was matched. */
    name: string;
    /** The arguments string that follows the command name. */
    args: string;
  };
  // Core services and configuration
  services: {
    // TODO(abhipatel12): Ensure that config is never null.
    config: Config | null;
    settings: LoadedSettings;
    git: GitService | undefined;
    logger: Logger;
  };
  // UI state and history management
  ui: {
    /** Adds a new item to the history display. */
    addItem: UseHistoryManagerReturn['addItem'];
    /** Clears all history items and the console screen. */
    clear: () => void;
    /**
     * Sets the transient debug message displayed in the application footer in debug mode.
     */
    setDebugMessage: (message: string) => void;
    /** The currently pending history item, if any. */
    pendingItem: HistoryItemWithoutId | null;
    /**
     * Sets a pending item in the history, which is useful for indicating
     * that a long-running operation is in progress.
     *
     * @param item The history item to display as pending, or `null` to clear.
     */
    setPendingItem: (item: HistoryItemWithoutId | null) => void;
    /**
     * Loads a new set of history items, replacing the current history.
     *
     * @param history The array of history items to load.
     */
    loadHistory: UseHistoryManagerReturn['loadHistory'];
    /** Toggles a special display mode. */
    toggleCorgiMode: () => void;
    toggleVimEnabled: () => Promise<boolean>;
    setGeminiMdFileCount: (count: number) => void;
    reloadCommands: () => void;
  };
  // Session-specific data
  session: {
    stats: SessionStatsState;
    /** A transient list of shell commands the user has approved for this session. */
    sessionShellAllowlist: Set<string>;
  };
  // Flag to indicate if an overwrite has been confirmed
  overwriteConfirmed?: boolean;
}

/**
 * The return type for a command action that results in scheduling a tool call.
 */
export interface ToolActionReturn {
  type: 'tool';
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/** The return type for a command action that results in the app quitting. */
export interface QuitActionReturn {
  type: 'quit';
  messages: HistoryItem[];
}

/**
 * The return type for a command action that results in a simple message
 * being displayed to the user.
 */
export interface MessageActionReturn {
  type: 'message';
  messageType: 'info' | 'error';
  content: string;
}

/**
 * The return type for a command action that needs to open a dialog.
 */
export interface OpenDialogActionReturn {
  type: 'dialog';

  dialog: 'help' | 'auth' | 'theme' | 'editor' | 'privacy' | 'settings';
}

/**
 * The return type for a command action that results in replacing
 * the entire conversation history.
 */
export interface LoadHistoryActionReturn {
  type: 'load_history';
  history: HistoryItemWithoutId[];
  clientHistory: Content[]; // The history for the generative client
}

/**
 * The return type for a command action that should immediately submit
 * content as a prompt to the Gemini model.
 */
export interface SubmitPromptActionReturn {
  type: 'submit_prompt';
  content: PartListUnion;
}

/**
 * The return type for a command action that needs to pause and request
 * confirmation for a set of shell commands before proceeding.
 */
export interface ConfirmShellCommandsActionReturn {
  type: 'confirm_shell_commands';
  /** The list of shell commands that require user confirmation. */
  commandsToConfirm: string[];
  /** The original invocation context to be re-run after confirmation. */
  originalInvocation: {
    raw: string;
  };
}

export interface ConfirmActionReturn {
  type: 'confirm_action';
  /** The React node to display as the confirmation prompt. */
  prompt: ReactNode;
  /** The original invocation context to be re-run after confirmation. */
  originalInvocation: {
    raw: string;
  };
}

export type SlashCommandActionReturn =
  | ToolActionReturn
  | MessageActionReturn
  | QuitActionReturn
  | OpenDialogActionReturn
  | LoadHistoryActionReturn
  | SubmitPromptActionReturn
  | ConfirmShellCommandsActionReturn
  | ConfirmActionReturn;

export enum CommandKind {
  BUILT_IN = 'built-in',
  FILE = 'file',
  MCP_PROMPT = 'mcp-prompt',
}

// The standardized contract for any command in the system.
export interface SlashCommand {
  name: string;
  altNames?: string[];
  description: string;
  hidden?: boolean;

  kind: CommandKind;

  // Optional metadata for extension commands
  extensionName?: string;

  // The action to run. Optional for parent commands that only group sub-commands.
  action?: (
    context: CommandContext,
    args: string, // TODO: Remove args. CommandContext now contains the complete invocation.
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>;

  // Provides argument completion (e.g., completing a tag for `/chat resume <tag>`).
  completion?: (
    context: CommandContext,
    partialArg: string,
  ) => Promise<string[]>;

  subCommands?: SlashCommand[];
}
