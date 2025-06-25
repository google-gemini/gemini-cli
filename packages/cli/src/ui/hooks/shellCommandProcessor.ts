/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import type { HistoryItemWithoutId } from '../types.js';
import { useCallback } from 'react';
import { Config, GeminiClient } from '@google/gemini-cli-core';
import { type PartListUnion } from '@google/genai';
import { formatMemoryUsage } from '../utils/formatters.js';
import { isBinary } from '../utils/textUtils.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import stripAnsi from 'strip-ansi';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const MAX_OUTPUT_LENGTH = 10000;

/**
 * A structured result from a shell command execution.
 */
interface ShellExecutionResult {
  rawOutput: Buffer;
  output: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
  aborted: boolean;
}

/**
 * Executes a shell command using `spawn`, capturing all output and lifecycle events.
 * This is the single, unified implementation for shell execution.
 *
 * @param commandToExecute The exact command string to run.
 * @param cwd The working directory to execute the command in.
 * @param abortSignal An AbortSignal to terminate the process.
 * @param onOutputChunk A callback for streaming real-time output.
 * @param onDebugMessage A callback for logging debug information.
 * @returns A promise that resolves with the complete execution result.
 */
function executeShellCommand(
  commandToExecute: string,
  cwd: string,
  abortSignal: AbortSignal,
  onOutputChunk: (chunk: string) => void,
  onDebugMessage: (message: string) => void,
): Promise<ShellExecutionResult> {
  return new Promise((resolve) => {
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : 'bash';
    const shellArgs = isWindows
      ? ['/c', commandToExecute]
      : ['-c', commandToExecute];

    const child = spawn(shell, shellArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows, // Use process groups on non-Windows for robust killing
    });

    // Use decoders to handle multi-byte characters safely (for streaming output).
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    let stdout = '';
    let stderr = '';
    const outputChunks: Buffer[] = [];
    let error: Error | null = null;
    let exited = false;

    let streamToUi = true;
    const MAX_SNIFF_SIZE = 4096;
    let sniffedBytes = 0;

    const handleOutput = (data: Buffer, stream: 'stdout' | 'stderr') => {
      outputChunks.push(data);

      if (streamToUi && sniffedBytes < MAX_SNIFF_SIZE) {
        // Use a limited-size buffer for the check to avoid performance issues.
        const sniffBuffer = Buffer.concat(outputChunks.slice(0, 20));
        sniffedBytes = sniffBuffer.length;

        if (isBinary(sniffBuffer)) {
          streamToUi = false;
          // Overwrite any garbled text that may have streamed with a clear message.
          onOutputChunk('[Binary output detected. Halting stream...]');
        }
      }

      const decodedChunk =
        stream === 'stdout'
          ? stdoutDecoder.write(data)
          : stderrDecoder.write(data);
      if (stream === 'stdout') {
        stdout += stripAnsi(decodedChunk);
      } else {
        stderr += stripAnsi(decodedChunk);
      }

      if (!exited && streamToUi) {
        // Send only the new chunk to avoid re-rendering the whole output.
        const combinedOutput = stdout + (stderr ? `\n${stderr}` : '');
        onOutputChunk(combinedOutput);
      } else if (!exited && !streamToUi) {
        // Send progress updates for the binary stream
        const totalBytes = outputChunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        onOutputChunk(
          `[Receiving binary output... ${formatMemoryUsage(totalBytes)} received]`,
        );
      }
    };

    child.stdout.on('data', (data) => handleOutput(data, 'stdout'));
    child.stderr.on('data', (data) => handleOutput(data, 'stderr'));
    child.on('error', (err) => {
      error = err;
    });

    const abortHandler = async () => {
      if (child.pid && !exited) {
        onDebugMessage(`Aborting shell command (PID: ${child.pid})`);
        if (isWindows) {
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
        } else {
          try {
            // Kill the entire process group (negative PID).
            // SIGTERM first, then SIGKILL if it doesn't die.
            process.kill(-child.pid, 'SIGTERM');
            await new Promise((res) => setTimeout(res, 200));
            if (!exited) {
              process.kill(-child.pid, 'SIGKILL');
            }
          } catch (_e) {
            // Fallback to killing just the main process if group kill fails.
            if (!exited) child.kill('SIGKILL');
          }
        }
      }
    };

    abortSignal.addEventListener('abort', abortHandler, { once: true });

    child.on('exit', (code, signal) => {
      exited = true;
      abortSignal.removeEventListener('abort', abortHandler);

      // Handle any final bytes lingering in the decoders
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();

      const finalBuffer = Buffer.concat(outputChunks);

      resolve({
        rawOutput: finalBuffer,
        output: stdout + (stderr ? `\n${stderr}` : ''),
        exitCode: code,
        signal,
        error,
        aborted: abortSignal.aborted,
      });
    });
  });
}

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

      const execPromise = new Promise<void>((resolve) => {
        let lastUpdateTime = 0;

        onDebugMessage(`Executing in ${targetDir}: ${commandToExecute}`);
        executeShellCommand(
          commandToExecute,
          targetDir,
          abortSignal,
          (streamedOutput) => {
            // Throttle pending UI updates to avoid excessive re-renders.
            if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
              setPendingHistoryItem({ type: 'info', text: streamedOutput });
              lastUpdateTime = Date.now();
            }
          },
          onDebugMessage,
        )
          .then((result) => {
            // TODO(abhipatel12) - Consider updating pending item and using timeout to ensure
            // there is no jump where intermediate output is skipped.
            setPendingHistoryItem(null);

            let historyItemType: HistoryItemWithoutId['type'] = 'info';
            let mainContent: string;

            // The context sent to the model utilizes a text tokenizer which means raw binary data is
            // cannot be parsed and understood and thus would only pollute the context window and waste
            // tokens.
            if (isBinary(result.rawOutput)) {
              mainContent =
                '[Command produced binary output, which is not shown.]';
            } else {
              mainContent =
                result.output.trim() || '(Command produced no output)';
            }

            let finalOutput = mainContent;

            if (result.error) {
              historyItemType = 'error';
              finalOutput = `${result.error.message}\n${finalOutput}`;
            } else if (result.aborted) {
              finalOutput = `Command was cancelled.\n${finalOutput}`;
            } else if (result.signal) {
              historyItemType = 'error';
              finalOutput = `Command terminated by signal: ${result.signal}.\n${finalOutput}`;
            } else if (result.exitCode !== 0) {
              historyItemType = 'error';
              finalOutput = `Command exited with code ${result.exitCode}.\n${finalOutput}`;
            }

            if (pwdFilePath && fs.existsSync(pwdFilePath)) {
              const finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
              if (finalPwd && finalPwd !== targetDir) {
                const warning = `WARNING: shell mode is stateless; the directory change to '${finalPwd}' will not persist.`;
                finalOutput = `${warning}\n\n${finalOutput}`;
              }
            }

            // Add the complete, contextual result to the local UI history.
            addItemToHistory(
              { type: historyItemType, text: finalOutput },
              userMessageTimestamp,
            );

            // Add the same complete, contextual result to the LLM's history.
            addShellCommandToGeminiHistory(geminiClient, rawQuery, finalOutput);
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
            if (pwdFilePath && fs.existsSync(pwdFilePath)) {
              fs.unlinkSync(pwdFilePath);
            }
            resolve();
          });
      });

      onExec(execPromise);
      return true; // Command was initiated
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
