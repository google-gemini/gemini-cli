import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { MockGeminiAPI } from '../utils/mockGeminiAPI';

async function fileInfo(filePath: string): Promise<void> {
  console.log(chalk.green('// Pyrmethus conjures the File Inspector with Gemini’s aid!'));

  const suggestion = await MockGeminiAPI.getSuggestion('Get file metadata in TypeScript.');
  if (suggestion) console.log(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`The path '${filePath}' eludes the ether!`));
    const debug = await MockGeminiAPI.getSuggestion(`Debug path '${filePath}' not found.`);
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  try {
    console.log(chalk.cyan(`// Inspecting '${filePath}'...`));
    const stats = await fs.lstat(filePath);
    const info = [
      `Path: ${filePath}`,
      `Type: ${stats.isDirectory() ? 'Directory' : 'File'}`,
      `Size: ${stats.size} bytes`,
      `Permissions: ${stats.mode.toString(8)}`,
      `Last Modified: ${stats.mtime.toISOString()}`,
    ].join('\n');
    console.log(chalk.yellow(info));
    console.log(chalk.green(`Success! Metadata retrieved for '${filePath}'.`));
  } catch (error: any) {
    console.log(chalk.red(`The spirits falter: ${error.message}`));
    const debug = await MockGeminiAPI.getSuggestion(`Debug error: ${error.message}`);
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}

