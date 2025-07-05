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
 * - Kitty: Configures ~/.config/kitty/kitty.conf
 * - Ghostty: Configures ~/.config/ghostty/config
 * - URxvt: Configures ~/.Xresources
 * - VS Code: Configures keybindings.json
 * - Foot: Works out of the box, no configuration needed
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

type SupportedTerminal =
  | 'kitty'
  | 'ghostty'
  | 'urxvt'
  | 'vscode'
  | 'foot';

// Terminal detection
async function detectTerminal(): Promise<SupportedTerminal | null> {
  const termProgram = process.env.TERM_PROGRAM;

  // Check VS Code first
  if (termProgram === 'vscode' || process.env.VSCODE_GIT_IPC_HANDLE) {
    return 'vscode';
  }

  // Check TERM_PROGRAM
  if (termProgram) {
    const termLower = termProgram.toLowerCase().replace(/\.app$/, '');
    if (['kitty', 'ghostty'].includes(termLower)) {
      return termLower as SupportedTerminal;
    }
  }

  // Check specific env vars
  if (process.env.TERM === 'xterm-kitty') return 'kitty';
  if (
    process.env.TERM?.startsWith('rxvt-unicode') ||
    process.env.TERM?.startsWith('urxvt')
  )
    return 'urxvt';
  if (process.env.TERM?.startsWith('foot') || process.env.FOOT_TERM)
    return 'foot';

  // Check parent process name
  if (os.platform() !== 'win32') {
    try {
      const { stdout } = await execAsync('ps -o comm= -p $PPID');
      const parentName = stdout.trim();

      if (parentName.includes('kitty')) return 'kitty';
      if (parentName.includes('ghostty')) return 'ghostty';
      if (parentName.includes('urxvt') || parentName.includes('rxvt-unicode'))
        return 'urxvt';
      if (parentName.includes('foot')) return 'foot';
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
async function configureKitty(): Promise<TerminalSetupResult> {
  const configDir = path.join(os.homedir(), '.config', 'kitty');
  const configFile = path.join(configDir, 'kitty.conf');

  try {
    await fs.mkdir(configDir, { recursive: true });

    let content = '';
    try {
      content = await fs.readFile(configFile, 'utf8');
      await backupFile(configFile);
    } catch {
      // Expected case: File doesn't exist yet (first-time setup)
      // We intentionally ignore this error and proceed with empty content
      // The file will be created below with our keybindings
    }

    const shiftEnterLine = 'map shift+enter send_text all \\x1b[13;2u';
    const ctrlEnterLine = 'map ctrl+enter send_text all \\x1b[13;5u';

    let modified = false;

    if (!content.includes(shiftEnterLine)) {
      content += '\n# Gemini CLI keybindings\n' + shiftEnterLine + '\n';
      modified = true;
    }

    if (!content.includes(ctrlEnterLine)) {
      content += ctrlEnterLine + '\n';
      modified = true;
    }

    if (modified) {
      await fs.writeFile(configFile, content);
      return {
        success: true,
        message: `Added Shift+Enter and Ctrl+Enter keybindings to Kitty.\nModified: ${configFile}`,
        requiresRestart: true,
      };
    } else {
      return {
        success: true,
        message: 'Kitty keybindings already configured.',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure Kitty.\nFile: ${configFile}\nError: ${error}`,
    };
  }
}

async function configureGhostty(): Promise<TerminalSetupResult> {
  const configDir = path.join(os.homedir(), '.config', 'ghostty');
  const configFile = path.join(configDir, 'config');

  try {
    await fs.mkdir(configDir, { recursive: true });

    let content = '';
    try {
      content = await fs.readFile(configFile, 'utf8');
      await backupFile(configFile);
    } catch {
      // Expected case: File doesn't exist yet (first-time setup)
      // We intentionally ignore this error and proceed with empty content
      // The file will be created below with our keybindings
    }

    const shiftEnterLine = 'keybind = performable:shift+enter=csi:13;2u';
    const ctrlEnterLine = 'keybind = performable:ctrl+enter=csi:13;5u';

    let modified = false;

    if (!content.includes('performable:shift+enter=')) {
      content += '\n# Gemini CLI keybindings\n' + shiftEnterLine + '\n';
      modified = true;
    }

    if (!content.includes('performable:ctrl+enter=')) {
      content += ctrlEnterLine + '\n';
      modified = true;
    }

    if (modified) {
      await fs.writeFile(configFile, content);
      return {
        success: true,
        message: `Added Shift+Enter and Ctrl+Enter keybindings to Ghostty.\nModified: ${configFile}`,
        requiresRestart: true,
      };
    } else {
      return {
        success: true,
        message: 'Ghostty keybindings already configured.',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure Ghostty.\nFile: ${configFile}\nError: ${error}`,
    };
  }
}

async function configureUrxvt(): Promise<TerminalSetupResult> {
  const xresourcesFile = path.join(os.homedir(), '.Xresources');

  try {
    let content = '';
    try {
      content = await fs.readFile(xresourcesFile, 'utf8');
      await backupFile(xresourcesFile);
    } catch {
      // Expected case: File doesn't exist yet (first-time setup)
      // We intentionally ignore this error and proceed with empty content
      // The file will be created below with our keybindings
    }

    const shiftEnterLine = 'URxvt.keysym.S-Return:     \\033[13;2u';
    const ctrlEnterLine = 'URxvt.keysym.C-Return:     \\033[13;5u';

    let modified = false;

    if (!content.includes('URxvt.keysym.S-Return:')) {
      content +=
        '\n! Gemini CLI keybindings for URxvt\n' + shiftEnterLine + '\n';
      modified = true;
    }

    if (!content.includes('URxvt.keysym.C-Return:')) {
      content += ctrlEnterLine + '\n';
      modified = true;
    }

    if (modified) {
      await fs.writeFile(xresourcesFile, content);
      return {
        success: true,
        message: `Added Shift+Enter and Ctrl+Enter keybindings to URxvt.\nModified: ${xresourcesFile}\nRun "xrdb -merge ~/.Xresources" to apply.`,
        requiresRestart: true,
      };
    } else {
      return {
        success: true,
        message: 'URxvt keybindings already configured.',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure URxvt.\nFile: ${xresourcesFile}\nError: ${error}`,
    };
  }
}

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

async function configureFoot(): Promise<TerminalSetupResult> {
  return {
    success: true,
    message:
      'Foot terminal works out of the box! No configuration needed.\n' +
      'Foot already sends the required sequences for Shift+Enter and Ctrl+Enter.',
  };
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
        'Could not detect terminal type. Supported terminals: Kitty, Ghostty, URxvt, VS Code, and Foot.',
    };
  }

  switch (terminal) {
    case 'kitty':
      return configureKitty();
    case 'ghostty':
      return configureGhostty();
    case 'urxvt':
      return configureUrxvt();
    case 'vscode':
      return configureVSCode();
    case 'foot':
      return configureFoot();
    default:
      return {
        success: false,
        message: `Terminal "${terminal}" is not supported yet.`,
      };
  }
}
