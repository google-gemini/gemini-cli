/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PtyImplementation } from '../utils/getPty.js';
import { getPty } from '../utils/getPty.js';
import { spawn as cpSpawn } from 'node:child_process';
import { TextDecoder } from 'node:util';
import os from 'node:os';
import { getCachedEncodingForBuffer } from '../utils/systemEncoding.js';
import { isBinary } from '../utils/textUtils.js';
import pkg from '@xterm/headless';
import stripAnsi from 'strip-ansi';
const { Terminal } = pkg;

const SIGKILL_TIMEOUT_MS = 200;

// @ts-expect-error getFullText is not a public API.
const getFullText = (terminal: Terminal) => {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    lines.push(line ? line.translateToString(true) : '');
  }
  return lines.join('\n').trim();
};

/** A structured result from a shell command execution. */
export interface ShellExecutionResult {
  /** The raw, unprocessed output buffer. */
  rawOutput: Buffer;
  /** The combined, decoded output as a string. */
  output: string;
  /** The process exit code, or null if terminated by a signal. */
  exitCode: number | null;
  /** The signal that terminated the process, if any. */
  signal: number | null;
  /** An error object if the process failed to spawn. */
  error: Error | null;
  /** A boolean indicating if the command was aborted by the user. */
  aborted: boolean;
  /** The process ID of the spawned shell. */
  pid: number | undefined;
  /** The method used to execute the shell command. */
  executionMethod: 'lydell-node-pty' | 'node-pty' | 'child_process' | 'none';
}

/** A handle for an ongoing shell execution. */
export interface ShellExecutionHandle {
  /** The process ID of the spawned shell. */
  pid: number | undefined;
  /** A promise that resolves with the complete execution result. */
  result: Promise<ShellExecutionResult>;
}

/**
 * Describes a structured event emitted during shell command execution.
 */
export type ShellOutputEvent =
  | {
      /** The event contains a chunk of output data. */
      type: 'data';
      /** The decoded string chunk. */
      chunk: string;
    }
  | {
      /** Signals that the output stream has been identified as binary. */
      type: 'binary_detected';
    }
  | {
      /** Provides progress updates for a binary stream. */
      type: 'binary_progress';
      /** The total number of bytes received so far. */
      bytesReceived: number;
    };

/**
 * A centralized service for executing shell commands with robust process
 * management, cross-platform compatibility, and streaming output capabilities.
 *
 */
export class ShellExecutionService {
  /**
   * Executes a shell command using `node-pty`, capturing all output and lifecycle events.
   *
   * @param commandToExecute The exact command string to run.
   * @param cwd The working directory to execute the command in.
   * @param onOutputEvent A callback for streaming structured events about the execution, including data chunks and status updates.
   * @param abortSignal An AbortSignal to terminate the process and its children.
   * @returns An object containing the process ID (pid) and a promise that
   *          resolves with the complete execution result.
   */
  static async execute(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    shouldUseNodePty: boolean,
    terminalColumns?: number,
    terminalRows?: number,
  ): Promise<ShellExecutionHandle> {
    if (shouldUseNodePty) {
      const ptyInfo = await getPty();
      if (ptyInfo) {
        try {
          return this.executeWithPty(
            commandToExecute,
            cwd,
            onOutputEvent,
            abortSignal,
            terminalColumns,
            terminalRows,
            ptyInfo,
          );
        } catch (_e) {
          // Fallback to child_process
        }
      }
    }

    return this.childProcessFallback(
      commandToExecute,
      cwd,
      onOutputEvent,
      abortSignal,
    );
  }

