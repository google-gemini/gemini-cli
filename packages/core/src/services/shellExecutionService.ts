/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import { getPty, type PtyImplementation } from '../utils/getPty.js';
import { spawn as cpSpawn, type ChildProcess } from 'node:child_process';
import { TextDecoder } from 'node:util';
import type { Writable } from 'node:stream';
import os from 'node:os';
import fs, { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { IPty } from '@lydell/node-pty';
import { getCachedEncodingForBuffer } from '../utils/systemEncoding.js';
import {
  getShellConfiguration,
  resolveExecutable,
  type ShellType,
} from '../utils/shell-utils.js';
import { isBinary } from '../utils/textUtils.js';
import pkg from '@xterm/headless';
import { debugLogger } from '../utils/debugLogger.js';
import { Storage } from '../config/storage.js';
import {
  serializeTerminalToObject,
  type AnsiOutput,
} from '../utils/terminalSerializer.js';
import {
  sanitizeEnvironment,
  type EnvironmentSanitizationConfig,
} from './environmentSanitization.js';
import { NoopSandboxManager, type SandboxManager } from './sandboxManager.js';
import type { SandboxConfig } from '../config/config.js';
import { killProcessGroup } from '../utils/process-utils.js';
import {
  ExecutionLifecycleService,
  type ExecutionHandle,
  type ExecutionOutputEvent,
  type ExecutionResult,
} from './executionLifecycleService.js';
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
export type ShellExecutionResult = ExecutionResult;

/** A handle for an ongoing shell execution. */
export type ShellExecutionHandle = ExecutionHandle;

export interface ShellExecutionConfig {
  terminalWidth?: number;
  terminalHeight?: number;
  pager?: string;
  showColor?: boolean;
  defaultFg?: string;
  defaultBg?: string;
  sanitizationConfig: EnvironmentSanitizationConfig;
  sandboxManager: SandboxManager;
  // Used for testing
  disableDynamicLineTrimming?: boolean;
  scrollback?: number;
  maxSerializedLines?: number;
  sandboxConfig?: SandboxConfig;
}

/**
 * Describes a structured event emitted during shell command execution.
 */
export type ShellOutputEvent = ExecutionOutputEvent;

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

const findLastContentLine = (
  buffer: pkg.IBuffer,
  startLine: number,
): number => {
  const lineCount = buffer.length;
  for (let i = lineCount - 1; i >= startLine; i--) {
    const line = buffer.getLine(i);
    if (line && line.translateToString(true).length > 0) {
      return i;
    }
  }
  return -1;
};

const getFullBufferText = (terminal: pkg.Terminal, startLine = 0): string => {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];

  const lastContentLine = findLastContentLine(buffer, startLine);

  if (lastContentLine === -1 || lastContentLine < startLine) return '';

  for (let i = startLine; i <= lastContentLine; i++) {
    const line = buffer.getLine(i);
    if (!line) {
      lines.push('');
      continue;
    }

    let trimRight = true;
    if (i + 1 <= lastContentLine) {
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

  return lines.join('\n');
};

const writeBufferToLogStream = (
  terminal: pkg.Terminal,
  stream: fs.WriteStream,
  startLine = 0,
): number => {
  const buffer = terminal.buffer.active;
  const lastContentLine = findLastContentLine(buffer, startLine);

  if (lastContentLine === -1 || lastContentLine < startLine) return startLine;

  for (let i = startLine; i <= lastContentLine; i++) {
    const line = buffer.getLine(i);
    if (!line) {
      stream.write('\n');
      continue;
    }

    let trimRight = true;
    if (i + 1 <= lastContentLine) {
      const nextLine = buffer.getLine(i + 1);
      if (nextLine?.isWrapped) {
        trimRight = false;
      }
    }

    const lineContent = line.translateToString(trimRight);
    const stripped = stripAnsi(lineContent);

    if (line.isWrapped) {
      stream.write(stripped);
    } else {
      if (i > startLine) {
        stream.write('\n');
      }
      stream.write(stripped);
    }
  }

  // Ensure it ends with a newline if we wrote anything and the next line is not wrapped
  if (lastContentLine >= startLine) {
    const nextLine = terminal.buffer.active.getLine(lastContentLine + 1);
    if (!nextLine?.isWrapped) {
      stream.write('\n');
    }
  }

  return lastContentLine + 1;
};

/**
 * A centralized service for executing shell commands with robust process
 * management, cross-platform compatibility, and streaming output capabilities.
 *
 */

export class ShellExecutionService {
  private static activePtys = new Map<number, ActivePty>();
  private static activeChildProcesses = new Map<number, ActiveChildProcess>();
  private static backgroundLogPids = new Set<number>();
  private static backgroundLogStreams = new Map<number, fs.WriteStream>();

  static getLogDir(): string {
    return path.join(Storage.getGlobalTempDir(), 'background-processes');
  }

  static getLogFilePath(pid: number): string {
    return path.join(this.getLogDir(), `background-${pid}.log`);
  }

  private static syncBackgroundLog(pid: number, content: string): void {
    if (!this.backgroundLogPids.has(pid)) return;

    const stream = this.backgroundLogStreams.get(pid);
    if (stream && content) {
      // Strip ANSI escape codes before logging
      stream.write(stripAnsi(content));
    }
  }

  private static async cleanupLogStream(pid: number): Promise<void> {
    const stream = this.backgroundLogStreams.get(pid);
    if (stream) {
      await new Promise<void>((resolve) => {
        stream.end(() => resolve());
      });
      this.backgroundLogStreams.delete(pid);
    }

    this.backgroundLogPids.delete(pid);
  }

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
      shellExecutionConfig,
      shouldUseNodePty,
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

  private static async prepareExecution(
    commandToExecute: string,
    cwd: string,
    shellExecutionConfig: ShellExecutionConfig,
    isInteractive: boolean,
  ): Promise<{
    program: string;
    args: string[];
    env: Record<string, string | undefined>;
    cwd: string;
  }> {
    const sandboxManager =
      shellExecutionConfig.sandboxManager ?? new NoopSandboxManager();

    // 1. Determine Shell Configuration
    const isWindows = os.platform() === 'win32';
    const isStrictSandbox =
      isWindows &&
      shellExecutionConfig.sandboxConfig?.enabled &&
      shellExecutionConfig.sandboxConfig?.command === 'windows-native' &&
      !shellExecutionConfig.sandboxConfig?.networkAccess;

    let { executable, argsPrefix, shell } = getShellConfiguration();
    if (isStrictSandbox) {
      shell = 'cmd';
      argsPrefix = ['/c'];
      executable = 'cmd.exe';
    }

    const resolvedExecutable =
      (await resolveExecutable(executable)) ?? executable;

    const guardedCommand = ensurePromptvarsDisabled(commandToExecute, shell);
    const spawnArgs = [...argsPrefix, guardedCommand];

    // 2. Prepare Environment
    const gitConfigKeys: string[] = [];
    if (!isInteractive) {
      for (const key in process.env) {
        if (key.startsWith('GIT_CONFIG_')) {
          gitConfigKeys.push(key);
        }
      }
    }

    const sanitizationConfig = {
      ...shellExecutionConfig.sanitizationConfig,
      allowedEnvironmentVariables: [
        ...(shellExecutionConfig.sanitizationConfig
          .allowedEnvironmentVariables || []),
        ...gitConfigKeys,
      ],
    };

    const sanitizedEnv = sanitizeEnvironment(process.env, sanitizationConfig);

    const baseEnv: Record<string, string | undefined> = {
      ...sanitizedEnv,
      [GEMINI_CLI_IDENTIFICATION_ENV_VAR]:
        GEMINI_CLI_IDENTIFICATION_ENV_VAR_VALUE,
      TERM: 'xterm-256color',
      PAGER: shellExecutionConfig.pager ?? 'cat',
      GIT_PAGER: shellExecutionConfig.pager ?? 'cat',
    };

    if (!isInteractive) {
      // Ensure all GIT_CONFIG_* variables are preserved even if they were redacted
      for (const key of gitConfigKeys) {
        baseEnv[key] = process.env[key];
      }

      const gitConfigCount = parseInt(baseEnv['GIT_CONFIG_COUNT'] || '0', 10);
      const newKey = `GIT_CONFIG_KEY_${gitConfigCount}`;
      const newValue = `GIT_CONFIG_VALUE_${gitConfigCount}`;

      // Ensure these new keys are allowed through sanitization
      sanitizationConfig.allowedEnvironmentVariables.push(
        'GIT_CONFIG_COUNT',
        newKey,
        newValue,
      );

      Object.assign(baseEnv, {
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
        SSH_ASKPASS: '',
        GH_PROMPT_DISABLED: '1',
        GCM_INTERACTIVE: 'never',
        DISPLAY: '',
        DBUS_SESSION_BUS_ADDRESS: '',
        GIT_CONFIG_COUNT: (gitConfigCount + 1).toString(),
        [newKey]: 'credential.helper',
        [newValue]: '',
      });
    }

    // 3. Prepare Sandboxed Command
    const sandboxedCommand = await sandboxManager.prepareCommand({
      command: resolvedExecutable,
      args: spawnArgs,
      env: baseEnv,
      cwd,
      policy: {
        ...shellExecutionConfig,
        ...(shellExecutionConfig.sandboxConfig || {}),
        sanitizationConfig,
      },
    });

    return {
      program: sandboxedCommand.program,
      args: sandboxedCommand.args,
      env: sandboxedCommand.env,
      cwd: sandboxedCommand.cwd ?? cwd,
    };
  }

  private static async childProcessFallback(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    shellExecutionConfig: ShellExecutionConfig,
    isInteractive: boolean,
  ): Promise<ShellExecutionHandle> {
    try {
      const isWindows = os.platform() === 'win32';

      const {
        program: finalExecutable,
        args: finalArgs,
        env: finalEnv,
        cwd: finalCwd,
      } = await this.prepareExecution(
        commandToExecute,
        cwd,
        shellExecutionConfig,
        isInteractive,
      );

      const child = cpSpawn(finalExecutable, finalArgs, {
        cwd: finalCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsVerbatimArguments: isWindows ? false : undefined,
        shell: false,
        detached: !isWindows,
        env: finalEnv,
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

      const lifecycleHandle = child.pid
        ? ExecutionLifecycleService.attachExecution(child.pid, {
            executionMethod: 'child_process',
            getBackgroundOutput: () => state.output,
            getSubscriptionSnapshot: () => state.output || undefined,
            writeInput: (input) => {
              const stdin = child.stdin as Writable | null;
              if (stdin) {
                stdin.write(input);
              }
            },
            kill: () => {
              if (child.pid) {
                killProcessGroup({ pid: child.pid }).catch(() => {});
                this.activeChildProcesses.delete(child.pid);
              }
            },
            isActive: () => {
              if (!child.pid) {
                return false;
              }
              try {
                return process.kill(child.pid, 0);
              } catch {
                return false;
              }
            },
          })
        : undefined;

      let resolveWithoutPid:
        | ((result: ShellExecutionResult) => void)
        | undefined;
      const result =
        lifecycleHandle?.result ??
        new Promise<ShellExecutionResult>((resolve) => {
          resolveWithoutPid = resolve;
        });

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
            if (child.pid) {
              ExecutionLifecycleService.emitEvent(child.pid, event);
            }
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
            if (child.pid) {
              ExecutionLifecycleService.emitEvent(child.pid, event);
              if (ShellExecutionService.backgroundLogPids.has(child.pid)) {
                ShellExecutionService.syncBackgroundLog(
                  child.pid,
                  decodedChunk,
                );
              }
            }
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
          if (child.pid) {
            ExecutionLifecycleService.emitEvent(child.pid, event);
          }
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

        const resultPayload: ShellExecutionResult = {
          rawOutput: finalBuffer,
          output: finalStrippedOutput,
          exitCode,
          signal: exitSignal,
          error,
          aborted: abortSignal.aborted,
          pid: child.pid,
          executionMethod: 'child_process',
        };

        if (child.pid) {
          const pid = child.pid;
          const event: ShellOutputEvent = {
            type: 'exit',
            exitCode,
            signal: exitSignal,
          };
          onOutputEvent(event);

          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          ShellExecutionService.cleanupLogStream(pid).then(() => {
            ShellExecutionService.activeChildProcesses.delete(pid);
          });

          ExecutionLifecycleService.completeWithResult(pid, resultPayload);
        } else {
          resolveWithoutPid?.(resultPayload);
        }
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
            if (isStreamingRawContent) {
              const event: ShellOutputEvent = {
                type: 'data',
                chunk: remaining,
              };
              onOutputEvent(event);
              if (child.pid) {
                ExecutionLifecycleService.emitEvent(child.pid, event);
              }
            }
          }
        }
        if (stderrDecoder) {
          const remaining = stderrDecoder.decode();
          if (remaining) {
            state.output += remaining;
            if (isStreamingRawContent) {
              const event: ShellOutputEvent = {
                type: 'data',
                chunk: remaining,
              };
              onOutputEvent(event);
              if (child.pid) {
                ExecutionLifecycleService.emitEvent(child.pid, event);
              }
            }
          }
        }

        const finalBuffer = Buffer.concat(state.outputChunks);
        return { finalBuffer };
      }

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
    let spawnedPty: IPty | undefined;

    try {
      const cols = shellExecutionConfig.terminalWidth ?? 80;
      const rows = shellExecutionConfig.terminalHeight ?? 30;

      const {
        program: finalExecutable,
        args: finalArgs,
        env: finalEnv,
        cwd: finalCwd,
      } = await this.prepareExecution(
        commandToExecute,
        cwd,
        shellExecutionConfig,
        true,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ptyProcess = ptyInfo.module.spawn(finalExecutable, finalArgs, {
        cwd: finalCwd,
        name: 'xterm-256color',
        cols,
        rows,
        env: finalEnv,
        handleFlowControl: true,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      spawnedPty = ptyProcess as IPty;
      const ptyPid = Number(ptyProcess.pid);

      const headlessTerminal = new Terminal({
        allowProposedApi: true,
        cols,
        rows,
        scrollback: shellExecutionConfig.scrollback ?? SCROLLBACK_LIMIT,
      });
      headlessTerminal.scrollToTop();

      this.activePtys.set(ptyPid, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        ptyProcess,
        headlessTerminal,
        maxSerializedLines: shellExecutionConfig.maxSerializedLines,
      });

      const result = ExecutionLifecycleService.attachExecution(ptyPid, {
        executionMethod: ptyInfo?.name ?? 'node-pty',
        writeInput: (input) => {
          if (!ExecutionLifecycleService.isActive(ptyPid)) {
            return;
          }
          ptyProcess.write(input);
        },
        kill: () => {
          killProcessGroup({
            pid: ptyPid,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            pty: ptyProcess,
          }).catch(() => {});
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (ptyProcess as IPty & { destroy?: () => void }).destroy?.();
          } catch {
            // Ignore errors during cleanup
          }
          this.activePtys.delete(ptyPid);
        },
        isActive: () => {
          try {
            return process.kill(ptyPid, 0);
          } catch {
            return false;
          }
        },
        getBackgroundOutput: () => getFullBufferText(headlessTerminal),
        getSubscriptionSnapshot: () => {
          const endLine = headlessTerminal.buffer.active.length;
          const startLine = Math.max(
            0,
            endLine - (shellExecutionConfig.maxSerializedLines ?? 2000),
          );
          const bufferData = serializeTerminalToObject(
            headlessTerminal,
            startLine,
            endLine,
          );
          return bufferData.length > 0 ? bufferData : undefined;
        },
      }).result;

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
          ExecutionLifecycleService.emitEvent(ptyPid, event);
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
            new Promise<void>((resolveChunk) => {
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
                  ExecutionLifecycleService.emitEvent(ptyPid, event);
                }
              }

              if (isStreamingRawContent) {
                const decodedChunk = decoder.decode(data, { stream: true });
                if (decodedChunk.length === 0) {
                  resolveChunk();
                  return;
                }

                if (ShellExecutionService.backgroundLogPids.has(ptyPid)) {
                  ShellExecutionService.syncBackgroundLog(ptyPid, decodedChunk);
                }

                isWriting = true;
                headlessTerminal.write(decodedChunk, () => {
                  render();
                  isWriting = false;
                  resolveChunk();
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
                ExecutionLifecycleService.emitEvent(ptyPid, event);
                resolveChunk();
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
          // Attempt to destroy the PTY to ensure FD is closed
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (ptyProcess as IPty & { destroy?: () => void }).destroy?.();
          } catch {
            // Ignore errors during cleanup
          }

          const finalize = () => {
            render(true);

            const event: ShellOutputEvent = {
              type: 'exit',
              exitCode,
              signal: signal ?? null,
            };
            onOutputEvent(event);

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            ShellExecutionService.cleanupLogStream(ptyPid).then(() => {
              ShellExecutionService.activePtys.delete(ptyPid);
            });

            ExecutionLifecycleService.completeWithResult(ptyPid, {
              rawOutput: Buffer.concat(outputChunks),
              output: getFullBufferText(headlessTerminal),
              exitCode,
              signal: signal ?? null,
              error,
              aborted: abortSignal.aborted,
              pid: ptyPid,
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
            pid: ptyPid,
            escalate: true,
            isExited: () => exited,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            pty: ptyProcess,
          });
        }
      };

      abortSignal.addEventListener('abort', abortHandler, { once: true });

      return { pid: ptyPid, result };
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const error = e as Error;

      if (spawnedPty) {
        try {
          (spawnedPty as IPty & { destroy?: () => void }).destroy?.();
        } catch {
          // Ignore errors during cleanup
        }
      }

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
    ExecutionLifecycleService.writeInput(pid, input);
  }

  static isPtyActive(pid: number): boolean {
    return ExecutionLifecycleService.isActive(pid);
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
    return ExecutionLifecycleService.onExit(pid, callback);
  }

  /**
   * Kills a process by its PID.
   *
   * @param pid The process ID to kill.
   */
  static async kill(pid: number): Promise<void> {
    await this.cleanupLogStream(pid);
    this.activePtys.delete(pid);
    this.activeChildProcesses.delete(pid);
    ExecutionLifecycleService.kill(pid);
  }

  /**
   * Moves a running shell command to the background.
   * This resolves the execution promise but keeps the PTY active.
   *
   * @param pid The process ID of the target PTY.
   */
  static background(pid: number): void {
    const activePty = this.activePtys.get(pid);
    const activeChild = this.activeChildProcesses.get(pid);

    // Set up background logging
    const logPath = this.getLogFilePath(pid);
    const logDir = this.getLogDir();
    try {
      mkdirSync(logDir, { recursive: true });
      const stream = fs.createWriteStream(logPath, { flags: 'w' });
      stream.on('error', (err) => {
        debugLogger.warn('Background log stream error:', err);
      });
      this.backgroundLogStreams.set(pid, stream);

      if (activePty) {
        writeBufferToLogStream(activePty.headlessTerminal, stream, 0);
      } else if (activeChild) {
        const output = activeChild.state.output;
        if (output) {
          stream.write(stripAnsi(output) + '\n');
        }
      }
    } catch (e) {
      debugLogger.warn('Failed to setup background logging:', e);
    }

    this.backgroundLogPids.add(pid);

    ExecutionLifecycleService.background(pid);
  }

  static subscribe(
    pid: number,
    listener: (event: ShellOutputEvent) => void,
  ): () => void {
    return ExecutionLifecycleService.subscribe(pid, listener);
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
      ExecutionLifecycleService.emitEvent(pid, event);
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
