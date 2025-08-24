/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);

const MAX_TRAVERSAL_DEPTH = 32;

/**
 * Fetches the parent process ID and name for a given process ID.
 *
 * @param pid The process ID to inspect.
 * @returns A promise that resolves to the parent's PID and name.
 */
async function getParentProcessInfo(pid: number): Promise<{
  parentPid: number;
  name: string;
}> {
  const platform = os.platform();
  if (platform === 'win32') {
    const command = `wmic process where "ProcessId=${pid}" get Name,ParentProcessId /value`;
    const { stdout } = await execAsync(command);
    const nameMatch = stdout.match(/Name=([^\n]*)/);
    const processName = nameMatch ? nameMatch[1].trim() : '';
    const ppidMatch = stdout.match(/ParentProcessId=(\d+)/);
    const parentPid = ppidMatch ? parseInt(ppidMatch[1], 10) : 0;
    return { parentPid, name: processName };
  } else {
    const command = `ps -o ppid=,command= -p ${pid}`;
    const { stdout } = await execAsync(command);
    const trimmedStdout = stdout.trim();
    const ppidString = trimmedStdout.split(/\s+/)[0];
    const parentPid = parseInt(ppidString, 10);
    const fullCommand = trimmedStdout.substring(ppidString.length).trim();
    const processName = path.basename(fullCommand.split(' ')[0]);
    return { parentPid: isNaN(parentPid) ? 1 : parentPid, name: processName };
  }
}

/**
 * Traverses the process tree on Unix-like systems to find the IDE process ID.
 *
 * The strategy is to find the shell process that spawned the CLI, and then
 * find that shell's parent process (the IDE). To get the true IDE process,
 * we traverse one level higher to get the grandparent.
 *
 * @returns A promise that resolves to the numeric PID.
 */
async function getIdeProcessIdForUnix(): Promise<number> {
  const shells = ['zsh', 'bash', 'sh', 'tcsh', 'csh', 'ksh', 'fish', 'dash'];
  let currentPid = process.pid;

  for (let i = 0; i < MAX_TRAVERSAL_DEPTH; i++) {
    try {
      const { parentPid, name } = await getParentProcessInfo(currentPid);

      const isShell = shells.some((shell) => name === shell);
      if (isShell) {
        // The direct parent of the shell is often a utility process (e.g. VS
        // Code's `ptyhost` process). To get the true IDE process, we need to
        // traverse one level higher to get the grandparent.
        try {
          const { parentPid: grandParentPid } =
            await getParentProcessInfo(parentPid);
          if (grandParentPid > 1) {
            return grandParentPid;
          }
        } catch {
          // Ignore if getting grandparent fails, we'll just use the parent pid.
        }
        return parentPid;
      }

      if (parentPid <= 1) {
        break; // Reached the root
      }
      currentPid = parentPid;
    } catch {
      // Process in chain died
      break;
    }
  }

  console.error(
    'Failed to find shell process in the process tree. Falling back to top-level process, which may be inaccurate. If you see this, please file a bug via /bug.',
  );
  return currentPid;
}

/**
 * Traverses the process tree on Windows to find the IDE process ID.
 *
 * The strategy is to find the grandchild of the root process.
 *
 * @returns A promise that resolves to the numeric PID.
 */
async function getIdeProcessIdForWindows(): Promise<number> {
  let currentPid = process.pid;

  for (let i = 0; i < MAX_TRAVERSAL_DEPTH; i++) {
    try {
      const { parentPid } = await getParentProcessInfo(currentPid);

      if (parentPid > 0) {
        try {
          const { parentPid: grandParentPid } =
            await getParentProcessInfo(parentPid);
          if (grandParentPid === 0) {
            // Found grandchild of root
            return currentPid;
          }
        } catch {
          // getting grandparent failed, proceed
        }
      }

      if (parentPid <= 0) {
        break; // Reached the root
      }
      currentPid = parentPid;
    } catch {
      // Process in chain died
      break;
    }
  }
  return currentPid;
}

/**
 * Traverses up the process tree to find the process ID of the IDE.
 *
 * This function uses different strategies depending on the operating system
 * to identify the main application process (e.g., the main VS Code window
 * process).
 *
 * If the IDE process cannot be reliably identified, it will return the
 * top-level ancestor process ID as a fallback.
 *
 * @returns A promise that resolves to the numeric PID of the IDE process.
 * @throws Will throw an error if the underlying shell commands fail.
 */
export async function getIdeProcessId(): Promise<number> {
  const platform = os.platform();

  if (platform === 'win32') {
    return getIdeProcessIdForWindows();
  }

  return getIdeProcessIdForUnix();
}
