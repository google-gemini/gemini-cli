// ts-tools/find-files.ts

import { runShellCommand } from './utils';

/**
 * @description Finds files by name or content.
 * @param {string[]} args - The arguments for the find-files tool. e.g., ['--name', '*.ts', '--content', 'myFunction']
 * @returns {Promise<string>} A list of files that match the criteria.
 */
export async function findFiles(args: string[]): Promise<string> {
  if (args.length === 0) {
    return Promise.reject('Usage: find-files [--name <pattern>] [--content <pattern>]');
  }

  let namePattern: string | undefined;
  let contentPattern: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && i + 1 < args.length) {
      namePattern = args[i + 1];
      i++;
    } else if (args[i] === '--content' && i + 1 < args.length) {
      contentPattern = args[i + 1];
      i++;
    }
  }

  let findCommand = 'find .';
  if (namePattern) {
    findCommand += ` -name "${namePattern}"`;
  }

  if (contentPattern) {
    findCommand += ` -type f -exec grep -l "${contentPattern}" {} +`;
  }

  const result = await runShellCommand(findCommand, []);

  if (result.stderr) {
    return Promise.reject(`Error finding files: ${result.stderr}`);
  }

  return result.stdout;
}
