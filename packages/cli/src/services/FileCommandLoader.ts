/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import toml from '@iarna/toml';
import {
  Config,
  getProjectCommandsDir,
  getUserCommandsDir,
} from '@google/gemini-cli-core';
import { ICommandLoader } from './types.js';
import { CommandKind, SlashCommand } from '../ui/commands/types.js';

/**
 * Defines the structure of a valid command definition within a .toml file.
 * This is the raw shape of the data after being parsed from TOML.
 */
interface TomlCommandDef {
  prompt: string;
  description?: string;
}

/**
 * A type guard to safely validate that a parsed TOML object conforms to our
 * required command definition structure.
 *
 * @param obj The unknown object parsed from a TOML file.
 * @returns True if the object is a valid TomlCommandDef, false otherwise.
 */
function isTomlCommandDef(obj: unknown): obj is TomlCommandDef {
  // Basic check for an object-like structure.
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  // Check that 'prompt' is a non-empty string.
  const hasPrompt =
    'prompt' in obj && typeof (obj as TomlCommandDef).prompt === 'string';

  // Check that 'description', if it exists, is a string.
  const hasValidDescription =
    !('description' in obj) ||
    typeof (obj as TomlCommandDef).description === 'string';

  return hasPrompt && hasValidDescription;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Discovers and loads custom slash commands from .toml files in both the
 * user's global config directory and the current project's directory.
 *
 * This loader is responsible for:
 * - Recursively scanning command directories.
 * - Parsing and validating TOML files.
 * - Adapting valid definitions into executable SlashCommand objects.
 * - Handling file system errors and malformed files gracefully.
 */
export class FileCommandLoader implements ICommandLoader {
  private readonly projectRoot: string;

  constructor(private readonly config: Config | null) {
    this.projectRoot = config?.getProjectRoot() || process.cwd();
  }

  /**
   * Loads all commands, applying the precedence rule where project-level
   * commands override user-level commands with the same name.
   * @param signal An AbortSignal to cancel the loading process.
   * @returns A promise that resolves to an array of loaded SlashCommands.
   */
  async loadCommands(signal?: AbortSignal): Promise<SlashCommand[]> {
    const userDir = getUserCommandsDir();
    const projectDir = getProjectCommandsDir(this.projectRoot);

    const [userCommands, projectCommands] = await Promise.all([
      this.loadCommandsFromDir(userDir, userDir, signal),
      this.loadCommandsFromDir(projectDir, projectDir, signal),
    ]);

    const commandMap = new Map<string, SlashCommand>();
    for (const cmd of userCommands) {
      commandMap.set(cmd.name, cmd);
    }
    for (const cmd of projectCommands) {
      commandMap.set(cmd.name, cmd);
    }

    return Array.from(commandMap.values());
  }

  /**
   * Recursively scans a directory for .toml files and adapts them into commands.
   * @param baseDir The root command directory (e.g., ~/.gemini/commands) used
   *   to calculate the command's relative path name.
   * @param currentDir The directory currently being scanned.
   * @param signal An AbortSignal to cancel the loading process.
   * @returns A promise resolving to an array of commands found in the directory.
   */
  private async loadCommandsFromDir(
    baseDir: string,
    currentDir: string,
    signal?: AbortSignal,
  ): Promise<SlashCommand[]> {
    if (signal?.aborted) {
      return [];
    }

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      const commands: SlashCommand[] = [];

      for (const entry of entries) {
        if (signal?.aborted) break;

        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          const subCommands = await this.loadCommandsFromDir(
            baseDir,
            fullPath,
            signal,
          );
          commands.push(...subCommands);
        } else if (entry.isFile() && entry.name.endsWith('.toml')) {
          const command = await this.parseAndAdaptFile(fullPath, baseDir);
          if (command) {
            commands.push(command);
          }
        }
      }
      return commands;
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code !== 'ENOENT') {
        console.error(
          `[FileCommandLoader] Error reading directory ${currentDir}:`,
          error.message,
        );
      }
      return [];
    }
  }

  /**
   * Parses a single .toml file and transforms it into a SlashCommand object.
   * @param filePath The absolute path to the .toml file.
   * @param baseDir The root command directory for name calculation.
   * @returns A promise resolving to a SlashCommand, or null if the file is invalid.
   */
  private async parseAndAdaptFile(
    filePath: string,
    baseDir: string,
  ): Promise<SlashCommand | null> {
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (isErrnoException(error)) {
        console.error(
          `[FileCommandLoader] Failed to read file ${filePath}:`,
          error.message,
        );
      }
      return null;
    }

    let parsed: unknown;
    try {
      parsed = toml.parse(fileContent);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(
          `[FileCommandLoader] Failed to parse TOML file ${filePath}:`,
          error.message,
        );
      }
      return null;
    }

    if (!isTomlCommandDef(parsed)) {
      console.error(
        `[FileCommandLoader] Skipping invalid command file: ${filePath}. It must contain a 'prompt' string.`,
      );
      return null;
    }

    const relativePath = path
      .relative(baseDir, filePath)
      .replace(/\.toml$/, '');
    const commandName = relativePath
      .split(path.sep)
      // Sanitize each path segment to prevent ambiguity. Since ':' is our
      // namespace separator, we replace any literal colons in filenames
      // with underscores to avoid naming conflicts.
      .map((segment) => segment.replace(/:/g, '_'))
      .join(':');

    return {
      name: commandName,
      description:
        parsed.description || `Custom command from ${path.basename(filePath)}`,
      kind: CommandKind.FILE,
      action: async () => ({
        type: 'submit_prompt',
        content: parsed.prompt,
      }),
    };
  }
}
