/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { type PartListUnion } from '@google/genai';
import { HistoryItem } from '../types.js';
import { getCommandFromQuery } from '../utils/commandUtils.js';

export interface SlashCommand {
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
      name: 'help',
      description: 'for help on gemini-code',
      action: (_value: PartListUnion) => {
        const helpText =
          'I am an interactive CLI tool assistant designed to ' +
          'help with software engineering tasks. I can use tools to read ' +
          'and write files, search code, execute bash commands, and more ' +
          'to assist with development workflows. I will explain commands ' +
          'and ask for permission before running them and will not ' +
          'commit changes unless explicitly instructed.';
        const timestamp = getNextMessageId(Date.now());
        addHistoryItem(setHistory, { type: 'info', text: helpText }, timestamp);
      },
    },
    {
      name: 'exit',
      description: '',
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
      description: '',
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

  // Checks if the query is a slash command and executes the command if it is.
  const handleSlashCommand = useCallback(
    (rawQuery: PartListUnion): boolean => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      const trimmed = rawQuery.trim();
      const [symbol, test] = getCommandFromQuery(trimmed);

      // Skip non slash commands
      if (symbol !== '/') {
        return false;
      }

      for (const cmd of slashCommands) {
        if (test === cmd.name) {
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
    [setDebugMessage, setHistory, getNextMessageId, slashCommands],
  );

  return { handleSlashCommand, slashCommands };
};
