// ts-tools/grep_tool.ts

import { runShellCommand } from './utils';

/**
 * @description Searches for a pattern in files.
 * @param {string[]} args - The arguments for the grep tool. e.g., ['pattern', 'file1', 'file2']
 * @returns {Promise<string>} The output of the grep command.
 */
export async function grepTool(args: string[]): Promise<string> {
  if (args.length < 2) {
    return Promise.reject('Usage: grep <pattern> <file...>');
  }

  const [pattern, ...files] = args;

  // We can use the native 'grep' command for this.
  // This demonstrates how a TypeScript tool can wrap a core shell utility.
  const result = await runShellCommand('grep', [pattern, ...files]);

  if (result.stderr) {
    return Promise.reject(`Error running grep: ${result.stderr}`);
  }

  return result.stdout;
}