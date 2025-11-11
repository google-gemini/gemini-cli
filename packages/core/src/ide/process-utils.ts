/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const execAsync = promisify(exec);

const MAX_TRAVERSAL_DEPTH = 32;

interface ProcessInfo {
  pid: number;
  parentPid: number;
  name: string;
  command: string;
}

interface RawProcessInfo {
  ProcessId?: number;
  ParentProcessId?: number;
  Name?: string;
  CommandLine?: string;
}

/**
 * Fetches the entire process table on Windows.
 */
async function getProcessTableWindows(): Promise<Map<number, ProcessInfo>> {
  const processMap = new Map<number, ProcessInfo>();
  try {
    // Fetch ProcessId, ParentProcessId, Name, and CommandLine for all processes.
    const powershellCommand =
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
    // Increase maxBuffer to handle large process lists (default is 1MB)
    const { stdout } = await execAsync(`powershell "${powershellCommand}"`, {
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!stdout.trim()) {
      return processMap;
    }

    let processes: RawProcessInfo | RawProcessInfo[];
    try {
      processes = JSON.parse(stdout);
    } catch (_e) {
      return processMap;
    }

    if (!Array.isArray(processes)) {
      processes = [processes];
    }

    for (const p of processes) {
      if (p && typeof p.ProcessId === 'number') {
        processMap.set(p.ProcessId, {
          pid: p.ProcessId,
          parentPid: p.ParentProcessId || 0,
          name: p.Name || '',
          command: p.CommandLine || '',
        });
      }
    }
  } catch (_e) {
    // Fallback or error handling if PowerShell fails
  }
  return processMap;
}

/**
 * Fetches the parent process ID, name, and command for a given process ID on Unix.
 *
 * @param pid The process ID to inspect.
 * @returns A promise that resolves to the parent's PID, name, and command.
 */
async function getProcessInfo(pid: number): Promise<{
  parentPid: number;
  name: string;
  command: string;
}> {
  try {
    const command = `ps -o ppid=,command= -p ${pid}`;
    const { stdout } = await execAsync(command);
    const trimmedStdout = stdout.trim();
    if (!trimmedStdout) {
      return { parentPid: 0, name: '', command: '' };
    }
    const parts = trimmedStdout.split(/\s+/);
    const ppidString = parts[0];
    const parentPid = parseInt(ppidString, 10);
    const fullCommand = trimmedStdout.substring(ppidString.length).trim();
    const processName = path.basename(fullCommand.split(' ')[0]);

    return {
      parentPid: isNaN(parentPid) ? 1 : parentPid,
      name: processName,
      command: fullCommand,
    };
  } catch (_e) {
    return { parentPid: 0, name: '', command: '' };
  }
}

/**
 * Finds the IDE process info on Unix-like systems.
 *
 * The strategy is to find the shell process that spawned the CLI, and then
 * find that shell's parent process (the IDE). To get the true IDE process,
 * we traverse one level higher to get the grandparent.
 *
 * @returns A promise that resolves to the PID and command of the IDE process.
 */
async function getIdeProcessInfoForUnix(): Promise<{
  pid: number;
  command: string;
}> {
  const shells = ['zsh', 'bash', 'sh', 'tcsh', 'csh', 'ksh', 'fish', 'dash'];
  let currentPid = process.pid;

  for (let i = 0; i < MAX_TRAVERSAL_DEPTH; i++) {
    try {
      const { parentPid, name } = await getProcessInfo(currentPid);

      const isShell = shells.some((shell) => name === shell);
      if (isShell) {
        // The direct parent of the shell is often a utility process (e.g. VS
        // Code's `ptyhost` process). To get the true IDE process, we need to
        // traverse one level higher to get the grandparent.
        let idePid = parentPid;
        try {
          const { parentPid: grandParentPid } = await getProcessInfo(parentPid);
          if (grandParentPid > 1) {
            idePid = grandParentPid;
          }
        } catch {
          // Ignore if getting grandparent fails, we'll just use the parent pid.
        }
        const { command } = await getProcessInfo(idePid);
        return { pid: idePid, command };
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

  const { command } = await getProcessInfo(currentPid);
  return { pid: currentPid, command };
}

/**
 * Finds the IDE process info on Windows using a snapshot approach.
 */
async function getIdeProcessInfoForWindows(): Promise<{
  pid: number;
  command: string;
}> {
  // Fetch the entire process table in one go.
  const processMap = await getProcessTableWindows();
  const myPid = process.pid;
  const myProc = processMap.get(myPid);

  if (!myProc) {
    // Fallback: try to get info for current process directly if snapshot fails
    const { command } = await getProcessInfo(myPid);
    return { pid: myPid, command };
  }

  // Perform tree traversal in memory.
  // Strategy: Find the great-grandchild of the root process (pid 0 or non-existent parent).
  const ancestors: ProcessInfo[] = [];
  let curr: ProcessInfo | undefined = myProc;

  for (let i = 0; i < MAX_TRAVERSAL_DEPTH && curr; i++) {
    ancestors.push(curr);
    if (curr.parentPid === 0 || !processMap.has(curr.parentPid)) {
      break; // Reached root
    }
    curr = processMap.get(curr.parentPid);
  }

  if (ancestors.length >= 3) {
    const target = ancestors[ancestors.length - 3];
    return { pid: target.pid, command: target.command };
  } else if (ancestors.length > 0) {
    const target = ancestors[ancestors.length - 1];
    return { pid: target.pid, command: target.command };
  }

  return { pid: myPid, command: myProc.command };
}

/**
 * Traverses up the process tree to find the process ID and command of the IDE.
 *
 * This function uses different strategies depending on the operating system
 * to identify the main application process (e.g., the main VS Code window
 * process).
 *
 * If the IDE process cannot be reliably identified, it will return the
 * top-level ancestor process ID and command as a fallback.
 *
 * @returns A promise that resolves to the PID and command of the IDE process.
 */
export async function getIdeProcessInfo(): Promise<{
  pid: number;
  command: string;
}> {
  const platform = os.platform();

  if (platform === 'win32') {
    return getIdeProcessInfoForWindows();
  }

  return getIdeProcessInfoForUnix();
}
