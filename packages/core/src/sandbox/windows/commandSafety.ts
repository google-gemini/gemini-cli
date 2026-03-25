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
} from '../../utils/shell-utils.js';

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

    let root = parsedArgs[0].toLowerCase();
    if (root.endsWith('.exe')) {
      root = root.slice(0, -4);
    }
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
  let cmd = args[0].toLowerCase();
  if (cmd.endsWith('.exe')) {
    cmd = cmd.slice(0, -4);
  }

  // Native Windows/PowerShell safe commands
  const safeCommands = new Set([
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
    // For simplicity in this branch, we'll allow standard git read operations
    // In a full implementation, we'd port the sub-command validation too.
    const sub = args[1]?.toLowerCase();
    return ['status', 'log', 'diff', 'show', 'branch'].includes(sub);
  }

  return false;
}

/**
 * Checks if a Windows command is explicitly dangerous.
 */
export function isDangerousCommand(args: string[]): boolean {
  if (!args || args.length === 0) return false;
  let cmd = args[0].toLowerCase();
  if (cmd.endsWith('.exe')) {
    cmd = cmd.slice(0, -4);
  }

  const dangerous = new Set([
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

  return dangerous.has(cmd);
}
