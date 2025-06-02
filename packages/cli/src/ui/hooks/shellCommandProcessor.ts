/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import type { HistoryItemWithoutId } from '../types.js';
import type { exec as ExecType } from 'child_process';
import { useCallback } from 'react';
import { Config } from '@gemini-code/core';
import { type PartListUnion } from '@google/genai';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import stripAnsi from 'strip-ansi';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;

/**
 * Hook to process shell commands (e.g., !ls, $pwd).
 * Executes the command in the target directory and adds output/errors to history.
 */
export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
  onExec: (command: Promise<void>) => void,
  onDebugMessage: (message: string) => void,
  config: Config,
  executeCommand?: typeof ExecType, // injectable for testing
) => {
  /**
   * Checks if the query is a shell command, executes it, and adds results to history.
   * @returns True if the query was handled as a shell command, false otherwise.
   */
  const handleShellCommand = useCallback(
    (rawQuery: PartListUnion, abortSignal: AbortSignal): boolean => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      // wrap command to write pwd to temporary file
      let commandToExecute = rawQuery.trim();
      const pwdFileName = `shell_pwd_${crypto.randomBytes(6).toString('hex')}.tmp`;
      const pwdFilePath = path.join(os.tmpdir(), pwdFileName);
      if (!commandToExecute.endsWith('&')) commandToExecute += ';';
      // note here we could also restore a previous pwd with `cd {cwd}; { ... }`
      commandToExecute = `{ ${commandToExecute} }; __code=$?; pwd >${pwdFilePath}; exit $__code`;

      const userMessageTimestamp = Date.now();
      addItemToHistory(
        { type: 'user_shell', text: rawQuery },
        userMessageTimestamp,
      );

      if (rawQuery.trim() === '') {
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
        if (executeCommand) {
          executeCommand(
            commandToExecute,
            execOptions,
            (error, stdout, stderr) => {
              if (error) {
                addItemToHistory(
                  {
                    type: 'error',
                    // remove wrapper from user's command in error message
                    text: error.message.replace(commandToExecute, rawQuery),
                  },
                  userMessageTimestamp,
                );
              } else {
                let output = '';
                if (stdout) output += stdout;
                if (stderr) output += (output ? '\n' : '') + stderr; // Include stderr as info

                addItemToHistory(
                  {
                    type: 'info',
                    text: output || '(Command produced no output)',
                  },
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
            },
          );
        } else {
          const child = spawn('bash', ['-c', commandToExecute], {
            cwd: targetDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true, // Important for process group killing
          });

          let exited = false;
          let output = '';
          let lastUpdateTime = Date.now();
          const handleOutput = (data: Buffer) => {
            // continue to consume post-exit for background processes
            // removing listeners can overflow OS buffer and block subprocesses
            // destroying (e.g. child.stdout.destroy()) can terminate subprocesses via SIGPIPE
            if (!exited) {
              output += stripAnsi(data.toString());
              if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
                setPendingHistoryItem({
                  type: 'info',
                  text: output,
                });
                lastUpdateTime = Date.now();
              }
            }
          };
          child.stdout.on('data', handleOutput);
          child.stderr.on('data', handleOutput);

          let error: Error | null = null;
          child.on('error', (err: Error) => {
            error = err;
          });

          const abortHandler = async () => {
            if (child.pid && !exited) {
              onDebugMessage(
                `Aborting shell command (PID: ${child.pid}) due to signal.`,
              );
              try {
                // attempt to SIGTERM process group (negative PID)
                // fall back to SIGKILL (to group) after 200ms
                process.kill(-child.pid, 'SIGTERM');
                await new Promise((resolve) => setTimeout(resolve, 200));
                if (child.pid && !exited) {
                  process.kill(-child.pid, 'SIGKILL');
                }
              } catch (_e) {
                // if group kill fails, fall back to killing just the main process
                try {
                  if (child.pid) {
                    child.kill('SIGKILL');
                  }
                } catch (_e) {
                  console.error(
                    `failed to kill shell process ${child.pid}: ${_e}`,
                  );
                }
              }
            }
          };

          abortSignal.addEventListener('abort', abortHandler, { once: true });

          child.on('exit', (code, signal) => {
            exited = true;
            abortSignal.removeEventListener('abort', abortHandler);
            setPendingHistoryItem(null);
            output = output.trim() || '(Command produced no output)';
            if (error) {
              const text = `${error.message.replace(commandToExecute, rawQuery)}\n${output}`;
              addItemToHistory({ type: 'error', text }, userMessageTimestamp);
            } else if (code !== null && code !== 0) {
              const text = `Command exited with code ${code}\n${output}`;
              addItemToHistory({ type: 'error', text }, userMessageTimestamp);
            } else if (abortSignal.aborted) {
              addItemToHistory(
                {
                  type: 'info',
                  text: `Command was cancelled.\n${output}`,
                },
                userMessageTimestamp,
              );
            } else if (signal) {
              const text = `Command terminated with signal ${signal}.\n${output}`;
              addItemToHistory({ type: 'error', text }, userMessageTimestamp);
            } else {
              addItemToHistory(
                { type: 'info', text: output + '\n' },
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
        }
      });

      try {
        onExec(execPromise);
      } catch (_e) {
        // silently ignore errors from this since it's from the caller
      }

      return true; // Command was initiated
    },
    [
      config,
      onDebugMessage,
      addItemToHistory,
      setPendingHistoryItem,
      onExec,
      executeCommand,
    ],
  );

  return { handleShellCommand };
};
