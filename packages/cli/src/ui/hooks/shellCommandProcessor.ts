/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, execSync } from 'child_process';
import { TextDecoder } from 'util';
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
import { detect as chardetDetect } from 'chardet';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const MAX_OUTPUT_LENGTH = 10000;

// Cache for system encoding to avoid repeated detection
let cachedSystemEncoding: string | null = null;

/**
 * Returns the system encoding, caching the result to avoid repeated system calls.
 * If system encoding detection fails, falls back to detecting from the provided buffer.
 * Note: Only the system encoding is cached - buffer-based detection runs for each buffer
 * since different buffers may have different encodings.
 * @param buffer A buffer to use for detecting encoding if system detection fails.
 */
function getEncodingForBuffer(buffer: Buffer): string {
  // Cache system encoding detection since it's system-wide
  if (cachedSystemEncoding === null) {
    cachedSystemEncoding = getSystemEncoding();
  }
  
  // If we have a cached system encoding, use it
  if (cachedSystemEncoding) {
    return cachedSystemEncoding;
  }
  
  // Otherwise, detect from this specific buffer (don't cache this result)
  return detectEncodingFromBuffer(buffer) || 'utf-8';
}

function getSystemEncoding() {
  // Windows
  if (os.platform() === 'win32') {
    try {
      const output = execSync('chcp', { encoding: 'utf8' });
      const match = output.match(/:\s*(\d+)/);
      if (match) {
        const codePage = parseInt(match[1], 10);
        if (!isNaN(codePage)) {
          return windowsCodePageToEncoding(codePage);
        }
      }
      // Only warn if we can't parse the output format, not if windowsCodePageToEncoding fails
      throw new Error(
        `Unable to parse Windows code page from 'chcp' output "${output.trim()}". `
      );
    } catch (error) {
      console.warn(
        `Failed to get Windows code page using 'chcp' command: ${error instanceof Error ? error.message : String(error)}. ` +
        `Will attempt to detect encoding from command output instead.`
      );
    }
    return null;
  }

  // Unix-like
  // Use environment variables LC_ALL, LC_CTYPE, and LANG to determine the
  // system encoding. However, these environment variables might not always 
  // be set or accurate. Handle cases where none of these variables are set.
  const env = process.env;
  let locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';

  // Fallback to querying the system directly when environment variables are missing
  if (!locale) {
    try {
      locale = execSync('locale charmap', { encoding: 'utf8' }).toString().trim();
    } catch (_e) {
      console.warn('Failed to get locale charmap.');
      return null;
    }
  }

  const match = locale.match(/\.(.+)/); // e.g., "en_US.UTF-8"
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  // Handle cases where locale charmap returns just the encoding name (e.g., "UTF-8")
  if (locale && !locale.includes('.')) {
    return locale.toLowerCase();
  }

  return null;
}

function windowsCodePageToEncoding(cp: number) {
  // Most common mappings; extend as needed
  const map: { [key: number]: string } = {
    437: 'cp437',
    850: 'cp850',
    852: 'cp852',
    866: 'cp866',
    874: 'windows-874',
    932: 'shift_jis',
    936: 'gb2312',
    949: 'euc-kr',
    950: 'big5',
    1200: 'utf-16le',
    1201: 'utf-16be',
    1250: 'windows-1250',
    1251: 'windows-1251',
    1252: 'windows-1252',
    1253: 'windows-1253',
    1254: 'windows-1254',
    1255: 'windows-1255',
    1256: 'windows-1256',
    1257: 'windows-1257',
    1258: 'windows-1258',
    65001: 'utf-8'
  };

  if (map[cp]) {
    return map[cp];
  }

  console.warn(`Unable to determine encoding for windows code page ${cp}.`);
  return null; // Return null if no mapping found
}

/**
 * Attempts to detect encoding from a buffer using chardet.
 * This is useful when system encoding detection fails.
 */
function detectEncodingFromBuffer(buffer: Buffer): string | null {
  try {
    const detected = chardetDetect(buffer);
    if (detected && typeof detected === 'string') {
      return detected.toLowerCase();
    }
  } catch (error) {
    console.warn('Failed to detect encoding with chardet:', error);
  }
  
  return null;
}

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
    let stdoutDecoder: TextDecoder | null = null;
    let stderrDecoder: TextDecoder | null = null;

    let stdout = '';
    let stderr = '';
    const outputChunks: Buffer[] = [];
    let error: Error | null = null;
    let exited = false;

    let streamToUi = true;
    const MAX_SNIFF_SIZE = 4096;
    let sniffedBytes = 0;

    const handleOutput = (data: Buffer, stream: 'stdout' | 'stderr') => {

      if (!stdoutDecoder || !stderrDecoder) {
        const encoding = getEncodingForBuffer(data);
        stdoutDecoder = new TextDecoder(encoding);
        stderrDecoder = new TextDecoder(encoding);
      }

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
          ? stdoutDecoder.decode(data, { stream: true })
          : stderrDecoder.decode(data, { stream: true });
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
      if (stdoutDecoder) {
        stdout += stdoutDecoder.decode();
      }
      if (stderrDecoder) {
        stderr += stderrDecoder.decode();
      }

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
