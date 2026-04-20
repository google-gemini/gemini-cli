/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { parse as shellParse } from 'shell-quote';
import {
  extractStringFromParseEntry,
  initializeShellParsers,
  splitCommands,
  stripShellWrapper,
  normalizeCommand,
  hasRedirection,
} from '../../utils/shell-utils.js';
import {
  findGitSubcommand,
  gitHasConfigOverrideGlobalOption,
  gitSubcommandArgsAreReadOnly,
  gitBranchIsReadOnly,
} from '../utils/commandSafety.js';

/**
 * Determines if a command is strictly approved for execution on Windows.
 * A command is approved if it's composed entirely of tools explicitly listed in `approvedTools`
 * OR if it's composed of known safe, read-only Windows commands.
 *
 * @param command - The full command string to execute.
 * @param args - The arguments for the command.
 * @param approvedTools - A list of explicitly approved tool names (e.g., ['npm', 'git']).
 * @returns true if the command is strictly approved, false otherwise.
 */
export async function isStrictlyApproved(
  command: string,
  args: string[],
  approvedTools?: string[],
): Promise<boolean> {
  const tools = approvedTools ?? [];

  await initializeShellParsers();

  const fullCmd = [command, ...args].join(' ');
  const stripped = stripShellWrapper(fullCmd);

  if (hasRedirection(stripped)) {
    return false;
  }

  const pipelineCommands = splitCommands(stripped);

  // Fallback for simple commands or parsing failures
  if (pipelineCommands.length === 0) {
    return tools.includes(command) || isKnownSafeCommand([command, ...args]);
  }

  // Check every segment of the pipeline
  return pipelineCommands.every((cmdString) => {
    const trimmed = cmdString.trim();
    if (!trimmed) return true;

    const parsedArgs = shellParse(trimmed).map(extractStringFromParseEntry);
    if (parsedArgs.length === 0) return true;

    const root = normalizeCommand(parsedArgs[0]);
    // The segment is approved if the root tool is in the allowlist OR if the whole segment is safe.
    return (
      tools.some((t) => t.toLowerCase() === root) ||
      isKnownSafeCommand(parsedArgs)
    );
  });
}

/**
 * Checks if a Windows command is known to be safe (read-only).
 */
export function isKnownSafeCommand(args: string[]): boolean {
  if (!args || args.length === 0) return false;
  const cmd = normalizeCommand(args[0]);

  // Native Windows/PowerShell safe commands
  const safeCommands = new Set([
    '__read',
    '__write',
    'dir',
    'type',
    'echo',
    'cd',
    'pwd',
    'whoami',
    'hostname',
    'ver',
    'vol',
    'systeminfo',
    'attrib',
    'findstr',
    'where',
    'sort',
    'more',
    'get-childitem',
    'get-content',
    'get-location',
    'get-help',
    'get-process',
    'get-service',
    'get-eventlog',
    'select-string',
  ]);

  if (safeCommands.has(cmd)) {
    return true;
  }

  // We allow git on Windows if it's read-only, using the same logic as POSIX
  if (cmd === 'git') {
    if (gitHasConfigOverrideGlobalOption(args)) {
      return false;
    }

    const { idx, subcommand } = findGitSubcommand(args, [
      'status',
      'log',
      'diff',
      'show',
      'branch',
    ]);
    if (!subcommand) {
      return false;
    }

    const subcommandArgs = args.slice(idx + 1);

    if (['status', 'log', 'diff', 'show'].includes(subcommand)) {
      return gitSubcommandArgsAreReadOnly(subcommandArgs);
    }

    if (subcommand === 'branch') {
      return (
        gitSubcommandArgsAreReadOnly(subcommandArgs) &&
        gitBranchIsReadOnly(subcommandArgs)
      );
    }

    return false;
  }

  return false;
}

/**
 * Checks if a Windows command is explicitly dangerous.
 */
export function isDangerousCommand(args: string[]): boolean {
  if (!args || args.length === 0) return false;
  const cmd = normalizeCommand(args[0]);

  const dangerous = new Set([
    'rm',
    'del',
    'erase',
    'rd',
    'rmdir',
    'net',
    'reg',
    'sc',
    'format',
    'mklink',
    'takeown',
    'icacls',
    'powershell', // prevent shell escapes
    'pwsh',
    'cmd',
    'remove-item',
    'stop-process',
    'stop-service',
    'set-item',
    'new-item',
  ]);

  if (dangerous.has(cmd)) {
    return true;
  }

  if (cmd === 'git') {
    if (gitHasConfigOverrideGlobalOption(args)) {
      return true;
    }

    const { idx, subcommand } = findGitSubcommand(args, [
      'status',
      'log',
      'diff',
      'show',
      'branch',
    ]);
    if (!subcommand) {
      // It's a git command we don't recognize as explicitly safe.
      return false;
    }

    const subcommandArgs = args.slice(idx + 1);

    if (['status', 'log', 'diff', 'show'].includes(subcommand)) {
      return !gitSubcommandArgsAreReadOnly(subcommandArgs);
    }

    if (subcommand === 'branch') {
      return !(
        gitSubcommandArgsAreReadOnly(subcommandArgs) &&
        gitBranchIsReadOnly(subcommandArgs)
      );
    }

    return false;
  }

  if (['env', 'xargs'].includes(cmd)) {
    let nextCmdIdx = 1;
    while (nextCmdIdx < args.length) {
      const arg = args[nextCmdIdx];
      if (arg === '--') {
        nextCmdIdx++;
        break;
      }
      if (!arg.startsWith('-')) {
        if (cmd === 'env' && /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(arg)) {
          nextCmdIdx++;
          continue;
        }
        break;
      }

      if (cmd === 'env') {
        if (
          /^-[uS]$/.test(arg) ||
          ['--unset', '--split-string'].includes(arg)
        ) {
          nextCmdIdx += 2;
        } else {
          nextCmdIdx += 1;
        }
      } else if (cmd === 'xargs') {
        if (
          /^-[aEeIiLlnPs]$/.test(arg) ||
          [
            '--arg-file',
            '--max-args',
            '--max-procs',
            '--max-chars',
            '--process-slot-var',
          ].includes(arg)
        ) {
          nextCmdIdx += 2;
        } else {
          nextCmdIdx += 1;
        }
      } else {
        nextCmdIdx += 1;
      }
    }
    return isDangerousCommand(args.slice(nextCmdIdx));
  }

  return false;
}
