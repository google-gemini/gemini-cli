/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import type { PtyImplementation } from '../utils/getPty.js';
import { getPty } from '../utils/getPty.js';
import { spawn as cpSpawn } from 'node:child_process';
import { TextDecoder } from 'node:util';
import os from 'node:os';
import type { IPty } from '@lydell/node-pty';
import { getCachedEncodingForBuffer } from '../utils/systemEncoding.js';
import { isBinary } from '../utils/textUtils.js';
import pkg from '@xterm/headless';
import {
  serializeTerminalToObject,
  type AnsiOutput,
} from '../utils/terminalSerializer.js';
const { Terminal } = pkg;

const SIGKILL_TIMEOUT_MS = 200;

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

export interface ShellExecutionConfig {
  terminalWidth?: number;
  terminalHeight?: number;
  pager?: string;
  showColor?: boolean;
  defaultFg?: string;
  defaultBg?: string;
  // Used for testing
  disableDynamicLineTrimming?: boolean;
}

/**
 * Describes a structured event emitted during shell command execution.
 */
export type ShellOutputEvent =
  | {
      /** The event contains a chunk of output data. */
      type: 'data';
      /** The decoded string chunk. */
      chunk: string | AnsiOutput;
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

interface ActivePty {
  ptyProcess: IPty;
  headlessTerminal: pkg.Terminal;
}

const getFullBufferText = (terminal: pkg.Terminal): string => {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    const lineContent = line ? line.translateToString() : '';
    lines.push(lineContent);
  }
  return lines.join('\n').trimEnd();
};

/**
 * A centralized service for executing shell commands with robust process
 * management, cross-platform compatibility, and streaming output capabilities.
 *
 */

