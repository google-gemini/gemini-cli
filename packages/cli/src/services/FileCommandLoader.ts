/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import toml from '@iarna/toml';
import { glob } from 'glob';
import { z } from 'zod';
import {
  Config,
  getProjectCommandsDir,
  getUserCommandsDir,
} from '@google/gemini-cli-core';
import { ICommandLoader } from './types.js';
import { CommandKind, SlashCommand } from '../ui/commands/types.js';

interface CommandDirectory {
  path: string;
  extensionName?: string;
}

/**
 * Defines the Zod schema for a command definition file. This serves as the
 * single source of truth for both validation and type inference.
 */
const TomlCommandDefSchema = z.object({
  prompt: z.string({
    required_error: "The 'prompt' field is required.",
    invalid_type_error: "The 'prompt' field must be a string.",
  }),
  description: z.string().optional(),
});

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
  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    const commandMap = new Map<string, SlashCommand>();
    const globOptions = {
      nodir: true,
      dot: true,
      signal,
    };

    // Load commands from each directory in order
    // Later directories override commands from earlier ones
    const commandDirs = this.getCommandDirectories();
    for (const dirInfo of commandDirs) {
      try {
        const files = await glob('**/*.toml', {
          ...globOptions,
          cwd: dirInfo.path,
        });

        const commandPromises = files.map((file) =>
          this.parseAndAdaptFile(
            path.join(dirInfo.path, file),
            dirInfo.path,
            dirInfo.extensionName,
          ),
        );

        const commands = (await Promise.all(commandPromises)).filter(
          (cmd): cmd is SlashCommand => cmd !== null,
        );

        // Add/override commands in the map
        for (const cmd of commands) {
          commandMap.set(cmd.name, cmd);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(
            `[FileCommandLoader] Error loading commands from ${dirInfo.path}:`,
            error,
          );
        }
      }
    }

    return Array.from(commandMap.values());
  }

  /**
   * Get all command directories in precedence order (lowest to highest).
   * Extension commands < User commands < Project commands
   */
  private getCommandDirectories(): CommandDirectory[] {
    const dirs: CommandDirectory[] = [];

    // 1. Extension commands (lowest precedence)
    if (this.config) {
      const activeExtensions = this.config
        .getExtensions()
        .filter((ext) => ext.isActive);

      const extensionCommandDirs = activeExtensions.map((ext) => ({
        path: path.join(ext.path, 'commands'),
        extensionName: ext.name,
      }));

      dirs.push(...extensionCommandDirs);
    }

    // 2. User commands
    dirs.push({ path: getUserCommandsDir() });

    // 3. Project commands (highest precedence)
    dirs.push({ path: getProjectCommandsDir(this.projectRoot) });

    return dirs;
  }

  /**
   * Parses a single .toml file and transforms it into a SlashCommand object.
   * @param filePath The absolute path to the .toml file.
   * @param baseDir The root command directory for name calculation.
   * @param extensionName Optional extension name to prefix commands with.
   * @returns A promise resolving to a SlashCommand, or null if the file is invalid.
   */
  private async parseAndAdaptFile(
    filePath: string,
    baseDir: string,
    extensionName?: string,
  ): Promise<SlashCommand | null> {
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      console.error(
        `[FileCommandLoader] Failed to read file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }

    let parsed: unknown;
    try {
      parsed = toml.parse(fileContent);
    } catch (error: unknown) {
      console.error(
        `[FileCommandLoader] Failed to parse TOML file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }

    const validationResult = TomlCommandDefSchema.safeParse(parsed);

    if (!validationResult.success) {
      console.error(
        `[FileCommandLoader] Skipping invalid command file: ${filePath}. Validation errors:`,
        validationResult.error.flatten(),
      );
      return null;
    }

    const validDef = validationResult.data;

    const relativePathWithExt = path.relative(baseDir, filePath);
    const relativePath = relativePathWithExt.substring(
      0,
      relativePathWithExt.length - 5, // length of '.toml'
    );
    const baseCommandName = relativePath
      .split(path.sep)
      // Sanitize each path segment to prevent ambiguity. Since ':' is our
      // namespace separator, we replace any literal colons in filenames
      // with underscores to avoid naming conflicts.
      .map((segment) => segment.replaceAll(':', '_'))
      .join(':');

    // Prefix with extension name if this is an extension command
    const commandName = extensionName
      ? `ext:${extensionName}:${baseCommandName}`
      : baseCommandName;

    // Update description to indicate source
    const defaultDescription = extensionName
      ? `Custom command from ${extensionName} extension`
      : `Custom command from ${path.basename(filePath)}`;

    return {
      name: commandName,
      description: validDef.description || defaultDescription,
      kind: CommandKind.FILE,
      action: async () => ({
        type: 'submit_prompt',
        content: validDef.prompt,
      }),
    };
  }
}
