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
import {
  CommandContext,
  CommandKind,
  SlashCommand,
  SubmitPromptActionReturn,
} from '../ui/commands/types.js';
import {
  DefaultArgumentProcessor,
  ShorthandArgumentProcessor,
} from './prompt-processors/argumentProcessor.js';
import {
  IPromptProcessor,
  SHORTHAND_ARGS_PLACEHOLDER,
} from './prompt-processors/types.js';

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

    try {
      // User Commands
      const userDir = getUserCommandsDir();
      const userFiles = await glob('**/*.toml', {
        ...globOptions,
        cwd: userDir,
      });
      const userCommandPromises = userFiles.map((file) =>
        this.parseAndAdaptFile(path.join(userDir, file), userDir),
      );
      const userCommands = (await Promise.all(userCommandPromises)).filter(
        (cmd): cmd is SlashCommand => cmd !== null,
      );
      for (const cmd of userCommands) {
        commandMap.set(cmd.name, cmd);
      }

      // Project Commands (these intentionally override user commands)
      const projectDir = getProjectCommandsDir(this.projectRoot);
      const projectFiles = await glob('**/*.toml', {
        ...globOptions,
        cwd: projectDir,
      });
      const projectCommandPromises = projectFiles.map((file) =>
        this.parseAndAdaptFile(path.join(projectDir, file), projectDir),
      );
      const projectCommands = (
        await Promise.all(projectCommandPromises)
      ).filter((cmd): cmd is SlashCommand => cmd !== null);
      for (const cmd of projectCommands) {
        commandMap.set(cmd.name, cmd);
      }
    } catch (error) {
      console.error(`[FileCommandLoader] Error during file search:`, error);
    }

    return Array.from(commandMap.values());
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
    const commandName = relativePath
      .split(path.sep)
      // Sanitize each path segment to prevent ambiguity. Since ':' is our
      // namespace separator, we replace any literal colons in filenames
      // with underscores to avoid naming conflicts.
      .map((segment) => segment.replaceAll(':', '_'))
      .join(':');

    const processors: IPromptProcessor[] = [];

    // The presence of '{{args}}' is the switch that determines the behavior.
    if (validDef.prompt.includes(SHORTHAND_ARGS_PLACEHOLDER)) {
      processors.push(new ShorthandArgumentProcessor());
    } else {
      processors.push(new DefaultArgumentProcessor());
    }

    return {
      name: commandName,
      description:
        validDef.description ||
        `Custom command from ${path.basename(filePath)}`,
      kind: CommandKind.FILE,
      action: async (
        context: CommandContext,
        _args: string,
      ): Promise<SubmitPromptActionReturn> => {
        if (!context.invocation) {
          console.error(
            `[FileCommandLoader] Critical error: Command '${commandName}' was executed without invocation context.`,
          );
          return {
            type: 'submit_prompt',
            content: validDef.prompt, // Fallback to unprocessed prompt
          };
        }

        let processedPrompt = validDef.prompt;
        for (const processor of processors) {
          processedPrompt = await processor.process(processedPrompt, context);
        }

        return {
          type: 'submit_prompt',
          content: processedPrompt,
        };
      },
    };
  }
}
