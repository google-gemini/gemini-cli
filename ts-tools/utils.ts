// ts-tools/utils.ts

import { exec } from 'child_process';

/**
 * @description Executes a shell command and returns the output.
 * @param {string} command - The command to execute.
 * @param {string[]} args - The arguments for the command.
 * @returns {Promise<{stdout: string, stderr: string}>} The stdout and stderr of the command.
 */
export function runShellCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const fullCommand = `${command} ${args.join(' ')}`;
    exec(fullCommand, (error, stdout, stderr) => {
      if (error) {
        // Even if there's an error, we might still have stderr, so we resolve with it.
        resolve({ stdout: '', stderr: stderr || error.message });
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
