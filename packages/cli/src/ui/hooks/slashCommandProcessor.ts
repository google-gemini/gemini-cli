/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react';
import { type PartListUnion } from '@google/genai';
import { getCommandFromQuery } from '../utils/commandUtils.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { Config } from '@gemini-code/server'; // Import Config
import { Message, MessageType, HistoryItemWithoutId } from '../types.js'; // Import Message types
import {
  createShowMemoryAction,
  SHOW_MEMORY_COMMAND_NAME,
} from './useShowMemoryCommand.js';
import { REFRESH_MEMORY_COMMAND_NAME } from './useRefreshMemoryCommand.js'; // Only import name now
import process from 'node:process'; // For process.exit

export interface SlashCommand {
  name: string;
  altName?: string;
  description: string;
  action: (value: PartListUnion | string) => void; // Allow string for simpler actions
}

/**
 * Hook to define and process slash commands (e.g., /help, /clear).
 */
export const useSlashCommandProcessor = (
  config: Config | null, // Add config here
  addItem: UseHistoryManagerReturn['addItem'],
  clearItems: UseHistoryManagerReturn['clearItems'],
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  onDebugMessage: (message: string) => void,
  openThemeDialog: () => void,
  performMemoryRefresh: () => Promise<void>, // Add performMemoryRefresh prop
) => {
  const addMessage = useCallback(
    (message: Message) => {
      // Convert Message to HistoryItemWithoutId
      const historyItemContent: HistoryItemWithoutId = {
        type: message.type, // MessageType enum should be compatible with HistoryItemWithoutId string literal types
        text: message.content,
      };
      addItem(historyItemContent, message.timestamp.getTime());
    },
    [addItem],
  );

  const showMemoryAction = useCallback(async () => {
    const actionFn = createShowMemoryAction(config, addMessage);
    await actionFn();
  }, [config, addMessage]);

  const slashCommands: SlashCommand[] = useMemo(
    () => [
      {
        name: 'help',
        altName: '?',
        description: 'for help on gemini-code',
        action: (_value: PartListUnion | string) => {
          onDebugMessage('Opening help.');
          setShowHelp(true);
        },
      },
      {
        name: 'clear',
        description: 'clear the screen',
        action: (_value: PartListUnion | string) => {
          onDebugMessage('Clearing terminal.');
          clearItems();
          console.clear();
          refreshStatic();
        },
      },
      {
        name: 'theme',
        description: 'change the theme',
        action: (_value) => {
          openThemeDialog();
        },
      },
      {
        name: REFRESH_MEMORY_COMMAND_NAME.substring(1), // Remove leading '/'
        description: 'Reloads instructions from all GEMINI.md files.',
        action: performMemoryRefresh, // Use the passed in function
      },
      {
        name: SHOW_MEMORY_COMMAND_NAME.substring(1), // Remove leading '/'
        description: 'Displays the current hierarchical memory content.',
        action: showMemoryAction,
      },
      {
        name: 'quit',
        altName: 'exit',
        description: 'exit the cli',
        action: (_value: PartListUnion | string) => {
          onDebugMessage('Quitting. Good-bye.');
          process.exit(0);
        },
      },
    ],
    [
      onDebugMessage,
      setShowHelp,
      refreshStatic,
      openThemeDialog,
      clearItems,
      performMemoryRefresh, // Add to dependencies
      showMemoryAction,
    ],
  );

  const handleSlashCommand = useCallback(
    (rawQuery: PartListUnion): boolean => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      const trimmed = rawQuery.trim();
      const [symbol, test] = getCommandFromQuery(trimmed);

      if (symbol !== '/' && symbol !== '?') {
        return false;
      }

      const userMessageTimestamp = Date.now();
      // Add user message to history only if it's not a silent command or handled internally
      // For now, adding all slash commands to history for transparency.
      addItem({ type: MessageType.USER, text: trimmed }, userMessageTimestamp);

      for (const cmd of slashCommands) {
        if (
          test === cmd.name ||
          test === cmd.altName ||
          (symbol === '?' && cmd.altName === '?') // Special handling for ? as help
        ) {
          cmd.action(trimmed); // Pass the full trimmed command for context if needed
          return true;
        }
      }

      addItem(
        { type: MessageType.ERROR, text: `Unknown command: ${trimmed}` },
        userMessageTimestamp,
      );

      return true;
    },
    [addItem, slashCommands],
  );

  return { handleSlashCommand, slashCommands };
};
