/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { type PartListUnion } from '@google/genai';
import { HistoryItem } from '../types.js';
import { isSlashCommand } from '../utils/commandUtils.js';

interface SlashCommand {
  name: string; // slash command
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
  setDebugMessage: React.Dispatch<React.SetStateAction<string>>,
  getNextMessageId: (baseTimestamp: number) => number,
) => {
  const slashCommands: SlashCommand[] = [
    {
      name: 'clear',
      description: 'clear the screen',
      action: (_value: PartListUnion) => {
        // This just clears the *UI* history, not the model history.
        setDebugMessage('Clearing terminal.');
        setHistory((_) => []);
      },
    },
    {
      name: 'exit',
      description: 'Exit gemini-code',
      action: (_value: PartListUnion) => {
        setDebugMessage('Exiting. Good-bye.');
        const timestamp = getNextMessageId(Date.now());
        addHistoryItem(
          setHistory,
          { type: 'info', text: 'good-bye!' },
          timestamp,
        );
        process.exit(0);
      },
    },
    {
      // TODO: dedup with exit by adding altName or cmdRegex.
      name: 'quit',
      description: 'Quit gemini-code',
      action: (_value: PartListUnion) => {
        setDebugMessage('Quitting. Good-bye.');
        const timestamp = getNextMessageId(Date.now());
        addHistoryItem(
          setHistory,
          { type: 'info', text: 'good-bye!' },
          timestamp,
        );
        process.exit(0);
      },
    },
    // Removed /theme command, handled in App.tsx
  ];

  // Checks if the query is a slash command and executes it if it is.
  const handleSlashCommand = useCallback(
    (rawQuery: PartListUnion): boolean => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      const trimmedQuery = rawQuery.trim();
      if (!isSlashCommand(trimmedQuery)) {
        return false; // Not a slash command
      }

      const commandName = trimmedQuery.slice(1).split(/\s+/)[0]; // Get command name after '/'

      for (const cmd of slashCommands) {
        if (commandName === cmd.name) {
          // Add user message *before* execution
          const userMessageTimestamp = Date.now();
          addHistoryItem(
            setHistory,
            { type: 'user', text: trimmedQuery },
            userMessageTimestamp,
          );
          cmd.action(trimmedQuery);
          return true; // Command was handled
        }
      }

      return false; // Not a recognized slash command
    },
    [setDebugMessage, setHistory, getNextMessageId, slashCommands],
  );

  return { handleSlashCommand };
};
