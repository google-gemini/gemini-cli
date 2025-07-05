/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terminal setup utility for configuring Shift+Enter and Ctrl+Enter support.
 *
 * This module provides automatic detection and configuration of various terminal
 * emulators to support CSI u format escape sequences for modified Enter keys.
 *
 * Supported terminals:
 * - VS Code: Configures keybindings.json
 * - Cursor: Configures keybindings.json (VS Code fork)
 * - Windsurf: Configures keybindings.json (VS Code fork)
 *
 * The module sends CSI u format sequences:
 * - Shift+Enter: \x1b[13;2u
 * - Ctrl+Enter: \x1b[13;5u
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TerminalSetupResult {
  success: boolean;
  message: string;
  requiresRestart?: boolean;
}

type SupportedTerminal = 'vscode' | 'cursor' | 'windsurf';

// Terminal detection
async function detectTerminal(): Promise<SupportedTerminal | null> {
  const termProgram = process.env.TERM_PROGRAM;

  // Check VS Code and its forks - check forks first to avoid false positives
  // Check for Cursor-specific indicators
  if (
    process.env.CURSOR_TRACE_ID ||
    process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('/cursor/')
  ) {
    return 'cursor';
  }
  // Check for Windsurf-specific indicators
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('/windsurf/')) {
    return 'windsurf';
  }
  // Check VS Code last since forks may also set VSCODE env vars
  if (termProgram === 'vscode' || process.env.VSCODE_GIT_IPC_HANDLE) {
    return 'vscode';
  }

  // Check parent process name
  if (os.platform() !== 'win32') {
    try {
      const { stdout } = await execAsync('ps -o comm= -p $PPID');
      const parentName = stdout.trim();

      // Check forks before VS Code to avoid false positives
      if (parentName.includes('windsurf') || parentName.includes('Windsurf'))
        return 'windsurf';
      if (parentName.includes('cursor') || parentName.includes('Cursor'))
        return 'cursor';
      if (parentName.includes('code') || parentName.includes('Code'))
        return 'vscode';
    } catch (error) {
      // Continue detection even if process check fails
      console.debug('Parent process detection failed:', error);
    }
  }

  return null;
}

// Backup file helper
async function backupFile(filePath: string): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    // Log backup errors but continue with operation
    console.warn(`Failed to create backup of ${filePath}:`, error);
  }
}

// Terminal-specific configuration functions

