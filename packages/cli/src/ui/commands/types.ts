/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, GitService, Logger } from '@google/gemini-cli-core';
import { LoadedSettings } from '../../config/settings.js';
import { HistoryItem, HistoryItemWithoutId, Message } from '../types.js';
import { UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { SessionStatsState } from '../contexts/SessionContext.js';

// Grouped dependencies for clarity and easier mocking
export interface CommandContext {
  // Core services and configuration
  services: {
    config: Config | null;
    settings: LoadedSettings;
    git: GitService | undefined;
    logger: Logger;
  };
  // UI state and history management
  ui: {
    history: HistoryItem[];
    addItem: UseHistoryManagerReturn['addItem'];
    clearItems: UseHistoryManagerReturn['clearItems'];
    loadHistory: UseHistoryManagerReturn['loadHistory'];
    refreshStatic: () => void;
    setQuittingMessages: (messages: HistoryItem[]) => void;
    pendingHistoryItems: HistoryItemWithoutId[];
  };
  // Functions to open dialogs/modals
  dialogs: {
    openTheme: () => void;
    openAuth: () => void;
    openEditor: () => void;
    openPrivacy: () => void;
    setShowHelp: (show: boolean) => void;
  };
  // Specific actions that interact with other hooks/state
  actions: {
    performMemoryRefresh: () => Promise<void>;
    toggleCorgiMode: () => void;
    setPendingCompression: (item: HistoryItemWithoutId | null) => void;
  };
  // Session-specific data
  session: {
    stats: SessionStatsState;
  };
  // Low-level utilities
  utils: {
    onDebugMessage: (message: string) => void;
    addMessage: (message: Message) => void;
  };
}

export interface SlashCommandActionReturn {
  shouldScheduleTool?: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  message?: string; // For simple messages or errors
}

// The standardized contract for any command in the system.
export interface SlashCommand {
  name: string;
  altName?: string;
  description?: string;

  // The action to run. Optional for parent commands that only group sub-commands.
  action?: (
    context: CommandContext,
    args: string,
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
