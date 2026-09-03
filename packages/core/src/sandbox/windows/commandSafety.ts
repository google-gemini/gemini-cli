/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as shellParse } from 'shell-quote';
import {
  extractStringFromParseEntry,
  initializeShellParsers,
  splitCommands,
  stripShellWrapper,
} from '../../utils/shell-utils.js';
import { isSubpath, resolveToRealPath } from '../../utils/paths.js';

/**
 * Determines if a command is strictly approved for execution on Windows.
 * A command is approved if it's composed entirely of tools explicitly listed in `approvedTools`
 * OR if it's composed of known safe, read-only Windows commands.
 *
 * @param command - The full command string to execute.
 * @param args - The arguments for the command.
 * @param approvedTools - A list of explicitly approved tool names (e.g., ['npm', 'git']).
 * @param cwd - Optional working directory
 * @param workspaceRoot - Optional workspace root directory
 * @returns true if the command is strictly approved, false otherwise.
 */
export async function isStrictlyApproved(
  command: string,
  args: string[],
  approvedTools?: string[],
  cwd?: string,
  workspaceRoot?: string,
): Promise<boolean> {
  const tools = approvedTools ?? [];

  await initializeShellParsers();

  const fullCmd = [command, ...args].join(' ');
  const stripped = stripShellWrapper(fullCmd);

  const pipelineCommands = splitCommands(stripped);

  // Fallback for simple commands or parsing failures
  if (pipelineCommands.length === 0) {
    return (
      tools.includes(command) ||
      isKnownSafeCommand([command, ...args], cwd, workspaceRoot)
    );
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
      isKnownSafeCommand(parsedArgs, cwd, workspaceRoot)
    );
  });
}

function isPathEscapingWorkspace(
  arg: string,
  workspaceRoot: string,
  cwd: string,
): boolean {
  if (!arg || typeof arg !== 'string') return false;

  if (arg.includes('$') || arg.includes('`') || arg.includes('%')) {
    return true;
  }

  let target: string;
  if (arg === '~' || arg.startsWith('~/') || arg.startsWith('~\\')) {
    const homeDir = os.homedir();
    target = path.win32.resolve(homeDir, arg.slice(2));
    if (!isSubpath(workspaceRoot, target)) {
      return true;
    }
  } else if (arg.startsWith('~')) {
    return true;
  } else if (path.win32.isAbsolute(arg) || path.isAbsolute(arg)) {
    target = path.win32.resolve(arg);
    if (!isSubpath(workspaceRoot, target)) {
      return true;
    }
  } else {
    target = path.win32.resolve(cwd, arg);
    if (!isSubpath(workspaceRoot, target)) {
      return true;
    }
  }

  let curr = target;
  while (
    curr &&
    isSubpath(workspaceRoot, curr) &&
    curr !== path.win32.dirname(curr)
  ) {
    try {
      const stat = fs.lstatSync(curr, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink()) {
        const real = fs.realpathSync(curr);
        if (!isSubpath(workspaceRoot, real)) {
          return true;
        }
      }
    } catch {
      // ignore
    }
    curr = path.win32.dirname(curr);
  }

  return false;
}

/**
 * Checks if a Windows command is known to be safe (read-only).
 */
export function isKnownSafeCommand(
  args: string[],
  cwd?: string,
  workspaceRoot?: string,
): boolean {
  if (!args || args.length === 0) return false;
  let cmd = args[0].toLowerCase();
  if (cmd.endsWith('.exe')) {
    cmd = cmd.slice(0, -4);
  }

  let effectiveWorkspace = workspaceRoot
    ? path.win32.isAbsolute(workspaceRoot)
      ? path.win32.resolve(workspaceRoot)
      : path.resolve(workspaceRoot)
    : cwd
      ? path.win32.isAbsolute(cwd)
        ? path.win32.resolve(cwd)
        : path.resolve(cwd)
      : process.cwd();
  try {
    effectiveWorkspace = resolveToRealPath(effectiveWorkspace);
  } catch {
    // Keep resolved path on failure
  }

  let effectiveCwd = cwd
    ? path.win32.isAbsolute(cwd)
      ? path.win32.resolve(cwd)
      : path.resolve(cwd)
    : effectiveWorkspace;
  try {
    effectiveCwd = resolveToRealPath(effectiveCwd);
  } catch {
    // Keep resolved path on failure
  }

  if (
    effectiveCwd !== effectiveWorkspace &&
    !isSubpath(effectiveWorkspace, effectiveCwd)
  ) {
    return false;
  }

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
    if (cmd === 'cd') {
      let hasPath = false;
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        const isSwitch =
          arg.startsWith('-') ||
          (arg.startsWith('/') && /^\/[a-zA-Z0-9?]{1,4}(?::.*)?$/.test(arg));
        if (isSwitch) {
          continue;
        }
        hasPath = true;
        if (isPathEscapingWorkspace(arg, effectiveWorkspace, effectiveCwd)) {
          return false;
        }
      }
      if (!hasPath) {
        if (isPathEscapingWorkspace('~', effectiveWorkspace, effectiveCwd)) {
          return false;
        }
      }
      return true;
    }

    const fileReadingCommands = new Set([
      'dir',
      'type',
      'attrib',
      'more',
      'findstr',
      'get-childitem',
      'get-content',
      'select-string',
      '__read',
      'sort',
    ]);

    if (fileReadingCommands.has(cmd)) {
      let passedDoubleDash = false;
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (!passedDoubleDash) {
          if (arg === '--') {
            passedDoubleDash = true;
            continue;
          }
          const isSwitch =
            arg.startsWith('-') ||
            (arg.startsWith('/') && /^\/[a-zA-Z0-9?]{1,4}(?::.*)?$/.test(arg));
          if (isSwitch) {
            const sepIdx =
              arg.indexOf('=') !== -1 ? arg.indexOf('=') : arg.indexOf(':');
            if (sepIdx !== -1) {
              const val = arg.slice(sepIdx + 1);
              if (
                isPathEscapingWorkspace(val, effectiveWorkspace, effectiveCwd)
              ) {
                return false;
              }
              continue;
            }

            if (arg.startsWith('-')) {
              try {
                const stat = fs.lstatSync(
                  path.win32.resolve(effectiveCwd, arg),
                  {
                    throwIfNoEntry: false,
                  },
                );
                if (!stat) {
                  continue;
                }
              } catch {
                continue;
              }
            } else {
              continue;
            }
          }
        }
        if (isPathEscapingWorkspace(arg, effectiveWorkspace, effectiveCwd)) {
          return false;
        }
      }
      return true;
    }

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
export function isDangerousCommand(
  args: string[],
  _cwd?: string,
  _workspaceRoot?: string,
): boolean {
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
