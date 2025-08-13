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
  SlashCommandActionReturn,
} from '../ui/commands/types.js';
import {
  DefaultArgumentProcessor,
  ShorthandArgumentProcessor,
} from './prompt-processors/argumentProcessor.js';
import {
  IPromptProcessor,
  SHORTHAND_ARGS_PLACEHOLDER,
  SHELL_INJECTION_TRIGGER,
} from './prompt-processors/types.js';
import {
  ConfirmationRequiredError,
  ShellProcessor,
} from './prompt-processors/shellProcessor.js';

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
   * Loads all commands from user, project, and extension directories.
   * Returns commands in order: user → project → extensions (alphabetically).
   *
   * Order is important for conflict resolution in CommandService:
   * - User/project commands (without extensionName) use "last wins" strategy
   * - Extension commands (with extensionName) get renamed if conflicts exist
   *
   * @param signal An AbortSignal to cancel the loading process.
   * @returns A promise that resolves to an array of all loaded SlashCommands.
   */
  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    const allCommands: SlashCommand[] = [];
    const globOptions = {
      nodir: true,
      dot: true,
      signal,
      follow: true,
    };

    // Load commands from each directory
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

        // Add all commands without deduplication
        allCommands.push(...commands);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(
            `[FileCommandLoader] Error loading commands from ${dirInfo.path}:`,
            error,
          );
        }
      }
    }

    return allCommands;
  }

  /**
   * Get all command directories in order for loading.
   * User commands → Project commands → Extension commands
   * This order ensures extension commands can detect all conflicts.
   */
  private getCommandDirectories(): CommandDirectory[] {
    const dirs: CommandDirectory[] = [];

    // 1. User commands
    dirs.push({ path: getUserCommandsDir() });

    // 2. Project commands (override user commands)
    dirs.push({ path: getProjectCommandsDir(this.projectRoot) });

    // 3. Extension commands (processed last to detect all conflicts)
    if (this.config) {
      const activeExtensions = this.config
        .getExtensions()
        .filter((ext) => ext.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically for deterministic loading

      const extensionCommandDirs = activeExtensions.map((ext) => ({
        path: path.join(ext.path, 'commands'),
        extensionName: ext.name,
      }));

      dirs.push(...extensionCommandDirs);
    }

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

    // Add extension name tag for extension commands
    const defaultDescription = `Custom command from ${path.basename(filePath)}`;
    let description = validDef.description || defaultDescription;
    if (extensionName) {
      description = `[${extensionName}] ${description}`;
    }

    const processors: IPromptProcessor[] = [];

    // Add the Shell Processor if needed.
    if (validDef.prompt.includes(SHELL_INJECTION_TRIGGER)) {
      processors.push(new ShellProcessor(baseCommandName));
    }

    // The presence of '{{args}}' is the switch that determines the behavior.
    if (validDef.prompt.includes(SHORTHAND_ARGS_PLACEHOLDER)) {
      processors.push(new ShorthandArgumentProcessor());
    } else {
      processors.push(new DefaultArgumentProcessor());
    }

    return {
      name: baseCommandName,
      description,
      kind: CommandKind.FILE,
      extensionName,
      action: async (
        context: CommandContext,
        _args: string,
      ): Promise<SlashCommandActionReturn> => {
        if (!context.invocation) {
          console.error(
            `[FileCommandLoader] Critical error: Command '${baseCommandName}' was executed without invocation context.`,
          );
          return {
            type: 'submit_prompt',
            content: validDef.prompt, // Fallback to unprocessed prompt
          };
        }

        try {
          let processedPrompt = validDef.prompt;
          for (const processor of processors) {
            processedPrompt = await processor.process(processedPrompt, context);
          }

          return {
            type: 'submit_prompt',
            content: processedPrompt,
          };
        } catch (e) {
          // Check if it's our specific error type
          if (e instanceof ConfirmationRequiredError) {
            // Halt and request confirmation from the UI layer.
            return {
              type: 'confirm_shell_commands',
              commandsToConfirm: e.commandsToConfirm,
              originalInvocation: {
                raw: context.invocation.raw,
              },
            };
          }
          // Re-throw other errors to be handled by the global error handler.
          throw e;
        }
      },
    };
  }
}