export class ShellExecutionService {
  private static activePtys = new Map<number, ActivePty>();
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
    shellExecutionConfig: ShellExecutionConfig,
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
            shellExecutionConfig,
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
            }
          }

          if (isStreamingRawContent) {
            const decoder = stream === 'stdout' ? stdoutDecoder : stderrDecoder;
            const decodedChunk = decoder.decode(data, { stream: true });

            if (stream === 'stdout') {
              stdout += decodedChunk;
            } else {
              stderr += decodedChunk;
            }
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

          const finalStrippedOutput = stripAnsi(combinedOutput).trim();

          if (isStreamingRawContent) {
            if (finalStrippedOutput) {
              onOutputEvent({ type: 'data', chunk: finalStrippedOutput });
            }
          } else {
            onOutputEvent({ type: 'binary_detected' });
          }

          resolve({
            rawOutput: finalBuffer,
            output: finalStrippedOutput,
            exitCode: code,
            signal: signal ? os.constants.signals[signal] : null,
            error,
            aborted: abortSignal.aborted,
            pid: undefined,
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
          if (child.pid) {
            this.activePtys.delete(child.pid);
          }
          handleExit(code, signal);
        });

        function cleanup() {
          exited = true;
          abortSignal.removeEventListener('abort', abortHandler);
          if (stdoutDecoder) {
            const remaining = stdoutDecoder.decode();
            if (remaining) {
              stdout += remaining;
            }
          }
          if (stderrDecoder) {
            const remaining = stderrDecoder.decode();
            if (remaining) {
              stderr += remaining;
            }
          }

          const finalBuffer = Buffer.concat(outputChunks);

          return { stdout, stderr, finalBuffer };
        }
      });

      return { pid: undefined, result };
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
    shellExecutionConfig: ShellExecutionConfig,
    ptyInfo: PtyImplementation,
  ): ShellExecutionHandle {
    if (!ptyInfo) {
      // This should not happen, but as a safeguard...
      throw new Error('PTY implementation not found');
    }
    try {
      const cols = shellExecutionConfig.terminalWidth ?? 80;
      const rows = shellExecutionConfig.terminalHeight ?? 30;
      const isWindows = os.platform() === 'win32';
      const shell = isWindows ? 'cmd.exe' : 'bash';
      const args = isWindows
        ? `/c ${commandToExecute}`
        : ['-c', commandToExecute];

      const ptyProcess = ptyInfo.module.spawn(shell, args, {
        cwd,
        name: 'xterm',
        cols,
        rows,
        env: {
          ...process.env,
          GEMINI_CLI: '1',
          TERM: 'xterm-256color',
          PAGER: shellExecutionConfig.pager ?? 'cat',
        },
        handleFlowControl: true,
      });

      const result = new Promise<ShellExecutionResult>((resolve) => {
        const headlessTerminal = new Terminal({
          allowProposedApi: true,
          cols,
          rows,
        });
        headlessTerminal.scrollToTop();

        this.activePtys.set(ptyProcess.pid, { ptyProcess, headlessTerminal });

        let processingChain = Promise.resolve();
        let decoder: TextDecoder | null = null;
        let output: string | AnsiOutput | null = null;
        const outputChunks: Buffer[] = [];
        const error: Error | null = null;
        let exited = false;

        let isStreamingRawContent = true;
        const MAX_SNIFF_SIZE = 4096;
        let sniffedBytes = 0;
        let isWriting = false;
        let hasStartedOutput = false;
        let renderTimeout: NodeJS.Timeout | null = null;

        const render = (finalRender = false) => {
          if (renderTimeout) {
            clearTimeout(renderTimeout);
          }

          const renderFn = () => {
            if (!isStreamingRawContent) {
              return;
            }

            if (!shellExecutionConfig.disableDynamicLineTrimming) {
              if (!hasStartedOutput) {
                const bufferText = getFullBufferText(headlessTerminal);
                if (bufferText.trim().length === 0) {
                  return;
                }
                hasStartedOutput = true;
              }
            }

            let newOutput: AnsiOutput;
            if (shellExecutionConfig.showColor) {
              newOutput = serializeTerminalToObject(headlessTerminal);
            } else {
              const buffer = headlessTerminal.buffer.active;
              const lines: AnsiOutput = [];
              for (let y = 0; y < headlessTerminal.rows; y++) {
                const line = buffer.getLine(buffer.viewportY + y);
                const lineContent = line ? line.translateToString(true) : '';
                lines.push([
                  {
                    text: lineContent,
                    bold: false,
                    italic: false,
                    underline: false,
                    dim: false,
                    inverse: false,
                    fg: '',
                    bg: '',
                  },
                ]);
              }
              newOutput = lines;
            }

            let lastNonEmptyLine = -1;
            for (let i = newOutput.length - 1; i >= 0; i--) {
              const line = newOutput[i];
              if (
                line
                  .map((segment) => segment.text)
                  .join('')
                  .trim().length > 0
              ) {
                lastNonEmptyLine = i;
                break;
              }
            }

            const trimmedOutput = newOutput.slice(0, lastNonEmptyLine + 1);

            const finalOutput = shellExecutionConfig.disableDynamicLineTrimming
              ? newOutput
              : trimmedOutput;

            // Using stringify for a quick deep comparison.
            if (JSON.stringify(output) !== JSON.stringify(finalOutput)) {
              output = finalOutput;
              onOutputEvent({
                type: 'data',
                chunk: finalOutput,
              });
            }
          };

          if (finalRender) {
            renderFn();
          } else {
            renderTimeout = setTimeout(renderFn, 17);
          }
        };

        headlessTerminal.onScroll(() => {
          if (!isWriting) {
            render();
          }
        });

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
                  isWriting = true;
                  headlessTerminal.write(decodedChunk, () => {
                    render();
                    isWriting = false;
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
            this.activePtys.delete(ptyProcess.pid);

            processingChain.then(() => {
              render(true);
              const finalBuffer = Buffer.concat(outputChunks);

              resolve({
                rawOutput: finalBuffer,
                output: getFullBufferText(headlessTerminal),
                exitCode,
                signal: signal ?? null,
                error,
                aborted: abortSignal.aborted,
                pid: ptyProcess.pid,
                executionMethod:
                  (ptyInfo?.name as 'node-pty' | 'lydell-node-pty') ??
                  'node-pty',
              });
            });
          },
        );

        const abortHandler = async () => {
          if (ptyProcess.pid && !exited) {
            if (os.platform() === 'win32') {
              ptyProcess.kill();
            } else {
              try {
                // Kill the entire process group
                process.kill(-ptyProcess.pid, 'SIGINT');
              } catch (_e) {
                // Fallback to killing just the process if the group kill fails
                ptyProcess.kill('SIGINT');
              }
            }
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

  /**
   * Writes a string to the pseudo-terminal (PTY) of a running process.
   *
   * @param pid The process ID of the target PTY.
   * @param input The string to write to the terminal.
   */
  static writeToPty(pid: number, input: string): void {
    if (!this.isPtyActive(pid)) {
      return;
    }

    const activePty = this.activePtys.get(pid);
    if (activePty) {
      activePty.ptyProcess.write(input);
    }
  }

  static isPtyActive(pid: number): boolean {
    try {
      // process.kill with signal 0 is a way to check for the existence of a process.
      // It doesn't actually send a signal.
      return process.kill(pid, 0);
    } catch (_) {
      return false;
    }
  }

  /**
   * Resizes the pseudo-terminal (PTY) of a running process.
   *
   * @param pid The process ID of the target PTY.
   * @param cols The new number of columns.
   * @param rows The new number of rows.
   */
  static resizePty(pid: number, cols: number, rows: number): void {
    if (!this.isPtyActive(pid)) {
      return;
    }

    const activePty = this.activePtys.get(pid);
    if (activePty) {
      try {
        activePty.ptyProcess.resize(cols, rows);
        activePty.headlessTerminal.resize(cols, rows);
      } catch (e) {
        // Ignore errors if the pty has already exited, which can happen
        // due to a race condition between the exit event and this call.
        if (e instanceof Error && 'code' in e && e.code === 'ESRCH') {
          // ignore
        } else {
          throw e;
        }
      }
    }
  }

  /**
   * Scrolls the pseudo-terminal (PTY) of a running process.
   *
   * @param pid The process ID of the target PTY.
   * @param lines The number of lines to scroll.
   */
  static scrollPty(pid: number, lines: number): void {
    if (!this.isPtyActive(pid)) {
      return;
    }

    const activePty = this.activePtys.get(pid);
    if (activePty) {
      try {
        activePty.headlessTerminal.scrollLines(lines);
        if (activePty.headlessTerminal.buffer.active.viewportY < 0) {
          activePty.headlessTerminal.scrollToTop();
        }
      } catch (e) {
        // Ignore errors if the pty has already exited, which can happen
        // due to a race condition between the exit event and this call.
        if (e instanceof Error && 'code' in e && e.code === 'ESRCH') {
          // ignore
        } else {
          throw e;
        }
      }
    }
  }
}
