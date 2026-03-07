/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import type { IDEServer } from './ide-server.js';

/**
 * A Pseudoterminal implementation that wraps the Gemini CLI process.
 * This allows passing extra file descriptors (FDs) for IDE communication,
 * which is necessary in restricted environments like gVisor where TCP is blocked.
 */
export class GeminiCliTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose = this.closeEmitter.event;

  private child: ChildProcess | undefined;

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly ideServer: IDEServer,
    private readonly log: (message: string) => void,
  ) {}

  open(_initialDimensions: vscode.TerminalDimensions | undefined) {
    this.log(`Spawning Gemini CLI in ${this.workspaceFolder.uri.fsPath} with FD transport`);

    // We use -i "" to force interactive mode even if stdin is a pipe.
    // We pass stdio as ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']:
    // 0: stdin (pipe)
    // 1: stdout (pipe)
    // 2: stderr (pipe)
    // 3: IDE channel IN (pipe)
    // 4: IDE channel OUT (pipe)
    this.child = spawn('gemini', ['-i', ''], {
      cwd: this.workspaceFolder.uri.fsPath,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GEMINI_CLI_IDE_CHANNEL_FD_IN: '3',
        GEMINI_CLI_IDE_CHANNEL_FD_OUT: '4',
        // Force color output since we're in a terminal
        FORCE_COLOR: '1',
      },
    });

    this.child.stdout?.on('data', (data: Buffer) => {
      // VS Code terminals expect \r\n for new lines
      this.writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
    });

    this.child.stderr?.on('data', (data: Buffer) => {
      this.writeEmitter.fire(data.toString().replace(/\n/g, '\r\n'));
    });

    this.child.on('exit', (code) => {
      this.log(`Gemini CLI exited with code ${code}`);
      this.closeEmitter.fire(code ?? 0);
    });

    this.child.on('error', (err) => {
      this.log(`Error spawning Gemini CLI: ${err.message}`);
      this.writeEmitter.fire(`\r\nError spawning Gemini CLI: ${err.message}\r\n`);
      this.closeEmitter.fire(1);
    });

    if (this.child.stdio[3] && this.child.stdio[4]) {
      this.ideServer.attachFdTransport(
        this.child.stdio[4] as NodeJS.ReadableStream, // CLI writes to 4, IDE reads from it
        this.child.stdio[3] as NodeJS.WritableStream, // IDE writes to 3, CLI reads from it
      );
    } else {
      this.log('Failed to initialize IDE channel pipes');
    }
  }

  handleInput(data: string) {
    if (this.child?.stdin?.writable) {
      this.child.stdin.write(data);
    }
  }

  close() {
    if (this.child) {
      this.log('Closing Gemini CLI terminal, killing child process');
      this.child.kill();
      this.child = undefined;
    }
  }
}
