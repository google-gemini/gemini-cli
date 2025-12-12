/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { glob } from 'glob';
import type { CommandModule } from 'yargs';
import fs from 'node:fs/promises';
import path from 'node:path';
import toml from '@iarna/toml';
import { spawn } from 'node:child_process';

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

async function createCommandFromFile(
  filePath: string,
  baseDir: string,
): Promise<CommandModule | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = toml.parse(content);
    const commandName = path
      .relative(baseDir, filePath)
      .replace(/\\/g, '/')
      .replace(/\.toml$/, '');
    const description = (parsed as { description?: unknown }).description;
    const prompt = (parsed as { prompt?: unknown }).prompt;

    if (typeof description !== 'string' || !description) {
      console.error(`Description is missing or not a string in ${filePath}`);
      return null;
    }

    if (typeof prompt !== 'string' || !prompt) {
      console.error(`Prompt is missing or not a string in ${filePath}`);
      return null;
    }

    const handler = () => {
      const child = spawn(process.execPath, [process.argv[1], '-p', prompt], {
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        process.exit(code ?? 0);
      });
    };

    return {
      command: commandName,
      describe: description,
      handler,
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
    const files = await glob('**/*.toml', { cwd: commandsDir, nodir: true });
    const commandPromises: Array<Promise<CommandModule | null>> = [];

    for (const file of files) {
      const fullPath = path.join(commandsDir, file);
      commandPromises.push(createCommandFromFile(fullPath, commandsDir));
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
