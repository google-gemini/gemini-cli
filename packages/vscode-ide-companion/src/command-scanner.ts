/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { homedir } from '@google/gemini-cli-core';
import toml from '@iarna/toml';
import { glob } from 'glob';
import type {
  CustomCommand,
  CommandScannerOptions,
  CommandScanResult,
} from './types.js';

/**
 * Scans ~/.gemini/commands/ for .toml files and converts them
 * into CustomCommand objects for use in VS Code context menus.
 */
export class CommandScanner {
  private readonly commandsDir: string;
  private readonly shouldWatch: boolean;
  private readonly log: (message: string) => void;
  private watcher?: vscode.FileSystemWatcher;

  constructor(options: CommandScannerOptions = {}) {
    const homeDir = homedir();
    this.commandsDir =
      options.commandsDir || path.join(homeDir, '.gemini', 'commands');

    this.shouldWatch = options.watch ?? true;
    this.log = options.log || (() => undefined);
  }

  /**
   * Main entry point: Scan the commands directory and return all commands.
   *
   * @returns Promise resolving to scan results with commands and errors
   */
  async scanCommands(): Promise<CommandScanResult> {
    const result: CommandScanResult = {
      commands: [],
      errors: [],
    };

    try {
      await fs.access(this.commandsDir);
    } catch {
      this.log(
        `Commands directory does not exist: ${this.commandsDir}. No custom commands loaded.`,
      );
      return result;
    }

    try {
      const tomlFiles = await glob('**/*.toml', {
        cwd: this.commandsDir,
        nodir: true,
        dot: true,
        absolute: false,
      });

      for (const file of tomlFiles) {
        const command = await this.parseTomlFile(
          path.join(this.commandsDir, file),
        );
        if (command) {
          result.commands.push(command);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Error scanning commands directory: ${message}`);
      result.errors.push({
        filePath: this.commandsDir,
        error: message,
      });
    }

    return result;
  }

  /**
   * Parse a single .toml file into a CustomCommand.
   *
   * @param filePath Absolute path to the .toml file
   * @returns CustomCommand if valid, null if invalid/error
   */
  private async parseTomlFile(filePath: string): Promise<CustomCommand | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = toml.parse(content) as {
        prompt?: unknown;
        description?: unknown;
      };

      if (!parsed.prompt || typeof parsed.prompt !== 'string') {
        throw new Error("Missing required field 'prompt'");
      }

      if (parsed.description && typeof parsed.description !== 'string') {
        throw new Error("Field 'description' must be a string if provided");
      }

      const relativePath = path.relative(this.commandsDir, filePath);
      const nameInfo = this.getCommandNamesFromPath(relativePath);

      return {
        name: nameInfo.name,
        displayName: nameInfo.displayName,
        prompt: parsed.prompt,
        description:
          typeof parsed.description === 'string'
            ? parsed.description
            : undefined,
        filePath,
        isNested: nameInfo.isNested,
        category: nameInfo.category,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Error parsing ${filePath}: ${message}`);
      return null;
    }
  }

  /**
   * Convert relative file path to command naming information.
   *
   * Examples:
   *   "explain.toml" → { name: "explain", displayName: "Explain", isNested: false }
   *   "refactor/pure.toml" → { name: "refactor:pure", displayName: "Refactor: Pure", isNested: true, category: "refactor" }
   *
   * @param relativePath Path relative to commands directory (with .toml extension)
   */
  private getCommandNamesFromPath(relativePath: string): {
    name: string;
    displayName: string;
    isNested: boolean;
    category?: string;
  } {
    const withoutExt = relativePath.slice(0, -5);
    const parts = withoutExt.split(path.sep);
    const name = parts.join(':');
    const displayParts = parts.map((p) => capitalize(p));
    const displayName = displayParts.join(': ');
    const isNested = parts.length > 1;
    const category = isNested ? parts[0] : undefined;

    return {
      name,
      displayName,
      isNested,
      category,
    };
  }
  /**
   * Start watching the commands directory for changes.
   * Automatically reloads commands when .toml files are added, changed, or deleted.
   *
   * @param onCommandsChanged Callback to invoke when commands change
   * @returns FileSystemWatcher that can be disposed
   */
  watchCommands(onCommandsChanged: () => void): vscode.FileSystemWatcher {
    if (this.watcher) {
      this.watcher.dispose();
    }

    // Watch all .toml files in the commands directory (recursively)
    const pattern = new vscode.RelativePattern(this.commandsDir, '**/*.toml');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidCreate(onCommandsChanged);
    this.watcher.onDidChange(onCommandsChanged);
    this.watcher.onDidDelete(onCommandsChanged);

    return this.watcher;
  }

  /**
   * Stop watching and clean up resources.
   */
  dispose(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }
  }
}

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