async function configureVSCode(): Promise<TerminalSetupResult> {
  const platform = os.platform();
  let configDir: string;

  if (platform === 'darwin') {
    configDir = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Code',
      'User',
    );
  } else if (platform === 'win32') {
    if (!process.env.APPDATA) {
      return {
        success: false,
        message:
          'Could not determine VS Code config path on Windows: APPDATA environment variable is not set.',
      };
    }
    configDir = path.join(process.env.APPDATA, 'Code', 'User');
  } else {
    configDir = path.join(os.homedir(), '.config', 'Code', 'User');
  }

  const keybindingsFile = path.join(configDir, 'keybindings.json');

  try {
    await fs.mkdir(configDir, { recursive: true });

    let keybindings: unknown[] = [];
    try {
      const content = await fs.readFile(keybindingsFile, 'utf8');
      await backupFile(keybindingsFile);
      try {
        const parsedContent = JSON.parse(content);
        if (!Array.isArray(parsedContent)) {
          return {
            success: false,
            message:
              `VS Code keybindings.json exists but is not a valid JSON array. ` +
              `Please fix the file manually or delete it to allow automatic configuration.\n` +
              `File: ${keybindingsFile}`,
          };
        }
        keybindings = parsedContent;
      } catch (parseError) {
        return {
          success: false,
          message:
            `Failed to parse VS Code keybindings.json. The file contains invalid JSON.\n` +
            `Please fix the file manually or delete it to allow automatic configuration.\n` +
            `File: ${keybindingsFile}\n` +
            `Error: ${parseError}`,
        };
      }
    } catch {
      // File doesn't exist, will create new one
    }

    const shiftEnterBinding = {
      key: 'shift+enter',
      command: 'workbench.action.terminal.sendSequence',
      when: 'terminalFocus',
      args: { text: '\u001b[13;2u' },
    };

    const ctrlEnterBinding = {
      key: 'ctrl+enter',
      command: 'workbench.action.terminal.sendSequence',
      when: 'terminalFocus',
      args: { text: '\u001b[13;5u' },
    };

    // Check if bindings already exist
    const hasShiftEnter = keybindings.some((kb) => {
      const binding = kb as { command?: string; args?: { text?: string } };
      return (
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\u001b[13;2u'
      );
    });

    const hasCtrlEnter = keybindings.some((kb) => {
      const binding = kb as { command?: string; args?: { text?: string } };
      return (
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\u001b[13;5u'
      );
    });

    if (!hasShiftEnter || !hasCtrlEnter) {
      if (!hasShiftEnter) keybindings.unshift(shiftEnterBinding);
      if (!hasCtrlEnter) keybindings.unshift(ctrlEnterBinding);

      await fs.writeFile(keybindingsFile, JSON.stringify(keybindings, null, 4));
      return {
        success: true,
        message: `Added Shift+Enter and Ctrl+Enter keybindings to VS Code.\nModified: ${keybindingsFile}`,
        requiresRestart: true,
      };
    } else {
      return {
        success: true,
        message: 'VS Code keybindings already configured.',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure VS Code.\nFile: ${keybindingsFile}\nError: ${error}`,
    };
  }
}

async function configureCursor(): Promise<TerminalSetupResult> {
  const platform = os.platform();
  let configDir: string;

  if (platform === 'darwin') {
    configDir = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
    );
  } else if (platform === 'win32') {
    if (!process.env.APPDATA) {
      return {
        success: false,
        message:
          'Could not determine Cursor config path on Windows: APPDATA environment variable is not set.',
      };
    }
    configDir = path.join(process.env.APPDATA, 'Cursor', 'User');
  } else {
    configDir = path.join(os.homedir(), '.config', 'Cursor');
  }

  const keybindingsFile = path.join(configDir, 'keybindings.json');

  try {
    await fs.mkdir(configDir, { recursive: true });

    let keybindings: unknown[] = [];
    try {
      const content = await fs.readFile(keybindingsFile, 'utf8');
      await backupFile(keybindingsFile);
      try {
        const parsedContent = JSON.parse(content);
        if (!Array.isArray(parsedContent)) {
          return {
            success: false,
            message:
              `Cursor keybindings.json exists but is not a valid JSON array. ` +
              `Please fix the file manually or delete it to allow automatic configuration.\n` +
              `File: ${keybindingsFile}`,
          };
        }
        keybindings = parsedContent;
      } catch (parseError) {
        return {
          success: false,
          message:
            `Failed to parse Cursor keybindings.json. The file contains invalid JSON.\n` +
            `Please fix the file manually or delete it to allow automatic configuration.\n` +
            `File: ${keybindingsFile}\n` +
            `Error: ${parseError}`,
        };
      }
    } catch {
      // File doesn't exist, will create new one
    }

    const shiftEnterBinding = {
      key: 'shift+enter',
      command: 'workbench.action.terminal.sendSequence',
      when: 'terminalFocus',
      args: { text: '\u001b[13;2u' },
    };

    const ctrlEnterBinding = {
      key: 'ctrl+enter',
      command: 'workbench.action.terminal.sendSequence',
      when: 'terminalFocus',
      args: { text: '\u001b[13;5u' },
    };

    // Check if bindings already exist
    const hasShiftEnter = keybindings.some((kb) => {
      const binding = kb as { command?: string; args?: { text?: string } };
      return (
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\u001b[13;2u'
      );
    });

    const hasCtrlEnter = keybindings.some((kb) => {
      const binding = kb as { command?: string; args?: { text?: string } };
      return (
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\u001b[13;5u'
      );
    });

    if (!hasShiftEnter || !hasCtrlEnter) {
      if (!hasShiftEnter) keybindings.unshift(shiftEnterBinding);
      if (!hasCtrlEnter) keybindings.unshift(ctrlEnterBinding);

      await fs.writeFile(keybindingsFile, JSON.stringify(keybindings, null, 4));
      return {
        success: true,
        message: `Added Shift+Enter and Ctrl+Enter keybindings to Cursor.\nModified: ${keybindingsFile}`,
        requiresRestart: true,
      };
    } else {
      return {
        success: true,
        message: 'Cursor keybindings already configured.',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure Cursor.\nFile: ${keybindingsFile}\nError: ${error}`,
    };
  }
}

async function configureWindsurf(): Promise<TerminalSetupResult> {
  const platform = os.platform();
  let configDir: string;

  if (platform === 'darwin') {
    configDir = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Windsurf',
      'User',
    );
  } else if (platform === 'win32') {
    if (!process.env.APPDATA) {
      return {
        success: false,
        message:
          'Could not determine Windsurf config path on Windows: APPDATA environment variable is not set.',
      };
    }
    configDir = path.join(process.env.APPDATA, 'Windsurf', 'User');
  } else {
    configDir = path.join(os.homedir(), '.config', 'Windsurf');
  }

  const keybindingsFile = path.join(configDir, 'keybindings.json');

  try {
    await fs.mkdir(configDir, { recursive: true });

    let keybindings: unknown[] = [];
    try {
      const content = await fs.readFile(keybindingsFile, 'utf8');
      await backupFile(keybindingsFile);
      try {
        const parsedContent = JSON.parse(content);
        if (!Array.isArray(parsedContent)) {
          return {
            success: false,
            message:
              `Windsurf keybindings.json exists but is not a valid JSON array. ` +
              `Please fix the file manually or delete it to allow automatic configuration.\n` +
              `File: ${keybindingsFile}`,
          };
        }
        keybindings = parsedContent;
      } catch (parseError) {
        return {
          success: false,
          message:
            `Failed to parse Windsurf keybindings.json. The file contains invalid JSON.\n` +
            `Please fix the file manually or delete it to allow automatic configuration.\n` +
            `File: ${keybindingsFile}\n` +
            `Error: ${parseError}`,
        };
      }
    } catch {
      // File doesn't exist, will create new one
    }

    const shiftEnterBinding = {
      key: 'shift+enter',
      command: 'workbench.action.terminal.sendSequence',
      when: 'terminalFocus',
      args: { text: '\u001b[13;2u' },
    };

    const ctrlEnterBinding = {
      key: 'ctrl+enter',
      command: 'workbench.action.terminal.sendSequence',
      when: 'terminalFocus',
      args: { text: '\u001b[13;5u' },
    };

    // Check if bindings already exist
    const hasShiftEnter = keybindings.some((kb) => {
      const binding = kb as { command?: string; args?: { text?: string } };
      return (
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\u001b[13;2u'
      );
    });

    const hasCtrlEnter = keybindings.some((kb) => {
      const binding = kb as { command?: string; args?: { text?: string } };
      return (
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\u001b[13;5u'
      );
    });

    if (!hasShiftEnter || !hasCtrlEnter) {
      if (!hasShiftEnter) keybindings.unshift(shiftEnterBinding);
      if (!hasCtrlEnter) keybindings.unshift(ctrlEnterBinding);

      await fs.writeFile(keybindingsFile, JSON.stringify(keybindings, null, 4));
      return {
        success: true,
        message: `Added Shift+Enter and Ctrl+Enter keybindings to Windsurf.\nModified: ${keybindingsFile}`,
        requiresRestart: true,
      };
    } else {
      return {
        success: true,
        message: 'Windsurf keybindings already configured.',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure Windsurf.\nFile: ${keybindingsFile}\nError: ${error}`,
    };
  }
}

/**
 * Main terminal setup function that detects and configures the current terminal.
 *
 * This function:
 * 1. Detects the current terminal emulator
 * 2. Applies appropriate configuration for Shift+Enter and Ctrl+Enter support
 * 3. Creates backups of configuration files before modifying them
 *
 * @returns Promise<TerminalSetupResult> Result object with success status and message
 *
 * @example
 * const result = await terminalSetup();
 * if (result.success) {
 *   console.log(result.message);
 *   if (result.requiresRestart) {
 *     console.log('Please restart your terminal');
 *   }
 * }
 */
export async function terminalSetup(): Promise<TerminalSetupResult> {
  const terminal = await detectTerminal();

  if (!terminal) {
    return {
      success: false,
      message:
        'Could not detect terminal type. Supported terminals: VS Code, Cursor, and Windsurf.',
    };
  }

  switch (terminal) {
    case 'vscode':
      return configureVSCode();
    case 'cursor':
      return configureCursor();
    case 'windsurf':
      return configureWindsurf();
    default:
      return {
        success: false,
        message: `Terminal "${terminal}" is not supported yet.`,
      };
  }
}
