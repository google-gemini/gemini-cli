/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pty from '@lydell/node-pty';
import { TextDecoder } from 'util';
import os from 'os';
import { getCachedEncodingForBuffer } from '../utils/systemEncoding.js';
import { isBinary } from '../utils/textUtils.js';
import pkg from '@xterm/headless';
const { Terminal } = pkg;

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
  static execute(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    terminalColumns?: number,
    terminalRows?: number,
  ): ShellExecutionHandle {
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : 'bash';
    const args = isWindows
      ? ['/c', commandToExecute]
      : ['-c', commandToExecute];

    let ptyProcess;
    try {
      ptyProcess = pty.spawn(shell, args, {
        cwd,
        name: 'xterm-color',
        cols: terminalColumns ?? 200,
        rows: terminalRows ?? 20,
        env: {
          ...process.env,
          GEMINI_CLI: '1',
        },
        handleFlowControl: true,
      });
    } catch (e) {
      const error = e as Error;
      return {
        pid: undefined,
        result: Promise.resolve({
          rawOutput: Buffer.from(''),
          output: '',
          exitCode: 1,
          signal: null,
          error,
          aborted: false,
          pid: undefined,
        }),
      };
    }

    const result = new Promise<ShellExecutionResult>((resolve) => {
      const headlessTerminal = new Terminal({
        allowProposedApi: true,
        cols: terminalColumns ?? 200,
        rows: terminalRows ?? 20,
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
        // NOTE: The migration from `child_process` to `node-pty` means we
        // no longer have separate `stdout` and `stderr` streams. The `data`
        // buffer contains the merged output. If a drop in LLM quality is
        // observed after this change, we may need to revisit this and
        // explore ways to re-introduce that distinction.
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

              // First, check if we need to switch to binary mode.
              if (isStreamingRawContent && sniffedBytes < MAX_SNIFF_SIZE) {
                const sniffBuffer = Buffer.concat(outputChunks.slice(0, 20));
                sniffedBytes = sniffBuffer.length;

                if (isBinary(sniffBuffer)) {
                  isStreamingRawContent = false;
                  onOutputEvent({ type: 'binary_detected' });
                }
              }

              // Now, based on the *current* state, either process as text or binary.
              if (isStreamingRawContent) {
                const decodedChunk = decoder.decode(data, { stream: true });
                headlessTerminal.write(decodedChunk, () => {
                  const newStrippedOutput = getFullText(headlessTerminal);
                  output = newStrippedOutput;
                  onOutputEvent({ type: 'data', chunk: newStrippedOutput });
                  resolve();
                });
              } else {
                // Once in binary mode, we only emit progress events.
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

      ptyProcess.onData((data) => {
        const bufferData = Buffer.from(data, 'utf-8');
        handleOutput(bufferData);
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
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
          });
        });
      });

      const abortHandler = async () => {
        if (ptyProcess.pid && !exited) {
          ptyProcess.kill('SIGHUP');
        }
      };

      abortSignal.addEventListener('abort', abortHandler, { once: true });
    });

    return { pid: ptyProcess.pid, result };
  }
}
