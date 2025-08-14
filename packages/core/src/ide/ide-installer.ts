/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process';
import * as process from 'process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DetectedIde } from './detect-ide.js';
import { GEMINI_CLI_COMPANION_EXTENSION_NAME } from './constants.js';

const VSCODE_COMMAND = process.platform === 'win32' ? 'code.cmd' : 'code';

export interface IdeInstaller {
  install(): Promise<InstallResult>;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

async function findVsCodeCommand(): Promise<string | null> {
  // 1. Check PATH first.
  try {
    child_process.execSync(
      process.platform === 'win32'
        ? `where.exe ${VSCODE_COMMAND}`
        : `command -v ${VSCODE_COMMAND}`,
      { stdio: 'ignore' },
    );
    return VSCODE_COMMAND;
  } catch {
    // Not in PATH, continue to check common locations.
  }

  // 2. Check common installation locations.
  const locations: string[] = [];
  const platform = process.platform;
  const homeDir = os.homedir();

  if (platform === 'darwin') {
    // macOS
    locations.push(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      path.join(homeDir, 'Library/Application Support/Code/bin/code'),
    );
  } else if (platform === 'linux') {
    // Linux
    locations.push(
      '/usr/share/code/bin/code',
      '/snap/bin/code',
      path.join(homeDir, '.local/share/code/bin/code'),
    );
  } else if (platform === 'win32') {
    // Windows
    locations.push(
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Microsoft VS Code',
        'bin',
        'code.cmd',
      ),
      path.join(
        homeDir,
        'AppData',
        'Local',
        'Programs',
        'Microsoft VS Code',
        'bin',
        'code.cmd',
      ),
    );
  }

  for (const location of locations) {
    if (fs.existsSync(location)) {
      return location;
    }
  }

  return null;
}

class VsCodeInstaller implements IdeInstaller {
  private vsCodeCommand: Promise<string | null>;

  constructor() {
    this.vsCodeCommand = findVsCodeCommand();
  }

  async install(): Promise<InstallResult> {
    const commandPath = await this.vsCodeCommand;
    if (!commandPath) {
      return {
        success: false,
        message: `VS Code CLI not found. Please ensure 'code' is in your system's PATH. For help, see https://code.visualstudio.com/docs/configure/command-line#_code-is-not-recognized-as-an-internal-or-external-command. You can also install the '${GEMINI_CLI_COMPANION_EXTENSION_NAME}' extension manually from the VS Code marketplace.`,
      };
    }

    const command = `"${commandPath}" --install-extension google.gemini-cli-vscode-ide-companion --force`;
    try {
      child_process.execSync(command, { stdio: 'pipe' });
      return {
        success: true,
        message:
          'VS Code companion extension was installed successfully. Please restart your terminal to complete the setup.',
      };
    } catch (_error) {
      return {
        success: false,
        message: `Failed to install VS Code companion extension. Please try installing '${GEMINI_CLI_COMPANION_EXTENSION_NAME}' manually from the VS Code extension marketplace.`,
      };
    }
  }
}

export function getIdeInstaller(ide: DetectedIde): IdeInstaller | null {
  switch (ide) {
    case DetectedIde.VSCode:
      return new VsCodeInstaller();
    default:
      return null;
  }
}
