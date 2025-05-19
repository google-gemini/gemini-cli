/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec as _exec } from 'child_process';
import { useCallback } from 'react';
import { Config } from '@gemini-code/server';
import { type PartListUnion } from '@google/genai';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
/**
 * Hook to process shell commands (e.g., !ls, $pwd).
 * Executes the command in the target directory and adds output/errors to history.
 */
export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  onExec: (command: Promise<void>) => void,
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

      let commandToExecute = rawQuery.trim().slice(1).trimStart();

      // wrap command to write pwd to temporary file
      const pwdFileName = `shell_pwd_${crypto.randomBytes(6).toString('hex')}.tmp`;
      const pwdFilePath = path.join(os.tmpdir(), pwdFileName);
      if (!commandToExecute.endsWith('&')) commandToExecute += ';';
      // note here we could also restore a previous pwd with `cd {cwd}; { ... }`
      commandToExecute = `{ ${commandToExecute} }; pwd >${pwdFilePath}`;

      const userMessageTimestamp = Date.now();
      addItemToHistory(
        { type: 'user_shell', text: rawQuery },
        userMessageTimestamp,
      );

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

      const execPromise = new Promise<void>((resolve) => {
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
          if (fs.existsSync(pwdFilePath)) {
            const pwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
            if (pwd !== targetDir) {
              addItemToHistory(
                {
                  type: 'info',
                  text: `WARNING: shell mode is stateless; \`cd ${pwd}\` will not apply to next command`,
                },
                userMessageTimestamp,
              );
            }
            fs.unlinkSync(pwdFilePath);
          }
          resolve();
        });
      });

      try {
        onExec(execPromise);
      } catch (_e) {
        // silently ignore errors from this since it's from the caller
      }

      return true; // Command was initiated
    },
    [config, onDebugMessage, addItemToHistory, onExec],
  );

  return { handleShellCommand };
};
