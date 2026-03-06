/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPty } from '../utils/getPty.js';
import { spawn as cpSpawn, type ChildProcess } from 'node:child_process';
import { TextDecoder } from 'node:util';
import os from 'node:os';
import type { IPty } from '@lydell/node-pty';
import {
  getShellConfiguration,
  resolveExecutable,
  type ShellType,
} from '../utils/shell-utils.js';
import {
  sanitizeEnvironment,
  type EnvironmentSanitizationConfig,
} from './environmentSanitization.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface PersistentShellConfig {
  sanitizationConfig: EnvironmentSanitizationConfig;
}

export interface PersistentShellResult {
  output: string;
  exitCode: number | null;
  signal: number | null;
  aborted: boolean;
  error: Error | null;
}

/**
 * Manages a persistent shell session (PTY or child_process) that remains active
 * across multiple command executions, preserving environment variables,
 * aliases, and the current working directory.
 */
export class PersistentShellSession {
  private pty: IPty | null = null;
  private child: ChildProcess | null = null;
  private shellType: ShellType = 'bash';

  private queue: Array<{
    command: string;
    cwd: string;
    onOutput: (data: string) => void;
    signal: AbortSignal;
    resolve: (res: PersistentShellResult) => void;
    reject: (err: Error) => void;
  }> = [];

  private isProcessing = false;
  private currentOutput = '';
  private currentExitCode: number | null = null;
  private currentResolver: ((res: PersistentShellResult) => void) | null = null;
  private currentRejecter: ((err: Error) => void) | null = null;
  private currentOutputCallback: ((data: string) => void) | null = null;
  private sentOutputLength = 0;

  private endMarkerPrefix = '___GEMINI_EXIT_CODE_';
  private endMarkerSuffix = '___';
  private startMarker = '';
  private hasSeenStartMarker = false;

  constructor(private config: PersistentShellConfig) {}

  get pid(): number | undefined {
    return this.pty?.pid || this.child?.pid;
  }

  async init(): Promise<void> {
    await this.ensureInitialized();
  }

  write(data: string): void {
    if (this.pty) {
      this.pty.write(data);
    } else if (this.child?.stdin) {
      this.child.stdin.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.pty) {
      this.pty.resize(cols, rows);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.pty || this.child) {
      debugLogger.log('Reusing existing persistent shell session.');
      return;
    }

    const { executable, shell } = getShellConfiguration();
    this.shellType = shell;

    // For persistent shells, we want interactive login shells on Unix
    const userShell = process.env['SHELL'] || executable;
    const isUnix = os.platform() !== 'win32';
    const args = isUnix ? ['-i', '-l'] : []; // login shell for aliases

    const resolvedExecutable = await resolveExecutable(userShell);
    if (!resolvedExecutable) {
      throw new Error(`Shell executable "${userShell}" not found.`);
    }

    // If the user's shell is zsh, don't treat it strictly as bash
    if (resolvedExecutable.endsWith('zsh')) {
      this.shellType = 'zsh';
    }

    debugLogger.log(
      `Initializing PersistentShellSession with executable: ${resolvedExecutable} args: ${args.join(' ')}`,
    );

    const env = {
      ...sanitizeEnvironment(process.env, this.config.sanitizationConfig),
      GEMINI_CLI: '1',
      TERM: 'xterm-256color',
      PAGER: 'cat',
      GIT_PAGER: 'cat',
    };

    const ptyInfo = await getPty();
    if (ptyInfo) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      this.pty = ptyInfo.module.spawn(resolvedExecutable, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env,
      }) as IPty;

