/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec as _exec } from 'child_process';
import { useCallback } from 'react';
import { Config } from '@gemini-code/server';
import { type PartListUnion } from '@google/genai';
import { HistoryItem, StreamingState } from '../types.js';
import { getCommandFromQuery } from '../utils/commandUtils.js';

// Helper function (consider moving to a shared util if used elsewhere)
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

export const usePassthroughProcessor = (
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
  setStreamingState: React.Dispatch<React.SetStateAction<StreamingState>>,
  setDebugMessage: React.Dispatch<React.SetStateAction<string>>,
  getNextMessageId: (baseTimestamp: number) => number,
  config: Config,
) => {
  const handlePassthroughCommand = useCallback(
    (rawQuery: PartListUnion): boolean => {
      if (typeof rawQuery !== 'string') {
        return false; // Passthrough only works with string commands
      }

      const trimmedQuery = rawQuery.trim();
      if (!trimmedQuery) {
        return false;
      }

      const [symbol, command] = getCommandFromQuery(trimmedQuery);

      // Passthrough commands don't start with symbol
      if (symbol !== undefined) {
        return false;
      }

      if (config.getPassthroughCommands().includes(command)) {
        // Add user message *before* execution starts
        const userMessageTimestamp = Date.now();
        addHistoryItem(
          setHistory,
          { type: 'user', text: trimmedQuery },
          userMessageTimestamp,
        );

        // Execute and capture output
        const targetDir = config.getTargetDir();
        setDebugMessage(
          `Executing pass through command in ${targetDir}: ${trimmedQuery}`,
        );
        const execOptions = {
          cwd: targetDir,
        };

        // Set state to Responding while the command runs
        setStreamingState(StreamingState.Responding);

        _exec(trimmedQuery, execOptions, (error, stdout, stderr) => {
          const timestamp = getNextMessageId(userMessageTimestamp); // Use user message time as base
          if (error) {
            addHistoryItem(
              setHistory,
              { type: 'error', text: error.message },
              timestamp,
            );
          } else if (stderr) {
            // Treat stderr as info for passthrough, as some tools use it for non-error output
            addHistoryItem(
              setHistory,
              { type: 'info', text: stderr },
              timestamp,
            );
          } else {
            // Add stdout as an info message
            addHistoryItem(
              setHistory,
              { type: 'info', text: stdout || '(Command produced no output)' },
              timestamp,
            );
          }
          // Set state back to Idle *after* command finishes and output is added
          setStreamingState(StreamingState.Idle);
        });

        return true; // Command was handled
      }

      return false; // Not a passthrough command
    },
    [config, setDebugMessage, setHistory, setStreamingState, getNextMessageId],
  );

  return { handlePassthroughCommand };
};
