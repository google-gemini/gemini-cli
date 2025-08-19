/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';
import { useCallback } from 'react';
import {
  Config,
  GeminiClient,
  isBinary,
  ShellExecutionResult,
  ShellExecutionService,
} from '@google/gemini-cli-core';
import { type PartListUnion } from '@google/genai';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { SHELL_COMMAND_NAME } from '../constants.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const MAX_OUTPUT_LENGTH = 10000;

function addShellCommandToGeminiHistory(
  geminiClient: GeminiClient,
  rawQuery: string,
  resultText: string,
) {
  const modelContent =
    resultText.length > MAX_OUTPUT_LENGTH
      ? resultText.substring(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)'
      : resultText;

  geminiClient.addHistory({
    role: 'user',
    parts: [
      {
        text: `I ran the following shell command:
\`\`\`sh
${rawQuery}
\`\`\`

This produced the following result:
\`\`\`
${modelContent}
\`\`\``,
      },
    ],
  });
}

/**
 * Hook to process shell commands.
 * Orchestrates command execution and updates history and agent context.
 */
export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
  onExec: (command: Promise<void>) => void,
  onDebugMessage: (message: string) => void,
  config: Config,
  geminiClient: GeminiClient,
) => {
  const handleShellCommand = useCallback(
    (rawQuery: PartListUnion, abortSignal: AbortSignal): boolean => {
      if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
        return false;
      }

      const userMessageTimestamp = Date.now();
      const callId = `shell-${userMessageTimestamp}`;
      addItemToHistory(
        { type: 'user_shell', text: rawQuery },
        userMessageTimestamp,
      );

      const isWindows = os.platform() === 'win32';
      const targetDir = config.getTargetDir();
      let commandToExecute = rawQuery;
      let pwdFilePath: string | undefined;

      // On non-windows, wrap the command to capture the final working directory.
      if (!isWindows) {
        let command = rawQuery.trim();
        const pwdFileName = `shell_pwd_${crypto.randomBytes(6).toString('hex')}.tmp`;
        pwdFilePath = path.join(os.tmpdir(), pwdFileName);
        // Ensure command ends with a separator before adding our own.
        if (!command.endsWith(';') && !command.endsWith('&')) {
          command += ';';
        }
        commandToExecute = `{ ${command} }; __code=$?; pwd > "${pwdFilePath}"; exit $__code`;
      }

      const executeCommand = async (
        resolve: (value: void | PromiseLike<void>) => void,
      ) => {
        let lastUpdateTime = Date.now();
        let cumulativeStdout = '';
        let isBinaryStream = false;
        let binaryBytesReceived = 0;

        const initialToolDisplay: IndividualToolCallDisplay = {
          callId,
          name: SHELL_COMMAND_NAME,
          description: rawQuery,
          status: ToolCallStatus.Executing,
          resultDisplay: '',
          confirmationDetails: undefined,
        };

        setPendingHistoryItem({
          type: 'tool_group',
          tools: [initialToolDisplay],
        });

        let executionPid: number | undefined;

        const abortHandler = () => {
          onDebugMessage(
            `Aborting shell command (PID: ${executionPid ?? 'unknown'})`,
          );
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });

        onDebugMessage(`Executing in ${targetDir}: ${commandToExecute}`);

        try {
          const { pid, result } = await ShellExecutionService.execute(
            commandToExecute,
            targetDir,
            (event) => {
              switch (event.type) {
                case 'data':
                  // Do not process text data if we've already switched to binary mode.
                  if (isBinaryStream) break;
                  cumulativeStdout += event.chunk;
                  break;
                case 'binary_detected':
                  isBinaryStream = true;
                  break;
                case 'binary_progress':
                  isBinaryStream = true;
                  binaryBytesReceived = event.bytesReceived;
                  break;
                default: {
                  throw new Error('An unhandled ShellOutputEvent was found.');
                }
              }

              // Compute the display string based on the *current* state.
              let currentDisplayOutput: string;
              if (isBinaryStream) {
                if (binaryBytesReceived > 0) {
                  currentDisplayOutput = `[Receiving binary output... ${formatMemoryUsage(
                    binaryBytesReceived,
                  )} received]`;
                } else {
                  currentDisplayOutput =
                    '[Binary output detected. Halting stream...]';
                }
              } else {
                currentDisplayOutput = cumulativeStdout;
              }

              // Throttle pending UI updates to avoid excessive re-renders.
              if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
                setPendingHistoryItem({
                  type: 'tool_group',
                  tools: [
                    {
                      ...initialToolDisplay,
                      resultDisplay: currentDisplayOutput,
                    },
                  ],
                });
                lastUpdateTime = Date.now();
              }
            },
            abortSignal,
            config.getShouldUseNodePtyShell(),
          );

          executionPid = pid;

          result
            .then((result: ShellExecutionResult) => {
              setPendingHistoryItem(null);

              let mainContent: string;

              if (isBinary(result.rawOutput)) {
                mainContent =
                  '[Command produced binary output, which is not shown.]';
              } else {
                mainContent =
                  result.output.trim() || '(Command produced no output)';
              }

              let finalOutput = mainContent;
              let finalStatus = ToolCallStatus.Success;

              if (result.error) {
                finalStatus = ToolCallStatus.Error;
                finalOutput = `${result.error.message}\n${finalOutput}`;
              } else if (result.aborted) {
                finalStatus = ToolCallStatus.Canceled;
                finalOutput = `Command was cancelled.\n${finalOutput}`;
              } else if (result.signal) {
                finalStatus = ToolCallStatus.Error;
                finalOutput = `Command terminated by signal: ${result.signal}.\n${finalOutput}`;
              } else if (result.exitCode !== 0) {
                finalStatus = ToolCallStatus.Error;
                finalOutput = `Command exited with code ${result.exitCode}.\n${finalOutput}`;
              }

              if (pwdFilePath && fs.existsSync(pwdFilePath)) {
                const finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
                if (finalPwd && finalPwd !== targetDir) {
                  const warning = `WARNING: shell mode is stateless; the directory change to '${finalPwd}' will not persist.`;
                  finalOutput = `${warning}\n\n${finalOutput}`;
                }
              }

              const finalToolDisplay: IndividualToolCallDisplay = {
                ...initialToolDisplay,
                status: finalStatus,
                resultDisplay: finalOutput,
              };

              // Add the complete, contextual result to the local UI history.
              addItemToHistory(
                {
                  type: 'tool_group',
                  tools: [finalToolDisplay],
                } as HistoryItemWithoutId,
                userMessageTimestamp,
              );

              // Add the same complete, contextual result to the LLM's history.
              addShellCommandToGeminiHistory(
                geminiClient,
                rawQuery,
                finalOutput,
              );
            })
            .catch((err) => {
              setPendingHistoryItem(null);
              const errorMessage =
                err instanceof Error ? err.message : String(err);
              addItemToHistory(
                {
                  type: 'error',
                  text: `An unexpected error occurred: ${errorMessage}`,
                },
                userMessageTimestamp,
              );
            })
            .finally(() => {
              abortSignal.removeEventListener('abort', abortHandler);
              if (pwdFilePath && fs.existsSync(pwdFilePath)) {
                fs.unlinkSync(pwdFilePath);
              }
              resolve();
            });
        } catch (err) {
          // This block handles synchronous errors from `execute`
          setPendingHistoryItem(null);
          const errorMessage = err instanceof Error ? err.message : String(err);
          addItemToHistory(
            {
              type: 'error',
              text: `An unexpected error occurred: ${errorMessage}`,
            },
            userMessageTimestamp,
          );

          // Perform cleanup here as well
          if (pwdFilePath && fs.existsSync(pwdFilePath)) {
            fs.unlinkSync(pwdFilePath);
          }

          resolve(); // Resolve the promise to unblock `onExec`
        }
      };

      const execPromise = new Promise<void>((resolve) => {
        executeCommand(resolve);
      });

      onExec(execPromise);
      return true;
    },
    [
      config,
      onDebugMessage,
      addItemToHistory,
      setPendingHistoryItem,
      onExec,
      geminiClient,
    ],
  );

  return { handleShellCommand };
};
