/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import type { PtyImplementation } from '../utils/getPty.js';
import { getPty } from '../utils/getPty.js';
import { spawn as cpSpawn, type ChildProcess } from 'node:child_process';
import { TextDecoder } from 'node:util';
import os from 'node:os';
import type { IPty } from '@lydell/node-pty';
import { getCachedEncodingForBuffer } from '../utils/systemEncoding.js';
import {
  getShellConfiguration,
  resolveExecutable,
  type ShellType,
} from '../utils/shell-utils.js';
import { isBinary } from '../utils/textUtils.js';
import pkg from '@xterm/headless';
import {
  serializeTerminalToObject,
  type AnsiOutput,
} from '../utils/terminalSerializer.js';
import {
  sanitizeEnvironment,
  type EnvironmentSanitizationConfig,
} from './environmentSanitization.js';
import { killProcessGroup } from '../utils/process-utils.js';
const { Terminal } = pkg;

const MAX_CHILD_PROCESS_BUFFER_SIZE = 16 * 1024 * 1024; // 16MB

/**
 * An environment variable that is set for shell executions. This can be used
 * by downstream executables and scripts to identify that they were executed
 * from within Gemini CLI.
 */
export const GEMINI_CLI_IDENTIFICATION_ENV_VAR = 'GEMINI_CLI';

/**
 * The value of {@link GEMINI_CLI_IDENTIFICATION_ENV_VAR}
 */
export const GEMINI_CLI_IDENTIFICATION_ENV_VAR_VALUE = '1';

// We want to allow shell outputs that are close to the context window in size.
// 300,000 lines is roughly equivalent to a large context window, ensuring
// we capture significant output from long-running commands.
export const SCROLLBACK_LIMIT = 300000;

const BASH_SHOPT_OPTIONS = 'promptvars nullglob extglob nocaseglob dotglob';
const BASH_SHOPT_GUARD = `shopt -u ${BASH_SHOPT_OPTIONS};`;

function ensurePromptvarsDisabled(command: string, shell: ShellType): string {
  if (shell !== 'bash') {
    return command;
  }

  const trimmed = command.trimStart();
  if (trimmed.startsWith(BASH_SHOPT_GUARD)) {
    return command;
  }

  return `${BASH_SHOPT_GUARD} ${command}`;
}

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
  /** Whether the command was moved to the background. */
  backgrounded?: boolean;
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
  sanitizationConfig: EnvironmentSanitizationConfig;
  // Used for testing
  disableDynamicLineTrimming?: boolean;
  scrollback?: number;
  maxSerializedLines?: number;
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
    }
  | {
      /** Signals that the process has exited. */
      type: 'exit';
      /** The exit code of the process, if any. */
      exitCode: number | null;
      /** The signal that terminated the process, if any. */
      signal: number | null;
    };

interface ActivePty {
  ptyProcess: IPty;
  headlessTerminal: pkg.Terminal;
  maxSerializedLines?: number;
}

interface ActiveChildProcess {
  process: ChildProcess;
  state: {
    output: string;
    truncated: boolean;
    outputChunks: Buffer[];
  };
}

const getFullBufferText = (terminal: pkg.Terminal): string => {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (!line) {
      continue;
    }
    // If the NEXT line is wrapped, it means it's a continuation of THIS line.
    // We should not trim the right side of this line because trailing spaces
    // might be significant parts of the wrapped content.
    // If it's not wrapped, we trim normally.
    let trimRight = true;
    if (i + 1 < buffer.length) {
      const nextLine = buffer.getLine(i + 1);
      if (nextLine?.isWrapped) {
        trimRight = false;
      }
    }

    const lineContent = line.translateToString(trimRight);

    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += lineContent;
    } else {
      lines.push(lineContent);
    }
  }

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
};

/**
 * A centralized service for executing shell commands with robust process
 * management, cross-platform compatibility, and streaming output capabilities.
 *
 */

