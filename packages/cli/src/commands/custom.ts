/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import fs from 'node:fs/promises';
import path from 'node:path';
import toml from '@iarna/toml';

async function findGeminiDir(): Promise<string | null> {
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const geminiDir = path.join(currentDir, '.gemini');
    try {
      const stats = await fs.stat(geminiDir);
      if (stats.isDirectory()) {
        return geminiDir;
      }
    } catch (_error) {
      // Ignore error if .gemini doesn't exist
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

// Basic handler for all custom commands.
const customCommandHandler = (argv: { [key: string]: unknown }) => {
  // The actual command execution is handled by a different part of the system
  // that interprets the prompt from the .toml file.
  // For the purpose of `yargs` parsing and autocompletion, we just need a valid handler.
  // We can also log this for debugging if needed.
  console.log(`Executing custom command: ${argv['$0']}`);
};

async function createCommandFromFile(
  filePath: string,
): Promise<CommandModule | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = toml.parse(content);
    const commandName = path.basename(filePath, '.toml');
    const description = (parsed as { description?: unknown }).description;
    if (typeof description !== 'string' || !description) {
      return null;
    }

    return {
      command: commandName,
      describe: description,
      handler: customCommandHandler,
    };
  } catch (_error) {
    // Log error for debugging, but don't crash
    console.error(`Failed to load custom command from ${filePath}:`, _error);
    return null;
  }
}

export async function loadCustomCommands(): Promise<CommandModule[]> {
  const geminiDir = await findGeminiDir();

  if (!geminiDir) {
    return [];
  }

  const commandsDir = path.join(geminiDir, 'commands');

  try {
    const dirents = await fs.readdir(commandsDir, { withFileTypes: true });
    const commandPromises: Array<Promise<CommandModule | null>> = [];

    for (const dirent of dirents) {
      if (dirent.isFile() && dirent.name.endsWith('.toml')) {
        const fullPath = path.join(commandsDir, dirent.name);
        commandPromises.push(createCommandFromFile(fullPath));
      }
      // Note: This implementation does not handle subdirectories for now,
      // but it can be extended here if needed.
    }

    const commands = (await Promise.all(commandPromises)).filter(
      (cmd): cmd is CommandModule => cmd !== null,
    );

    return commands;
  } catch (_error) {
    // If the directory doesn't exist or there's a reading error, do nothing.
    return [];
  }
}