  private static childProcessFallback(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
  ): ShellExecutionHandle {
    try {
      const isWindows = os.platform() === 'win32';

      const child = cpSpawn(commandToExecute, [], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsVerbatimArguments: true,
        shell: isWindows ? true : 'bash',
        detached: !isWindows,
        env: {
          ...process.env,
          GEMINI_CLI: '1',
          TERM: 'xterm-256color',
          PAGER: 'cat',
        },
      });

      const result = new Promise<ShellExecutionResult>((resolve) => {
        let stdoutDecoder: TextDecoder | null = null;
        let stderrDecoder: TextDecoder | null = null;

        let stdout = '';
        let stderr = '';
        const outputChunks: Buffer[] = [];
        let error: Error | null = null;
        let exited = false;

        let isStreamingRawContent = true;
        const MAX_SNIFF_SIZE = 4096;
        let sniffedBytes = 0;

        const handleOutput = (data: Buffer, stream: 'stdout' | 'stderr') => {
          if (!stdoutDecoder || !stderrDecoder) {
            const encoding = getCachedEncodingForBuffer(data);
            try {
              stdoutDecoder = new TextDecoder(encoding);
              stderrDecoder = new TextDecoder(encoding);
            } catch {
              stdoutDecoder = new TextDecoder('utf-8');
              stderrDecoder = new TextDecoder('utf-8');
            }
          }

          outputChunks.push(data);

          if (isStreamingRawContent && sniffedBytes < MAX_SNIFF_SIZE) {
            const sniffBuffer = Buffer.concat(outputChunks.slice(0, 20));
            sniffedBytes = sniffBuffer.length;

            if (isBinary(sniffBuffer)) {
              isStreamingRawContent = false;
              onOutputEvent({ type: 'binary_detected' });
            }
          }

          const decoder = stream === 'stdout' ? stdoutDecoder : stderrDecoder;
          const decodedChunk = decoder.decode(data, { stream: true });
          const strippedChunk = stripAnsi(decodedChunk);

          if (stream === 'stdout') {
            stdout += strippedChunk;
          } else {
            stderr += strippedChunk;
          }

          if (isStreamingRawContent) {
            onOutputEvent({ type: 'data', chunk: strippedChunk });
          } else {
            const totalBytes = outputChunks.reduce(
              (sum, chunk) => sum + chunk.length,
              0,
            );
            onOutputEvent({
              type: 'binary_progress',
              bytesReceived: totalBytes,
            });
          }
        };

        const handleExit = (
          code: number | null,
          signal: NodeJS.Signals | null,
        ) => {
          const { finalBuffer } = cleanup();
          // Ensure we don't add an extra newline if stdout already ends with one.
          const separator = stdout.endsWith('\n') ? '' : '\n';
          const combinedOutput =
            stdout + (stderr ? (stdout ? separator : '') + stderr : '');

          resolve({
            rawOutput: finalBuffer,
            output: combinedOutput.trim(),
            exitCode: code,
            signal: signal ? os.constants.signals[signal] : null,
            error,
            aborted: abortSignal.aborted,
            pid: child.pid,
            executionMethod: 'child_process',
          });
        };

        child.stdout.on('data', (data) => handleOutput(data, 'stdout'));
        child.stderr.on('data', (data) => handleOutput(data, 'stderr'));
        child.on('error', (err) => {
          error = err;
          handleExit(1, null);
        });

        const abortHandler = async () => {
          if (child.pid && !exited) {
            if (isWindows) {
              cpSpawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
            } else {
              try {
                process.kill(-child.pid, 'SIGTERM');
                await new Promise((res) => setTimeout(res, SIGKILL_TIMEOUT_MS));
                if (!exited) {
                  process.kill(-child.pid, 'SIGKILL');
                }
              } catch (_e) {
                if (!exited) child.kill('SIGKILL');
              }
            }
          }
        };

        abortSignal.addEventListener('abort', abortHandler, { once: true });

        child.on('exit', (code, signal) => {
          handleExit(code, signal);
        });

        function cleanup() {
          exited = true;
          abortSignal.removeEventListener('abort', abortHandler);
          if (stdoutDecoder) {
            const remaining = stdoutDecoder.decode();
            if (remaining) {
              stdout += stripAnsi(remaining);
            }
          }
          if (stderrDecoder) {
            const remaining = stderrDecoder.decode();
            if (remaining) {
              stderr += stripAnsi(remaining);
            }
          }

          const finalBuffer = Buffer.concat(outputChunks);

          return { stdout, stderr, finalBuffer };
        }
      });

      return { pid: child.pid, result };
    } catch (e) {
      const error = e as Error;
      return {
        pid: undefined,
        result: Promise.resolve({
          error,
          rawOutput: Buffer.from(''),
          output: '',
          exitCode: 1,
          signal: null,
          aborted: false,
          pid: undefined,
          executionMethod: 'none',
        }),
      };
    }
  }

  private static executeWithPty(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    terminalColumns: number | undefined,
    terminalRows: number | undefined,
    ptyInfo: PtyImplementation | undefined,
  ): ShellExecutionHandle {
    try {
      const cols = terminalColumns ?? 80;
      const rows = terminalRows ?? 30;
      const isWindows = os.platform() === 'win32';
      const shell = isWindows ? 'cmd.exe' : 'bash';
      const args = isWindows
        ? `/c ${commandToExecute}`
        : ['-c', commandToExecute];

      const ptyProcess = ptyInfo?.module.spawn(shell, args, {
        cwd,
        name: 'xterm-color',
        cols,
        rows,
        env: {
          ...process.env,
          GEMINI_CLI: '1',
          TERM: 'xterm-256color',
          PAGER: 'cat',
        },
        handleFlowControl: true,
      });

      const result = new Promise<ShellExecutionResult>((resolve) => {
        const headlessTerminal = new Terminal({
          allowProposedApi: true,
          cols,
          rows,
        });
        let processingChain = Promise.resolve();
        let decoder: TextDecoder | null = null;
        let output = '';
        const outputChunks: Buffer[] = [];
        const error: Error | null = null;
        let exited = false;

        let isStreamingRawContent = true;
        const MAX_SNIFF_SIZE = 4096;
        let sniffedBytes = 0;

        const handleOutput = (data: Buffer) => {
          processingChain = processingChain.then(
            () =>
              new Promise<void>((resolve) => {
                if (!decoder) {
                  const encoding = getCachedEncodingForBuffer(data);
                  try {
                    decoder = new TextDecoder(encoding);
                  } catch {
                    decoder = new TextDecoder('utf-8');
                  }
                }

                outputChunks.push(data);

                if (isStreamingRawContent && sniffedBytes < MAX_SNIFF_SIZE) {
                  const sniffBuffer = Buffer.concat(outputChunks.slice(0, 20));
                  sniffedBytes = sniffBuffer.length;

                  if (isBinary(sniffBuffer)) {
                    isStreamingRawContent = false;
                    onOutputEvent({ type: 'binary_detected' });
                  }
                }

                if (isStreamingRawContent) {
                  const decodedChunk = decoder.decode(data, { stream: true });
                  headlessTerminal.write(decodedChunk, () => {
                    const newStrippedOutput = getFullText(headlessTerminal);
                    output = newStrippedOutput;
                    onOutputEvent({ type: 'data', chunk: newStrippedOutput });
                    resolve();
                  });
                } else {
                  const totalBytes = outputChunks.reduce(
                    (sum, chunk) => sum + chunk.length,
                    0,
                  );
                  onOutputEvent({
                    type: 'binary_progress',
                    bytesReceived: totalBytes,
                  });
                  resolve();
                }
              }),
          );
        };

        ptyProcess.onData((data: string) => {
          const bufferData = Buffer.from(data, 'utf-8');
          handleOutput(bufferData);
        });

        ptyProcess.onExit(
          ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
            exited = true;
            abortSignal.removeEventListener('abort', abortHandler);

            processingChain.then(() => {
              const finalBuffer = Buffer.concat(outputChunks);

              resolve({
                rawOutput: finalBuffer,
                output,
                exitCode,
                signal: signal ?? null,
                error,
                aborted: abortSignal.aborted,
                pid: ptyProcess.pid,
                executionMethod: ptyInfo?.name ?? 'node-pty',
              });
            });
          },
        );

        const abortHandler = async () => {
          if (ptyProcess.pid && !exited) {
            ptyProcess.kill('SIGHUP');
          }
        };

        abortSignal.addEventListener('abort', abortHandler, { once: true });
      });

      return { pid: ptyProcess.pid, result };
    } catch (e) {
      const error = e as Error;
      return {
        pid: undefined,
        result: Promise.resolve({
          error,
          rawOutput: Buffer.from(''),
          output: '',
          exitCode: 1,
          signal: null,
          aborted: false,
          pid: undefined,
          executionMethod: 'none',
        }),
      };
    }
  }
}
