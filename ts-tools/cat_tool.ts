// ts-tools/cat_tool.ts

import { runShellCommand } from './utils';

/**
 * @description Concatenates and displays the content of files.
 * @param {string[]} args - The arguments for the cat tool. e.g., ['file1.txt', 'file2.txt']
 * @returns {Promise<string>} The concatenated content of the files.
 */
export async function catTool(args: string[]): Promise<string> {
  if (args.length === 0) {
    return Promise.reject('Usage: cat <file...>');
  }

  // We can use the native 'cat' command for this.
  const result = await runShellCommand('cat', args);

  if (result.stderr) {
    return Promise.reject(`Error running cat: ${result.stderr}`);
  }

  return result.stdout;
}