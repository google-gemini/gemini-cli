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

/**
 * Traverses up the process tree to find the parent process ID of the shell
 * that spawned the current process.
 *
 * If a shell process is not found, it will return the top-level ancestor
 * process ID, which is useful for identifying the main application process
 * (e.g., the main VS Code window process).
 *
 * @returns A promise that resolves to the numeric PID.
 * @throws Will throw an error if the underlying shell commands fail.
 */
export async function getIdeProcessId(): Promise<number> {
  const platform = os.platform();
  let currentPid = process.pid;

  const shells: Record<string, string[]> = {
    darwin: ['zsh', 'bash', 'sh', 'tcsh', 'csh', 'ksh', 'fish'],
    linux: ['zsh', 'bash', 'sh', 'tcsh', 'csh', 'ksh', 'fish', 'dash'],
    win32: ['powershell.exe', 'cmd.exe', 'pwsh.exe'],
  };
  const shellAllowlist = shells[platform] ?? [];

  // Loop upwards through the process tree, with a depth limit to prevent
  // infinite loops.
  const MAX_TRAVERSAL_DEPTH = 32;
  for (let i = 0; i < MAX_TRAVERSAL_DEPTH; i++) {
    let parentPid: number;
    let processName: string;

    try {
      if (platform === 'win32') {
        const command = `wmic process where "ProcessId=${currentPid}" get Name,ParentProcessId /value`;
        const { stdout } = await execAsync(command);
        const nameMatch = stdout.match(/Name=(.*)/);
        processName = nameMatch ? nameMatch[1].trim() : '';
        const ppidMatch = stdout.match(/ParentProcessId=(\d+)/);
        parentPid = ppidMatch ? parseInt(ppidMatch[1], 10) : 0;
      } else {
        const command = `ps -o ppid=,comm= -p ${currentPid}`;
        const stdout = (await execAsync(command)).stdout.trim();
        const ppidString = stdout.substring(0, stdout.indexOf(' '));
        const ppid = parseInt(ppidString, 10);
        parentPid = isNaN(ppid) ? 1 : ppid;
        processName = path.basename(stdout.substring(ppidString.length).trim());
      }
    } catch (_) {
      // This can happen if a process in the chain dies during execution.
      // We'll break the loop and return the last valid PID we found.
      break;
    }

    const isShell = shellAllowlist.some((shell) =>
      platform === 'win32'
        ? processName.toLowerCase() === shell.toLowerCase()
        : processName === shell,
    );

    if (isShell) {
      return parentPid;
    }

    // Define the root PID for the current OS
    const rootPid = platform === 'win32' ? 0 : 1;

    // If the parent is the root process or invalid, we've found our target.
    if (parentPid === rootPid || parentPid <= 0) {
      break;
    }
    // Move one level up the tree for the next iteration.
    currentPid = parentPid;
  }
  return currentPid;
}
