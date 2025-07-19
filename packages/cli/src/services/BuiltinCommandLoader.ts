/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ICommandLoader } from './types.js';
import { SlashCommand, SlashCommandDefinition } from '../ui/commands/types.js';
import { Config } from '@google/gemini-cli-core';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { bugCommand } from '../ui/commands/bugCommand.js';
import { chatCommand } from '../ui/commands/chatCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { compressCommand } from '../ui/commands/compressCommand.js';
import { corgiCommand } from '../ui/commands/corgiCommand.js';
import { docsCommand } from '../ui/commands/docsCommand.js';
import { editorCommand } from '../ui/commands/editorCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { quitCommand } from '../ui/commands/quitCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { toolsCommand } from '../ui/commands/toolsCommand.js';

/**
 * Recursively transforms a raw SlashCommandDefinition into a fully hydrated
 * SlashCommand by adding the required 'built-in' metadata.
 *
 * @param definition The raw command definition.
 * @returns A new SlashCommand object with metadata applied recursively.
 */
function addBuiltinMetadata(definition: SlashCommandDefinition): SlashCommand {
  const { subCommands, ...rest } = definition;

  const command: SlashCommand = {
    ...rest,
    // Add the required metadata.
    metadata: {
      source: 'built-in',
      behavior: 'Custom',
    },

    subCommands: subCommands ? subCommands.map(addBuiltinMetadata) : undefined,
  };

  return command;
}

/**
 * Loads the core, hard-coded slash commands that are an integral part
 * of the Gemini CLI application. It is responsible for taking the raw
 * command definitions and transforming them to include the necessary
 * system-level metadata before they are used by the rest of the application.
 */
export class BuiltinCommandLoader implements ICommandLoader {
  constructor(private config: Config | null) {}

  /**
   * Gathers all raw built-in command definitions, injects dependencies where
   * needed (e.g., config), filters out any that are not available, and
   * transforms them into the final SlashCommand structure.
   *
   * @returns A promise that resolves to an array of fully-formed `SlashCommand` objects.
   */
  async loadCommands(): Promise<SlashCommand[]> {
    const allDefinitions: Array<SlashCommandDefinition | null> = [
      aboutCommand,
      authCommand,
      bugCommand,
      chatCommand,
      clearCommand,
      compressCommand,
      corgiCommand,
      docsCommand,
      editorCommand,
      extensionsCommand,
      helpCommand,
      ideCommand(this.config),
      mcpCommand,
      memoryCommand,
      privacyCommand,
      quitCommand,
      restoreCommand(this.config),
      statsCommand,
      themeCommand,
      toolsCommand,
    ];

    return allDefinitions
      .filter((cmd): cmd is SlashCommandDefinition => cmd !== null)
      .map(addBuiltinMetadata);
  }
}
