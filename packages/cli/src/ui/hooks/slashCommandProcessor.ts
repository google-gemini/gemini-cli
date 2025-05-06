/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react';
import { type PartListUnion } from '@google/genai';
import { HistoryItem } from '../types.js';
import { getCommandFromQuery } from '../utils/commandUtils.js';

export interface SlashCommand {
  name: string; // slash command
  altName?: string; // alternative name for the command
  description: string; // flavor text in UI
  action: (value: PartListUnion) => void;
}

const addHistoryItem = (
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
  itemData: Omit<HistoryItem, 'id'>,
  id: number,
) => {
  setHistory((prevHistory) => [
    ...prevHistory,
    { ...itemData, id } as HistoryItem,
  ]);
};

export const useSlashCommandProcessor = (
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  setDebugMessage: React.Dispatch<React.SetStateAction<string>>,
  getNextMessageId: (baseTimestamp: number) => number,
  openThemeDialog: () => void,
) => {
  const slashCommands: SlashCommand[] = useMemo(
    () => [
      {
        name: 'help',
        altName: '?',
        description: 'for help on gemini-code',
        action: (_value: PartListUnion) => {
          setDebugMessage('Opening help.');
          setShowHelp(true);
        },
      },
      {
        name: 'clear',
        description: 'clear the screen',
        action: (_value: PartListUnion) => {
          // This just clears the *UI* history, not the model history.
          setDebugMessage('Clearing terminal.');
          setHistory((_) => []);
          refreshStatic();
        },
      },
      {
        name: 'theme',
        description: 'change the theme',
        action: (_value: PartListUnion) => {
          openThemeDialog();
        },
      },
      {
        name: 'quit',
        altName: 'exit',
        description: '',
        action: (_value: PartListUnion) => {
          setDebugMessage('Quitting. Good-bye.');
          getNextMessageId(Date.now());
          process.exit(0);
        },
      },
    ],
    [
      setDebugMessage,
      setShowHelp,
      setHistory,
      refreshStatic,
      openThemeDialog,
      getNextMessageId,
    ],
  );

  // Checks if the query is a slash command and executes the command if it is.
  const handleSlashCommand = useCallback(
    (rawQuery: PartListUnion): boolean => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      const trimmed = rawQuery.trim();
      const [symbol, test] = getCommandFromQuery(trimmed);

      // Skip non slash commands
      if (symbol !== '/' && symbol !== '?') {
        return false;
      }

      for (const cmd of slashCommands) {
        if (
          test === cmd.name ||
          test === cmd.altName ||
          symbol === cmd.altName
        ) {
          // Add user message *before* execution
          const userMessageTimestamp = Date.now();
          addHistoryItem(
            setHistory,
            { type: 'user', text: trimmed },
            userMessageTimestamp,
          );
          cmd.action(trimmed);
          return true; // Command was handled
        }
      }

      return false; // Not a recognized slash command
    },
    [setHistory, slashCommands],
  );

  return { handleSlashCommand, slashCommands };
};