export class ShellExecutionService {
  private static activePtys = new Map<number, ActivePty>();
  private static activeChildProcesses = new Map<number, ActiveChildProcess>();
  private static exitedPtyInfo = new Map<
    number,
    { exitCode: number; signal?: number }
  >();
  private static activeResolvers = new Map<
    number,
    (res: ShellExecutionResult) => void
  >();
  private static activeListeners = new Map<
    number,
    Set<(event: ShellOutputEvent) => void>
  >();
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
          return await this.executeWithPty(
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
      shellExecutionConfig.sanitizationConfig,
    );
  }

  private static appendAndTruncate(
    currentBuffer: string,
    chunk: string,
    maxSize: number,
  ): { newBuffer: string; truncated: boolean } {
    const chunkLength = chunk.length;
    const currentLength = currentBuffer.length;
    const newTotalLength = currentLength + chunkLength;

    if (newTotalLength <= maxSize) {
      return { newBuffer: currentBuffer + chunk, truncated: false };
    }

    // Truncation is needed.
    if (chunkLength >= maxSize) {
      // The new chunk is larger than or equal to the max buffer size.
      // The new buffer will be the tail of the new chunk.
      return {
        newBuffer: chunk.substring(chunkLength - maxSize),
        truncated: true,
      };
    }

    // The combined buffer exceeds the max size, but the new chunk is smaller than it.
    // We need to truncate the current buffer from the beginning to make space.
    const charsToTrim = newTotalLength - maxSize;
    const truncatedBuffer = currentBuffer.substring(charsToTrim);
    return { newBuffer: truncatedBuffer + chunk, truncated: true };
  }

  private static emitEvent(pid: number, event: ShellOutputEvent): void {
    const listeners = this.activeListeners.get(pid);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }

  private static childProcessFallback(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    sanitizationConfig: EnvironmentSanitizationConfig,
  ): ShellExecutionHandle {
    try {
      const isWindows = os.platform() === 'win32';
      const { executable, argsPrefix, shell } = getShellConfiguration();
      const guardedCommand = ensurePromptvarsDisabled(commandToExecute, shell);
      const spawnArgs = [...argsPrefix, guardedCommand];

      const child = cpSpawn(executable, spawnArgs, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsVerbatimArguments: isWindows ? false : undefined,
        shell: false,
        detached: !isWindows,
        env: {
          ...sanitizeEnvironment(process.env, sanitizationConfig),
          [GEMINI_CLI_IDENTIFICATION_ENV_VAR]:
            GEMINI_CLI_IDENTIFICATION_ENV_VAR_VALUE,
          TERM: 'xterm-256color',
          PAGER: 'cat',
          GIT_PAGER: 'cat',
        },
      });

      const state = {
        output: '',
        truncated: false,
        outputChunks: [] as Buffer[],
      };

      if (child.pid) {
        this.activeChildProcesses.set(child.pid, {
          process: child,
          state,
        });
      }

      const result = new Promise<ShellExecutionResult>((resolve) => {
        if (child.pid) {
          this.activeResolvers.set(child.pid, resolve);
        }

        let stdoutDecoder: TextDecoder | null = null;
        let stderrDecoder: TextDecoder | null = null;
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

          state.outputChunks.push(data);

          if (isStreamingRawContent && sniffedBytes < MAX_SNIFF_SIZE) {
            const sniffBuffer = Buffer.concat(state.outputChunks.slice(0, 20));
            sniffedBytes = sniffBuffer.length;

            if (isBinary(sniffBuffer)) {
              isStreamingRawContent = false;
              const event: ShellOutputEvent = { type: 'binary_detected' };
              onOutputEvent(event);
              if (child.pid) ShellExecutionService.emitEvent(child.pid, event);
            }
          }

          if (isStreamingRawContent) {
            const decoder = stream === 'stdout' ? stdoutDecoder : stderrDecoder;
            const decodedChunk = decoder.decode(data, { stream: true });

            const { newBuffer, truncated } = this.appendAndTruncate(
              state.output,
              decodedChunk,
              MAX_CHILD_PROCESS_BUFFER_SIZE,
            );
            state.output = newBuffer;
            if (truncated) {
              state.truncated = true;
            }

            if (decodedChunk) {
              const event: ShellOutputEvent = {
                type: 'data',
                chunk: decodedChunk,
              };
              onOutputEvent(event);
              if (child.pid) ShellExecutionService.emitEvent(child.pid, event);
            }
          } else {
            const totalBytes = state.outputChunks.reduce(
              (sum, chunk) => sum + chunk.length,
              0,
            );
            const event: ShellOutputEvent = {
              type: 'binary_progress',
              bytesReceived: totalBytes,
            };
            onOutputEvent(event);
            if (child.pid) ShellExecutionService.emitEvent(child.pid, event);
          }
        };

        const handleExit = (
          code: number | null,
          signal: NodeJS.Signals | null,
        ) => {
          const { finalBuffer } = cleanup();

          let combinedOutput = state.output;

          if (state.truncated) {
            const truncationMessage = `\n[GEMINI_CLI_WARNING: Output truncated. The buffer is limited to ${
              MAX_CHILD_PROCESS_BUFFER_SIZE / (1024 * 1024)
            }MB.]`;
            combinedOutput += truncationMessage;
          }

          const finalStrippedOutput = stripAnsi(combinedOutput).trim();
          const exitCode = code;
          const exitSignal = signal ? os.constants.signals[signal] : null;

          if (child.pid) {
            const event: ShellOutputEvent = {
              type: 'exit',
              exitCode,
              signal: exitSignal,
            };
            onOutputEvent(event);
            ShellExecutionService.emitEvent(child.pid, event);

            this.activeChildProcesses.delete(child.pid);
            this.activeResolvers.delete(child.pid);
            this.activeListeners.delete(child.pid);
          }

          resolve({
            rawOutput: finalBuffer,
            output: finalStrippedOutput,
            exitCode,
            signal: exitSignal,
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
            await killProcessGroup({
              pid: child.pid,
              escalate: true,
              isExited: () => exited,
            });
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
              state.output += remaining;
              // If there's remaining output, we should technically emit it too,
              // but it's rare to have partial utf8 chars at the very end of stream.
              if (isStreamingRawContent && remaining) {
                const event: ShellOutputEvent = {
                  type: 'data',
                  chunk: remaining,
                };
                onOutputEvent(event);
                if (child.pid)
                  ShellExecutionService.emitEvent(child.pid, event);
              }
            }
          }
          if (stderrDecoder) {
            const remaining = stderrDecoder.decode();
            if (remaining) {
              state.output += remaining;
              if (isStreamingRawContent && remaining) {
                const event: ShellOutputEvent = {
                  type: 'data',
                  chunk: remaining,
                };
                onOutputEvent(event);
                if (child.pid)
                  ShellExecutionService.emitEvent(child.pid, event);
              }
            }
          }

          const finalBuffer = Buffer.concat(state.outputChunks);

          return { finalBuffer };
        }
      });

      return { pid: child.pid, result };
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

  private static async executeWithPty(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    shellExecutionConfig: ShellExecutionConfig,
    ptyInfo: PtyImplementation,
  ): Promise<ShellExecutionHandle> {
    if (!ptyInfo) {
      // This should not happen, but as a safeguard...
      throw new Error('PTY implementation not found');
    }
    try {
      const cols = shellExecutionConfig.terminalWidth ?? 80;
      const rows = shellExecutionConfig.terminalHeight ?? 30;
      const { executable, argsPrefix, shell } = getShellConfiguration();

      const resolvedExecutable = await resolveExecutable(executable);
      if (!resolvedExecutable) {
        throw new Error(
          `Shell executable "${executable}" not found in PATH or at absolute location. Please ensure the shell is installed and available in your environment.`,
        );
      }

      const guardedCommand = ensurePromptvarsDisabled(commandToExecute, shell);
      const args = [...argsPrefix, guardedCommand];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ptyProcess = ptyInfo.module.spawn(executable, args, {
        cwd,
        name: 'xterm-256color',
        cols,
        rows,
        env: {
          ...sanitizeEnvironment(
            process.env,
            shellExecutionConfig.sanitizationConfig,
          ),
          GEMINI_CLI: '1',
          TERM: 'xterm-256color',
          PAGER: shellExecutionConfig.pager ?? 'cat',
          GIT_PAGER: shellExecutionConfig.pager ?? 'cat',
        },
        handleFlowControl: true,
      });

      const result = new Promise<ShellExecutionResult>((resolve) => {
        this.activeResolvers.set(ptyProcess.pid, resolve);

        const headlessTerminal = new Terminal({
          allowProposedApi: true,
          cols,
          rows,
          scrollback: shellExecutionConfig.scrollback ?? SCROLLBACK_LIMIT,
        });
        headlessTerminal.scrollToTop();

        this.activePtys.set(ptyProcess.pid, {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          ptyProcess,
          headlessTerminal,
          maxSerializedLines: shellExecutionConfig.maxSerializedLines,
        });

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

        const renderFn = () => {
          renderTimeout = null;

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

          const buffer = headlessTerminal.buffer.active;
          const endLine = buffer.length;
          const startLine = Math.max(
            0,
            endLine - (shellExecutionConfig.maxSerializedLines ?? 2000),
          );

          let newOutput: AnsiOutput;
          if (shellExecutionConfig.showColor) {
            newOutput = serializeTerminalToObject(
              headlessTerminal,
              startLine,
              endLine,
            );
          } else {
            newOutput = (
              serializeTerminalToObject(headlessTerminal, startLine, endLine) ||
              []
            ).map((line) =>
              line.map((token) => {
                token.fg = '';
                token.bg = '';
                return token;
              }),
            );
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

          const absoluteCursorY = buffer.baseY + buffer.cursorY;
          const cursorRelativeIndex = absoluteCursorY - startLine;

          if (cursorRelativeIndex > lastNonEmptyLine) {
            lastNonEmptyLine = cursorRelativeIndex;
          }

          const trimmedOutput = newOutput.slice(0, lastNonEmptyLine + 1);

          const finalOutput = shellExecutionConfig.disableDynamicLineTrimming
            ? newOutput
            : trimmedOutput;

          if (output !== finalOutput) {
            output = finalOutput;
            const event: ShellOutputEvent = {
              type: 'data',
              chunk: finalOutput,
            };
            onOutputEvent(event);
            ShellExecutionService.emitEvent(ptyProcess.pid, event);
          }
        };

        const render = (finalRender = false) => {
          if (finalRender) {
            if (renderTimeout) {
              clearTimeout(renderTimeout);
            }
            renderFn();
            return;
          }

          if (renderTimeout) {
            return;
          }

          renderTimeout = setTimeout(() => {
            renderFn();
            renderTimeout = null;
          }, 68);
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
                    const event: ShellOutputEvent = { type: 'binary_detected' };
                    onOutputEvent(event);
                    ShellExecutionService.emitEvent(ptyProcess.pid, event);
                  }
                }

                if (isStreamingRawContent) {
                  const decodedChunk = decoder.decode(data, { stream: true });
                  if (decodedChunk.length === 0) {
                    resolve();
                    return;
                  }
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
                  const event: ShellOutputEvent = {
                    type: 'binary_progress',
                    bytesReceived: totalBytes,
                  };
                  onOutputEvent(event);
                  ShellExecutionService.emitEvent(ptyProcess.pid, event);
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
            // Attempt to destroy the PTY to ensure FD is closed
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              (ptyProcess as IPty & { destroy?: () => void }).destroy?.();
            } catch {
              // Ignore errors during cleanup
            }

            const finalize = () => {
              render(true);

              // Store exit info for late subscribers (e.g. backgrounding race condition)
              this.exitedPtyInfo.set(ptyProcess.pid, { exitCode, signal });
              setTimeout(
                () => {
                  this.exitedPtyInfo.delete(ptyProcess.pid);
                },
                5 * 60 * 1000,
              ).unref();

              this.activePtys.delete(ptyProcess.pid);
              this.activeResolvers.delete(ptyProcess.pid);

              const event: ShellOutputEvent = {
                type: 'exit',
                exitCode,
                signal: signal ?? null,
              };
              onOutputEvent(event);
              ShellExecutionService.emitEvent(ptyProcess.pid, event);
              this.activeListeners.delete(ptyProcess.pid);

              const finalBuffer = Buffer.concat(outputChunks);

              resolve({
                rawOutput: finalBuffer,
                output: getFullBufferText(headlessTerminal),
                exitCode,
                signal: signal ?? null,
                error,
                aborted: abortSignal.aborted,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                pid: ptyProcess.pid,
                executionMethod: ptyInfo?.name ?? 'node-pty',
              });
            };

            if (abortSignal.aborted) {
              finalize();
              return;
            }

            const processingComplete = processingChain.then(() => 'processed');
            const abortFired = new Promise<'aborted'>((res) => {
              if (abortSignal.aborted) {
                res('aborted');
                return;
              }
              abortSignal.addEventListener('abort', () => res('aborted'), {
                once: true,
              });
            });

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.race([processingComplete, abortFired]).then(() => {
              finalize();
            });
          },
        );

        const abortHandler = async () => {
          if (ptyProcess.pid && !exited) {
            await killProcessGroup({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              pid: ptyProcess.pid,
              escalate: true,
              isExited: () => exited,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              pty: ptyProcess,
            });
          }
        };

        abortSignal.addEventListener('abort', abortHandler, { once: true });
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      return { pid: ptyProcess.pid, result };
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const error = e as Error;
      if (error.message.includes('posix_spawnp failed')) {
        onOutputEvent({
          type: 'data',
          chunk:
            '[GEMINI_CLI_WARNING] PTY execution failed, falling back to child_process. This may be due to sandbox restrictions.\n',
        });
        throw e;
      } else {
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

  /**
   * Writes a string to the pseudo-terminal (PTY) of a running process.
   *
   * @param pid The process ID of the target PTY.
   * @param input The string to write to the terminal.
   */
  static writeToPty(pid: number, input: string): void {
    if (this.activeChildProcesses.has(pid)) {
      const activeChild = this.activeChildProcesses.get(pid);
      if (activeChild) {
        activeChild.process.stdin?.write(input);
      }
      return;
    }

    if (!this.isPtyActive(pid)) {
      return;
    }

    const activePty = this.activePtys.get(pid);
    if (activePty) {
      activePty.ptyProcess.write(input);
    }
  }

  static isPtyActive(pid: number): boolean {
    if (this.activeChildProcesses.has(pid)) {
      try {
        return process.kill(pid, 0);
      } catch {
        return false;
      }
    }

    try {
      // process.kill with signal 0 is a way to check for the existence of a process.
      // It doesn't actually send a signal.
      return process.kill(pid, 0);
    } catch (_) {
      return false;
    }
  }

  /**
   * Registers a callback to be invoked when the process with the given PID exits.
   * This attaches directly to the PTY's exit event.
   *
   * @param pid The process ID to watch.
   * @param callback The function to call on exit.
   * @returns An unsubscribe function.
   */
  static onExit(
    pid: number,
    callback: (exitCode: number, signal?: number) => void,
  ): () => void {
    const activePty = this.activePtys.get(pid);
    if (activePty) {
      const disposable = activePty.ptyProcess.onExit(
        ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
          callback(exitCode, signal);
          disposable.dispose();
        },
      );
      return () => disposable.dispose();
    } else if (this.activeChildProcesses.has(pid)) {
      const activeChild = this.activeChildProcesses.get(pid);
      const listener = (code: number | null, signal: NodeJS.Signals | null) => {
        let signalNumber: number | undefined;
        if (signal) {
          signalNumber = os.constants.signals[signal];
        }
        callback(code ?? 0, signalNumber);
      };
      activeChild?.process.on('exit', listener);
      return () => {
        activeChild?.process.removeListener('exit', listener);
      };
    } else {
      // Check if it already exited recently
      const exitedInfo = this.exitedPtyInfo.get(pid);
      if (exitedInfo) {
        callback(exitedInfo.exitCode, exitedInfo.signal);
      }
      return () => {};
    }
  }

  /**
   * Kills a process by its PID.
   *
   * @param pid The process ID to kill.
   */
  static kill(pid: number): void {
    const activePty = this.activePtys.get(pid);
    const activeChild = this.activeChildProcesses.get(pid);

    if (activeChild) {
      killProcessGroup({ pid }).catch(() => {});
      this.activeChildProcesses.delete(pid);
    } else if (activePty) {
      killProcessGroup({ pid, pty: activePty.ptyProcess }).catch(() => {});
      this.activePtys.delete(pid);
    }

    this.activeResolvers.delete(pid);
    this.activeListeners.delete(pid);
  }

  /**
   * Moves a running shell command to the background.
   * This resolves the execution promise but keeps the PTY active.
   *
   * @param pid The process ID of the target PTY.
   */
  static background(pid: number): void {
    const resolve = this.activeResolvers.get(pid);
    if (resolve) {
      let output = '';
      const rawOutput = Buffer.from('');

      const activePty = this.activePtys.get(pid);
      const activeChild = this.activeChildProcesses.get(pid);

      if (activePty) {
        output = getFullBufferText(activePty.headlessTerminal);
        resolve({
          rawOutput,
          output,
          exitCode: null,
          signal: null,
          error: null,
          aborted: false,
          pid,
          executionMethod: 'node-pty',
          backgrounded: true,
        });
      } else if (activeChild) {
        output = activeChild.state.output;

        resolve({
          rawOutput,
          output,
          exitCode: null,
          signal: null,
          error: null,
          aborted: false,
          pid,
          executionMethod: 'child_process',
          backgrounded: true,
        });
      }

      this.activeResolvers.delete(pid);
    }
  }

  static subscribe(
    pid: number,
    listener: (event: ShellOutputEvent) => void,
  ): () => void {
    if (!this.activeListeners.has(pid)) {
      this.activeListeners.set(pid, new Set());
    }
    this.activeListeners.get(pid)?.add(listener);

    // Send current buffer content immediately
    const activePty = this.activePtys.get(pid);
    const activeChild = this.activeChildProcesses.get(pid);

    if (activePty) {
      // Use serializeTerminalToObject to preserve colors and structure
      const endLine = activePty.headlessTerminal.buffer.active.length;
      const startLine = Math.max(
        0,
        endLine - (activePty.maxSerializedLines ?? 2000),
      );
      const bufferData = serializeTerminalToObject(
        activePty.headlessTerminal,
        startLine,
        endLine,
      );
      if (bufferData && bufferData.length > 0) {
        listener({ type: 'data', chunk: bufferData });
      }
    } else if (activeChild) {
      const output = activeChild.state.output;
      if (output) {
        listener({ type: 'data', chunk: output });
      }
    }

    return () => {
      this.activeListeners.get(pid)?.delete(listener);
      if (this.activeListeners.get(pid)?.size === 0) {
        this.activeListeners.delete(pid);
      }
    };
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const err = e as { code?: string; message?: string };
        const isEsrch = err.code === 'ESRCH';
        const isWindowsPtyError = err.message?.includes(
          'Cannot resize a pty that has already exited',
        );

        if (isEsrch || isWindowsPtyError) {
          // On Unix, we get an ESRCH error.
          // On Windows, we get a message-based error.
          // In both cases, it's safe to ignore.
        } else {
          throw e;
        }
      }
    }

    // Force emit the new state after resize
    if (activePty) {
      const endLine = activePty.headlessTerminal.buffer.active.length;
      const startLine = Math.max(
        0,
        endLine - (activePty.maxSerializedLines ?? 2000),
      );
      const bufferData = serializeTerminalToObject(
        activePty.headlessTerminal,
        startLine,
        endLine,
      );
      const event: ShellOutputEvent = { type: 'data', chunk: bufferData };
      const listeners = ShellExecutionService.activeListeners.get(pid);
      if (listeners) {
        listeners.forEach((listener) => listener(event));
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
