/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'node:child_process';
import * as process from 'node:process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { IDE_DEFINITIONS, type IdeInfo } from './detect-ide.js';
import { GEMINI_CLI_COMPANION_EXTENSION_NAME } from './constants.js';
import { homedir } from '../utils/paths.js';

export interface IdeInstaller {
  install(): Promise<InstallResult>;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

async function findCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  // 1. Check PATH first.
  try {
    if (platform === 'win32') {
      const result = child_process
        .execSync(`where.exe ${command}`)
        .toString()
        .trim();
      // `where.exe` can return multiple paths. Return the first one.
      const firstPath = result.split(/\r?\n/)[0];
      if (firstPath) {
        return firstPath;
      }
    } else {
      child_process.execSync(`command -v ${command}`, {
        stdio: 'ignore',
      });
      return command;
    }
  } catch {
    // Not in PATH, continue to check common locations.
  }

  // 2. Check common installation locations.
  const locations: string[] = [];
  const homeDir = homedir();

  if (command === 'code' || command === 'code.cmd') {
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
          process.env['ProgramFiles'] || 'C:\\Program Files',
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

  constructor(
    readonly ideInfo: IdeInfo,
    readonly platform = process.platform,
  ) {
    const command = platform === 'win32' ? 'code.cmd' : 'code';
    this.vsCodeCommand = findCommand(command, platform);
  }

  async install(): Promise<InstallResult> {
    const commandPath = await this.vsCodeCommand;
    if (!commandPath) {
      return {
        success: false,
        message: `${this.ideInfo.displayName} CLI not found. Please ensure 'code' is in your system's PATH. For help, see https://code.visualstudio.com/docs/configure/command-line#_code-is-not-recognized-as-an-internal-or-external-command. You can also install the '${GEMINI_CLI_COMPANION_EXTENSION_NAME}' extension manually from the VS Code marketplace.`,
      };
    }

    try {
      const result = child_process.spawnSync(
        commandPath,
        [
          '--install-extension',
          'google.gemini-cli-vscode-ide-companion',
          '--force',
        ],
        { stdio: 'pipe', shell: this.platform === 'win32' },
      );

      if (result.status !== 0) {
        throw new Error(
          `Failed to install extension: ${result.stderr?.toString()}`,
        );
      }

      return {
        success: true,
        message: `${this.ideInfo.displayName} companion extension was installed successfully.`,
      };
    } catch (_error) {
      return {
        success: false,
        message: `Failed to install ${this.ideInfo.displayName} companion extension. Please try installing '${GEMINI_CLI_COMPANION_EXTENSION_NAME}' manually from the ${this.ideInfo.displayName} extension marketplace.`,
      };
    }
  }
}

class AntigravityInstaller implements IdeInstaller {
  constructor(
    readonly ideInfo: IdeInfo,
    readonly platform = process.platform,
  ) {}

  async install(): Promise<InstallResult> {
    const command = process.env['ANTIGRAVITY_CLI_ALIAS'];
    if (!command) {
      return {
        success: false,
        message: 'ANTIGRAVITY_CLI_ALIAS environment variable not set.',
      };
    }

    const commandPath = await findCommand(command, this.platform);
    if (!commandPath) {
      return {
        success: false,
        message: `${command} not found. Please ensure it is in your system's PATH.`,
      };
    }

    try {
      const result = child_process.spawnSync(
        commandPath,
        [
          '--install-extension',
          'google.gemini-cli-vscode-ide-companion',
          '--force',
        ],
        { stdio: 'pipe', shell: this.platform === 'win32' },
      );

      if (result.status !== 0) {
        throw new Error(
          `Failed to install extension: ${result.stderr?.toString()}`,
        );
      }

      return {
        success: true,
        message: `${this.ideInfo.displayName} companion extension was installed successfully.`,
      };
    } catch (_error) {
      return {
        success: false,
        message: `Failed to install ${this.ideInfo.displayName} companion extension. Please try installing '${GEMINI_CLI_COMPANION_EXTENSION_NAME}' manually from the ${this.ideInfo.displayName} extension marketplace.`,
      };
    }
  }
}

export function getIdeInstaller(
  ide: IdeInfo,
  platform = process.platform,
): IdeInstaller | null {
  switch (ide.name) {
    case IDE_DEFINITIONS.vscode.name:
    case IDE_DEFINITIONS.firebasestudio.name:
      return new VsCodeInstaller(ide, platform);
    case IDE_DEFINITIONS.antigravity.name:
      return new AntigravityInstaller(ide, platform);
    default:
      return null;
  }
}
