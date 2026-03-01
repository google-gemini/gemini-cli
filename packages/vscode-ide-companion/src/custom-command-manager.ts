/**
 * @license
 * Copyright 2025 Google LLC
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

    // Register the main command that shows quick pick
    this.registerMainCommand(context);

    // Set up file watching for auto-reload
    const watcher = this.scanner.watchCommands(async () => {
      await this.reload(context);
    });
    context.subscriptions.push(watcher);

    // Show notification if commands were loaded
    if (result.commands.length > 0) {
      vscode.window.showInformationMessage(
        `Loaded ${result.commands.length} Gemini custom command(s)`,
      );
    }
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

    const workspaceFolder = workspaceFolders[0];

    try {
      const escapedText = selectedText.replace(/'/g, "'\\''");
      const escapedPrompt = cmd.prompt.replace(/'/g, "'\\''");
      const geminiCommand = `gemini '${escapedPrompt}' <<< '${escapedText}'`;

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
        terminal.show();
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        terminal.show();
      }

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
