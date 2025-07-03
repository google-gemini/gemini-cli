import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { MockGeminiAPI } from '../utils/mockGeminiAPI';

export async function listFiles(dirPath: string, filter: string = ''): Promise<void> {
  console.log(chalk.green('// Pyrmethus conjures the File Lister with Gemini’s aid!'));

  const suggestion = await MockGeminiAPI.getSuggestion('List directory contents in TypeScript.');
  if (suggestion) console.log(chalk.yellow(`// Gemini’s wisdom: ${suggestion}`));

  const targetPath = dirPath || '/data/data/com.termux/files/home';
  if (!fs.existsSync(targetPath)) {
    console.log(chalk.red(`The path '${targetPath}' eludes the ether!`));
    const debug = await MockGeminiAPI.getSuggestion(`Debug path '${targetPath}' not found.`);
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
    return;
  }

  try {
    console.log(chalk.cyan(`// Listing contents of '${targetPath}'...`));
    const files = await fs.readdir(targetPath, { withFileTypes: true });
    const filteredFiles = filter ? files.filter((f: any) => f.name.includes(filter)) : files;
    const result = filteredFiles.map((f: any) => {
      const type = f.isDirectory() ? '[DIR]' : '[FILE]';
      return `${type} ${f.name}`;
    }).join('\n');
    console.log(chalk.yellow(result || 'No files found.'));
    console.log(chalk.green(`Success! Listed ${filteredFiles.length} items in '${targetPath}'.`));
  } catch (error: any) {
    console.log(chalk.red(`The spirits falter: ${error.message}`));
    const debug = await MockGeminiAPI.getSuggestion(`Debug error: ${error.message}`);
    if (debug) console.log(chalk.yellow(`// Gemini’s debug: ${debug}`));
  }
}
