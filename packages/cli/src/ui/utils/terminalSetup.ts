/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terminal setup utility for configuring Shift+Enter and Ctrl+Enter support.
 *
 * This module provides automatic detection and configuration of various terminal
 * emulators to support multiline input through modified Enter keys.
 *
 * Supported terminals:
 * - VS Code: Configures keybindings.json to send \\\r\n
 * - Cursor: Configures keybindings.json to send \\\r\n (VS Code fork)
 * - Windsurf: Configures keybindings.json to send \\\r\n (VS Code fork)
 *
 * For VS Code and its forks:
 * - Shift+Enter: Sends \\\r\n (backslash followed by CRLF)
 * - Ctrl+Enter: Sends \\\r\n (backslash followed by CRLF)
 *
 * The module will not modify existing shift+enter or ctrl+enter keybindings
 * to avoid conflicts with user customizations.
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isKittyProtocolEnabled } from './kittyProtocolDetector.js';
import { VSCODE_SHIFT_ENTER_SEQUENCE } from './platformConstants.js';

const execAsync = promisify(exec);

/**
 * Removes single-line JSON comments (// ...) from a string to allow parsing
 * VS Code style JSON files that may contain comments.
 */
function stripJsonComments(content: string): string {
  // Remove single-line comments (// ...)
  return content.replace(/^\s*\/\/.*$/gm, '');
}

export interface TerminalSetupResult {
  success: boolean;
  message: string;
  requiresRestart?: boolean;
}

type SupportedTerminal = 'vscode' | 'cursor' | 'windsurf';

// Terminal detection
async function detectTerminal(): Promise<SupportedTerminal | null> {
  const termProgram = process.env['TERM_PROGRAM'];

  // Check VS Code and its forks - check forks first to avoid false positives
  // Check for Cursor-specific indicators
  if (
    process.env['CURSOR_TRACE_ID'] ||
    process.env['VSCODE_GIT_ASKPASS_MAIN']?.toLowerCase().includes('cursor')
  ) {
    return 'cursor';
  }
  // Check for Windsurf-specific indicators
  if (
    process.env['VSCODE_GIT_ASKPASS_MAIN']?.toLowerCase().includes('windsurf')
  ) {
    return 'windsurf';
  }
  // Check VS Code last since forks may also set VSCODE env vars
  if (termProgram === 'vscode' || process.env['VSCODE_GIT_IPC_HANDLE']) {
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

// Helper function to get VS Code-style config directory
function getVSCodeStyleConfigDir(appName: string): string | null {
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      appName,
      'User',
    );
  } else if (platform === 'win32') {
    if (!process.env['APPDATA']) {
      return null;
    }
    return path.join(process.env['APPDATA'], appName, 'User');
  } else {
    return path.join(os.homedir(), '.config', appName, 'User');
  }
}

// Generic VS Code-style terminal configuration
async function configureVSCodeStyle(
  terminalName: string,
  appName: string,
): Promise<TerminalSetupResult> {
  const configDir = getVSCodeStyleConfigDir(appName);

  if (!configDir) {
    return {
      success: false,
      message: `Could not determine ${terminalName} config path on Windows: APPDATA environment variable is not set.`,
    };
  }

  const keybindingsFile = path.join(configDir, 'keybindings.json');

  try {
    await fs.mkdir(configDir, { recursive: true });

    let keybindings: unknown[] = [];
    try {
      const content = await fs.readFile(keybindingsFile, 'utf8');
      await backupFile(keybindingsFile);
      try {
        const cleanContent = stripJsonComments(content);
        const parsedContent = JSON.parse(cleanContent);
        if (!Array.isArray(parsedContent)) {
          return {
            success: false,
            message:
              `${terminalName} keybindings.json exists but is not a valid JSON array. ` +
              `Please fix the file manually or delete it to allow automatic configuration.\n` +
              `File: ${keybindingsFile}`,
          };
        }
        keybindings = parsedContent;
      } catch (parseError) {
        return {
          success: false,
          message:
            `Failed to parse ${terminalName} keybindings.json. The file contains invalid JSON.\n` +
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
      args: { text: VSCODE_SHIFT_ENTER_SEQUENCE },
    };

    const ctrlEnterBinding = {
      key: 'ctrl+enter',
      command: 'workbench.action.terminal.sendSequence',
      when: 'terminalFocus',
      args: { text: VSCODE_SHIFT_ENTER_SEQUENCE },
    };

    // Check if ANY shift+enter or ctrl+enter bindings already exist
    const existingShiftEnter = keybindings.find((kb) => {
      const binding = kb as { key?: string };
      return binding.key === 'shift+enter';
    });

    const existingCtrlEnter = keybindings.find((kb) => {
      const binding = kb as { key?: string };
      return binding.key === 'ctrl+enter';
    });

    if (existingShiftEnter || existingCtrlEnter) {
      const messages: string[] = [];
      if (existingShiftEnter) {
        messages.push(`- Shift+Enter binding already exists`);
      }
      if (existingCtrlEnter) {
        messages.push(`- Ctrl+Enter binding already exists`);
      }
      return {
        success: false,
        message:
          `Existing keybindings detected. Will not modify to avoid conflicts.\n` +
          messages.join('\n') +
          '\n' +
          `Please check and modify manually if needed: ${keybindingsFile}`,
      };
    }

    // Check if our specific bindings already exist
    const hasOurShiftEnter = keybindings.some((kb) => {
      const binding = kb as {
        command?: string;
        args?: { text?: string };
        key?: string;
      };
      return (
        binding.key === 'shift+enter' &&
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\\\r\n'
      );
    });

    const hasOurCtrlEnter = keybindings.some((kb) => {
      const binding = kb as {
        command?: string;
        args?: { text?: string };
        key?: string;
      };
      return (
        binding.key === 'ctrl+enter' &&
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.args?.text === '\\\r\n'
      );
    });

    if (!hasOurShiftEnter || !hasOurCtrlEnter) {
      if (!hasOurShiftEnter) keybindings.unshift(shiftEnterBinding);
      if (!hasOurCtrlEnter) keybindings.unshift(ctrlEnterBinding);

      await fs.writeFile(keybindingsFile, JSON.stringify(keybindings, null, 4));
      return {
        success: true,
        message: `Added Shift+Enter and Ctrl+Enter keybindings to ${terminalName}.\nModified: ${keybindingsFile}`,
        requiresRestart: true,
      };
    } else {
      return {
        success: true,
        message: `${terminalName} keybindings already configured.`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure ${terminalName}.\nFile: ${keybindingsFile}\nError: ${error}`,
    };
  }
}

// Terminal-specific configuration functions

async function configureVSCode(): Promise<TerminalSetupResult> {
  return configureVSCodeStyle('VS Code', 'Code');
}

async function configureCursor(): Promise<TerminalSetupResult> {
  return configureVSCodeStyle('Cursor', 'Cursor');
}

async function configureWindsurf(): Promise<TerminalSetupResult> {
  return configureVSCodeStyle('Windsurf', 'Windsurf');
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
  // Check if terminal already has optimal keyboard support
  if (isKittyProtocolEnabled()) {
    return {
      success: true,
      message:
        'Your terminal is already configured for an optimal experience with multiline input (Shift+Enter and Ctrl+Enter).',
    };
  }

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
