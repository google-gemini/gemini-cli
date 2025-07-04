// ts-tools/ls_tool.ts

import { runShellCommand } from './utils';

/**
 * @description Lists files and directories.
 * @param {string[]} args - The arguments for the ls tool. e.g., ['-la', '/path/to/dir']
 * @returns {Promise<string>} The output of the ls command.
 */
export async function lsTool(args: string[]): Promise<string> {
  // We can use the native 'ls' command for this.
  // This demonstrates how a TypeScript tool can wrap a core shell utility.
  const result = await runShellCommand('ls', args);

  if (result.stderr) {
    return Promise.reject(`Error running ls: ${result.stderr}`);
  }

  return result.stdout;
}
