// ts-tools/grep_tool.ts

import { runShellCommand } from './utils';

/**
 * @description Searches for a pattern in files with support for common grep options.
 * @param {string[]} args - The arguments for the grep tool. 
 *   e.g., ['-i', '-n', '-C', '2', 'pattern', 'file1', 'dir1']
 *   Supports:
 *     -i: Case-insensitive search.
 *     -n: Show line numbers.
 *     -r: Recursive search.
 *     -C <num>: Show <num> lines of context.
 *     -A <num>: Show <num> lines of trailing context.
 *     -B <num>: Show <num> lines of leading context.
 * @returns {Promise<string>} The output of the grep command.
 */
export async function grepTool(args: string[]): Promise<string> {
  if (args.length < 2) {
    return Promise.reject('Usage: grep [options] <pattern> <file_or_dir...>');
  }

  const grepArgs: string[] = [];
  const filesAndPattern: string[] = [];

  // Argument parsing loop
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      // Handle flags that take a value
      if ((arg === '-C' || arg === '-A' || arg === '-B') && i + 1 < args.length) {
        grepArgs.push(arg, args[i + 1]);
        i++; // Skip the next argument since it's a value for the flag
      } else {
        // Handle simple flags
        grepArgs.push(arg);
      }
    } else {
      // This is the pattern or a file/directory path
      filesAndPattern.push(arg);
    }
  }

  if (filesAndPattern.length < 2) {
    return Promise.reject('Usage: grep [options] <pattern> <file_or_dir...>');
  }

  const [pattern, ...files] = filesAndPattern;
  
  // Construct the final command arguments
  const finalArgs = [...grepArgs, pattern, ...files];

  // We use the native 'grep' command, but with our parsed and validated arguments.
  const result = await runShellCommand('grep', finalArgs);

  // Grep returns exit code 1 if no lines were selected, which is not a true error.
  // We only reject if there is something on stderr.
  if (result.stderr) {
    return Promise.reject(`Error running grep: ${result.stderr}`);
  }

  if (!result.stdout.trim() && result.exitCode === 1) {
      return 'No matches found.';
  }

  return result.stdout;
}