      this.pty.onData((data) => this.handleRawOutput(data));
      const currentPty = this.pty;
      this.pty.onExit((e) => {
        debugLogger.log(
          `Persistent shell PTY exited with code ${e.exitCode} and signal ${e.signal}`,
        );
        if (this.pty === currentPty) {
          this.pty = null;
          this.handleProcessEnd();
        }
      });
    } else {
      // Fallback to child_process
      this.child = cpSpawn(resolvedExecutable, args, {
        cwd: process.cwd(),
        env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const decoder = new TextDecoder();
      this.child.stdout?.on('data', (data: Buffer) =>
        this.handleRawOutput(decoder.decode(data)),
      );
      this.child.stderr?.on('data', (data: Buffer) =>
        this.handleRawOutput(decoder.decode(data)),
      );
      const currentChild = this.child;
      this.child.on('exit', (code, signal) => {
        debugLogger.log(
          `Persistent shell child process exited with code ${code} and signal ${signal}`,
        );
        if (this.child === currentChild) {
          this.child = null;
          this.handleProcessEnd();
        }
      });
    }

    // Initial silent bootstrap
    await this.bootstrapShell();
  }

  private async bootstrapShell(): Promise<void> {
    debugLogger.log('Bootstrapping persistent shell...');
    // Send a sequence to clear initialization noise and ensure we are ready
    const marker = `INIT_${Math.random().toString(36).substring(2)}`;

    let bootstrapCmd = '';
    if (this.shellType === 'bash') {
      // Explicitly source .bashrc as some systems don't do it automatically for login shells,
      // or aliases might be defined there instead of .bash_profile.
      // Also enable alias expansion which is often disabled in non-interactive modes.
      bootstrapCmd = `unset npm_config_prefix; [ -f ~/.bashrc ] && . ~/.bashrc; shopt -s expand_aliases; echo ${marker}\n`;
    } else if (this.shellType === 'powershell') {
      bootstrapCmd = `Write-Output ${marker}\n`;
    } else if (this.shellType === 'zsh') {
      // zsh usually has aliases expanded in interactive mode
      bootstrapCmd = `unset npm_config_prefix; [ -f ~/.zshrc ] && . ~/.zshrc; echo ${marker}\n`;
    } else {
      bootstrapCmd = `echo ${marker}\n`;
    }

    return new Promise((resolve) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        debugLogger.error(
          'Persistent shell bootstrap timed out. Buffer content:',
          buffer,
        );
        resolve();
      }, 5000);

      const onData = (data: string) => {
        buffer += data;
        if (buffer.includes(marker)) {
          debugLogger.log('Persistent shell bootstrap complete.');
          clearTimeout(timeout);
          resolve();
        }
      };

      if (this.pty) {
        const disposable = this.pty.onData(onData);
        this.pty.write(bootstrapCmd);
        const originalResolve = resolve;
        resolve = () => {
          disposable.dispose();
          originalResolve();
        };
      } else if (this.child) {
        const listener = (data: Buffer) =>
          onData(new TextDecoder().decode(data));
        this.child.stdout?.on('data', listener);
        this.child.stdin?.write(bootstrapCmd);
        const originalResolve = resolve;
        resolve = () => {
          this.child?.stdout?.removeListener('data', listener);
          originalResolve();
        };
      }
    });
  }

  private handleRawOutput(data: string): void {
    if (!this.isProcessing) {
      debugLogger.log(
        `Persistent shell received output while NOT processing: ${JSON.stringify(data)}`,
      );
      return;
    }

    this.currentOutput += data;

    if (!this.hasSeenStartMarker) {
      const startIndex = this.currentOutput.indexOf(this.startMarker);
      if (startIndex !== -1) {
        let startMarkerEnd = startIndex + this.startMarker.length;
        if (this.currentOutput.startsWith('\r\n', startMarkerEnd)) {
          startMarkerEnd += 2;
        } else if (
          this.currentOutput.startsWith('\n', startMarkerEnd) ||
          this.currentOutput.startsWith('\r', startMarkerEnd)
        ) {
          startMarkerEnd += 1;
        }

        this.currentOutput = this.currentOutput.substring(startMarkerEnd);
        this.hasSeenStartMarker = true;
      } else {
        // Fallback if we see the end marker before the start marker
        const endIndex = this.currentOutput.indexOf(this.endMarkerPrefix);
        if (endIndex !== -1) {
          this.hasSeenStartMarker = true;
        } else {
          // Still waiting for start marker
          return;
        }
      }
    }

    // Check for end marker
    const endIndex = this.currentOutput.indexOf(this.endMarkerPrefix);
    if (endIndex !== -1) {
      const remaining = this.currentOutput.substring(
        endIndex + this.endMarkerPrefix.length,
      );
      const suffixIndex = remaining.indexOf(this.endMarkerSuffix);
      if (suffixIndex !== -1) {
        const exitCodeStr = remaining.substring(0, suffixIndex);
        this.currentExitCode = parseInt(exitCodeStr, 10);

        // Strip marker from output
        const finalOutput = this.currentOutput.substring(0, endIndex);

        // Stream the remaining valid part before the marker
        if (
          this.currentOutputCallback &&
          finalOutput.length > this.sentOutputLength
        ) {
          const chunk = finalOutput.substring(this.sentOutputLength);
          if (chunk) {
            this.currentOutputCallback(chunk);
          }
        }

        this.currentOutput = ''; // Reset for next command
        this.sentOutputLength = 0;
        this.hasSeenStartMarker = false;

        if (this.currentResolver) {
          this.currentResolver({
            output: finalOutput.trim(),
            exitCode: this.currentExitCode,
            signal: null,
            aborted: false,
            error: null,
          });
        }
        this.isProcessing = false;
        void this.processQueue();
        return;
      }
    }

    if (this.currentOutputCallback) {
      // Find the safe length to stream without including parts of the end marker
      let safeLength = this.currentOutput.length;
      for (let i = this.endMarkerPrefix.length; i >= 1; i--) {
        const prefixCheck = this.endMarkerPrefix.substring(0, i);
        if (this.currentOutput.endsWith(prefixCheck)) {
          safeLength = this.currentOutput.length - i;
          break; // Found the longest matching suffix that is a prefix of the marker
        }
      }

      if (safeLength > this.sentOutputLength) {
        const chunk = this.currentOutput.substring(
          this.sentOutputLength,
          safeLength,
        );
        this.currentOutputCallback(chunk);
        this.sentOutputLength = safeLength;
      }
    }
  }

  private handleProcessEnd(): void {
    debugLogger.log(
      `Persistent shell process ended. isProcessing=${this.isProcessing}, queueLength=${this.queue.length}`,
    );
    if (this.isProcessing && this.currentRejecter) {
      debugLogger.log(
        `Persistent shell process exited unexpectedly while processing a command. Pending output: ${JSON.stringify(this.currentOutput)}`,
      );
      this.currentRejecter(
        new Error('Persistent shell process exited unexpectedly.'),
      );
    }
    this.isProcessing = false;
    this.hasSeenStartMarker = false;
    this.currentOutput = '';
    this.sentOutputLength = 0;

    const pendingQueue = this.queue;
    this.queue = [];
    for (const item of pendingQueue) {
      item.reject(new Error('Persistent shell process was terminated.'));
    }
  }

  async execute(
    command: string,
    cwd: string,
    onOutput: (data: string) => void,
    signal: AbortSignal,
  ): Promise<PersistentShellResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ command, cwd, onOutput, signal, resolve, reject });
      if (!this.isProcessing) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0 || this.isProcessing) return;

    this.isProcessing = true;
    const item = this.queue.shift();
    if (!item) {
      this.isProcessing = false;
      return;
    }
    const { command, cwd, onOutput, signal, resolve, reject } = item;

    try {
      await this.ensureInitialized();

      this.currentResolver = resolve;
      this.currentRejecter = reject;
      this.currentOutputCallback = onOutput;
      this.currentOutput = '';
      this.sentOutputLength = 0;
      this.currentExitCode = null;
      this.startMarker = `___GEMINI_START_MARKER_${Math.random().toString(36).substring(2)}___`;
      this.hasSeenStartMarker = false;

      // Construct wrapped command
      let wrappedCmd = '';
      const prefix1 = this.endMarkerPrefix.substring(0, 9);
      const prefix2 = this.endMarkerPrefix.substring(9);

      const start1 = this.startMarker.substring(0, 9);
      const start2 = this.startMarker.substring(9);

      if (this.shellType === 'powershell') {
        wrappedCmd = `Set-Location "${cwd}"; Write-Output ("${start1}" + "${start2}"); try { ${command} } finally { Write-Output ("${prefix1}" + "${prefix2}$LASTEXITCODE${this.endMarkerSuffix}") }\r\n`;
      } else if (this.shellType === 'cmd') {
        wrappedCmd = `call echo ${start1}^${start2} & pushd "${cwd}" && ${command} & set __code=%errorlevel% & popd & call echo ${prefix1}^${prefix2}%__code%${this.endMarkerSuffix}\r\n`;
      } else {
        // bash/zsh
        // Use stty sane and tput rmcup to restore terminal state if a previous command (like vim) left it in a bad state
        wrappedCmd = `stty sane 2>/dev/null; tput rmcup 2>/dev/null; tput sgr0 2>/dev/null; echo "${start1}""${start2}"; cd "${cwd}" && { ${command.trim().replace(/;$/, '')}; }; echo "${prefix1}""${prefix2}$?${this.endMarkerSuffix}"\n`;
      }

      const abortHandler = () => {
        if (this.pty) {
          this.pty.write('\x03'); // Send SIGINT
        } else if (this.child) {
          this.child.kill('SIGINT');
        }
        // We don't resolve yet, wait for the prompt to return or a timeout
        setTimeout(() => {
          if (this.isProcessing) {
            this.isProcessing = false;
            this.kill();
            resolve({
              output: this.currentOutput,
              exitCode: null,
              signal: null,
              aborted: true,
              error: null,
            });
            this.hasSeenStartMarker = false;
            void this.processQueue();
          }
        }, 1000);
      };

      signal.addEventListener('abort', abortHandler, { once: true });

      debugLogger.log(
        `Executing persistent command in ${this.shellType}: ${wrappedCmd.trim()}`,
      );

      if (this.pty) {
        this.pty.write(wrappedCmd);
      } else if (this.child) {
        this.child.stdin?.write(wrappedCmd);
      }
    } catch (err) {
      this.isProcessing = false;
      reject(err instanceof Error ? err : new Error(String(err)));
      void this.processQueue();
    }
  }

  kill(): void {
    if (this.pty) {
      try {
        (this.pty as IPty & { destroy?: () => void }).destroy?.();
        this.pty.kill();
      } catch {
        /* ignore */
      }
      this.pty = null;
    }
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.handleProcessEnd();
  }
}
