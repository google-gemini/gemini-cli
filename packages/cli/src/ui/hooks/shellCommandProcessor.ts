/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec as _exec } from 'child_process';
import { useCallback } from 'react';
import { Config } from '@gemini-code/server';
import { type PartListUnion } from '@google/genai';
import { StreamingState } from '../types.js';
import { getCommandFromQuery } from '../utils/commandUtils.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';

/**
 * Hook to process shell commands (e.g., !ls, $pwd).
 * Executes the command in the target directory and adds output/errors to history.
 */
export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  setStreamingState: React.Dispatch<React.SetStateAction<StreamingState>>,
  onDebugMessage: (message: string) => void,
  config: Config,
) => {
  /**
   * Checks if the query is a shell command, executes it, and adds results to history.
   * @returns True if the query was handled as a shell command, false otherwise.
   */
  const handleShellCommand = useCallback(
    (rawQuery: PartListUnion): boolean => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      const [symbol] = getCommandFromQuery(rawQuery);
      if (symbol !== '!' && symbol !== '$') {
        return false;
      }
      const commandToExecute = rawQuery.trim().slice(1).trimStart();

      const userMessageTimestamp = Date.now();
      addItemToHistory({ type: 'user', text: rawQuery }, userMessageTimestamp);

      if (!commandToExecute) {
        addItemToHistory(
          { type: 'error', text: 'Empty shell command.' },
          userMessageTimestamp,
        );
        return true; // Handled (by showing error)
      }

      const targetDir = config.getTargetDir();
      onDebugMessage(
        `Executing shell command in ${targetDir}: ${commandToExecute}`,
      );
      const execOptions = {
        cwd: targetDir,
      };

      setStreamingState(StreamingState.Responding);

      _exec(commandToExecute, execOptions, (error, stdout, stderr) => {
        if (error) {
          addItemToHistory(
            { type: 'error', text: error.message },
            userMessageTimestamp,
          );
        } else {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + stderr; // Include stderr as info

          addItemToHistory(
            { type: 'info', text: output || '(Command produced no output)' },
            userMessageTimestamp,
          );
        }
        setStreamingState(StreamingState.Idle);
      });

      return true; // Command was initiated
    },
    [config, onDebugMessage, addItemToHistory, setStreamingState],
  );

  return { handleShellCommand };
};
