/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { CommandScanner } from './command-scanner.js';
import type { CustomCommand } from './types.js';

/**
 * Manages custom commands from ~/.gemini/commands/
 * Handles scanning, registration, and execution.
 */
export class CustomCommandManager {
  private scanner: CommandScanner;
  private readonly log: (message: string) => void;
  private registeredCommands: vscode.Disposable[] = [];
  private availableCommands: CustomCommand[] = [];
  private sharedTerminal: vscode.Terminal | undefined;
  private commandsNeedingHash: Set<string> = new Set();

  constructor(log: (message: string) => void) {
    this.log = log;
    this.scanner = new CommandScanner({ log });
  }

  /**
   * Initialize: scan and register all custom commands
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    // Scan for commands
    const result = await this.scanner.scanCommands();

    if (result.errors.length > 0) {
      this.log(
        `Warning: ${result.errors.length} command file(s) failed to load`,
      );
    }

    this.log(
      `Found ${result.commands.length} custom command(s) in ~/.gemini/commands`,
    );

    // Store commands
    this.availableCommands = result.commands;

    // Detect collisions: track which commands need hash suffix
    this.detectCollisions(result.commands);

    // Register the main command that shows quick pick
    this.registerMainCommand(context);

    // Set up file watching for auto-reload
    const watcher = this.scanner.watchCommands(async () => {
      await this.reload(context);
    });
    context.subscriptions.push(watcher);

    if (result.commands.length > 0) {
      vscode.window.showInformationMessage(
        `Loaded ${result.commands.length} Gemini custom command(s)`,
      );
    }
  }

  /**
   * Detect filename collisions and mark commands that need hash suffix
   */
  private detectCollisions(commands: CustomCommand[]): void {
    const nameToFilePaths = new Map<string, string[]>();

    // Group commands by their sanitized names
    commands.forEach((cmd) => {
      const safeName = cmd.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const existing = nameToFilePaths.get(safeName) || [];
      existing.push(cmd.filePath);
      nameToFilePaths.set(safeName, existing);
    });

    // Mark all commands with duplicate sanitized names
    this.commandsNeedingHash.clear();
    nameToFilePaths.forEach((filePaths) => {
      if (filePaths.length > 1) {
        // Collision detected - all these commands need hash
        filePaths.forEach((fp) => {
          this.commandsNeedingHash.add(fp);
        });
      }
    });
  }

  /**
   * Register the main command that shows quick pick
   */
  private registerMainCommand(context: vscode.ExtensionContext): void {
    // Dispose old registration
    this.registeredCommands.forEach((d) => {
      d.dispose();
    });
    this.registeredCommands = [];

    const disposable = vscode.commands.registerCommand(
      'gemini-cli.runCustomCommand',
      async () => {
        await this.showQuickPick();
      },
    );

    this.registeredCommands.push(disposable);
    context.subscriptions.push(disposable);
  }

  /**
   * Execute a custom command with selected text
   */
  private async executeCommand(cmd: CustomCommand): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    // Get selected text
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
      vscode.window.showWarningMessage(
        'Please select code before running this command',
      );
      return;
    }

    // Get workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(
        'No folder open. Please open a folder to run Gemini CLI.',
      );
      return;
    }

    let workspaceFolder: vscode.WorkspaceFolder | undefined;
    if (workspaceFolders.length === 1) {
      workspaceFolder = workspaceFolders[0];
    } else {
      workspaceFolder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: 'Select a folder to run the Gemini command in',
      });
    }

    if (!workspaceFolder) {
      return;
    }

    try {
      const tmpDir = vscode.Uri.joinPath(workspaceFolder.uri, '.gemini');

      const safeName = cmd.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      let readableFileName: string;

      if (this.commandsNeedingHash.has(cmd.filePath)) {
        // Collision detected - add hash for uniqueness
        const { createHash } = await import('node:crypto');
        const hash = createHash('sha256')
          .update(cmd.filePath)
          .digest('hex')
          .slice(0, 8);
        readableFileName = `${safeName}-${hash}.txt`;
      } else {
        // No collision - use clean name
        readableFileName = `${safeName}.txt`;
      }

      const tmpFile = vscode.Uri.joinPath(tmpDir, readableFileName);

      await vscode.workspace.fs.createDirectory(tmpDir);

      // Escape special sequences that Gemini CLI interprets
      // Order matters: escape backslashes first to prevent bypass attacks
      const sanitizedText = selectedText
        .replace(/\\/g, '\\\\')
        .replace(/!{/g, '\\!{')
        .replace(/@{/g, '\\@{')
        .replace(/{{/g, '\\{{')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const fullContent = `${cmd.prompt}\n\n${sanitizedText}`;
      await vscode.workspace.fs.writeFile(
        tmpFile,
        Buffer.from(fullContent, 'utf-8'),
      );

      const geminiCommand = `gemini @.gemini/${readableFileName}`;

      let terminal = this.sharedTerminal;

      if (terminal && terminal.exitStatus !== undefined) {
        terminal = undefined;
        this.sharedTerminal = undefined;
      }

      if (!terminal) {
        terminal = vscode.window.createTerminal({
          name: 'Gemini Custom Commands',
          cwd: workspaceFolder.uri.fsPath,
        });
        this.sharedTerminal = terminal;
      }

      terminal.show();
      terminal.sendText(geminiCommand, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to execute command: ${message}`);
      this.log(`Error executing command ${cmd.name}: ${message}`);
    }
  }

  /**
   * Show quick pick menu for command selection
   */
  private async showQuickPick(): Promise<void> {
    if (this.availableCommands.length === 0) {
      vscode.window.showInformationMessage(
        'No custom commands found in ~/.gemini/commands/',
      );
      return;
    }

    const items = this.availableCommands.map((cmd) => ({
      label: cmd.displayName,
      description: cmd.description || cmd.filePath,
      command: cmd,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a custom Gemini command to run',
      matchOnDescription: true,
    });

    if (selected) {
      await this.executeCommand(selected.command);
    }
  }

  /**
   * Reload all commands (called when files change)
   */
  private async reload(_context: vscode.ExtensionContext): Promise<void> {
    const result = await this.scanner.scanCommands();
    this.availableCommands = result.commands;

    // Re-detect collisions after reload
    this.detectCollisions(result.commands);

    vscode.window.showInformationMessage(
      `Reloaded ${result.commands.length} custom command(s)`,
    );
  }

  /**
   * Cleanup on extension deactivation
   */
  dispose(): void {
    this.registeredCommands.forEach((d) => {
      d.dispose();
    });
    this.scanner.dispose();

    if (this.sharedTerminal) {
      this.sharedTerminal.dispose();
    }
  }
}
