/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { homedir } from '../utils/paths.js';
import { GEMINI_CLI_COMPANION_EXTENSION_NAME } from './constants.js';
import { IDE_DEFINITIONS, type IdeInfo } from './detect-ide.js';

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
      const result = child_process.spawnSync('where.exe', [command], {
        encoding: 'utf-8',
      });
      if (result.status === 0 && result.stdout) {
        // `where.exe` can return multiple paths. Return the first one.
        const firstPath = result.stdout.trim().split(/\r?\n/)[0];
        if (firstPath) {
          return firstPath;
        }
      }
    } else {
      const result = child_process.spawnSync('command', ['-v', command], {
        stdio: 'ignore',
      });
      if (result.status === 0) {
        return command;
      }
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
  // Fallback commands to try if the primary command is not found
  private static readonly FALLBACK_COMMANDS = ['agy', 'antigravity'];

  constructor(
    readonly ideInfo: IdeInfo,
    readonly platform = process.platform,
  ) {}

  async install(): Promise<InstallResult> {
    const primaryCommand = process.env['ANTIGRAVITY_CLI_ALIAS'];

    // Build list of commands to try: primary command first, then fallbacks
    const commandsToTry: string[] = [];
    if (primaryCommand) {
      commandsToTry.push(primaryCommand);
    }
    // Add fallbacks that aren't already in the list
    for (const fallback of AntigravityInstaller.FALLBACK_COMMANDS) {
      if (!commandsToTry.includes(fallback)) {
        commandsToTry.push(fallback);
      }
    }
    // On Windows, also try .cmd variants
    if (this.platform === 'win32') {
      const cmdVariants = commandsToTry
        .filter((cmd) => !cmd.endsWith('.cmd'))
        .map((cmd) => `${cmd}.cmd`);
      commandsToTry.push(...cmdVariants);
    }

    // Try each command until one is found
    let commandPath: string | null = null;
    const triedCommands: string[] = [];
    for (const command of commandsToTry) {
      triedCommands.push(command);
      commandPath = await findCommand(command, this.platform);
      if (commandPath) {
        break;
      }
    }

    if (!commandPath) {
      return {
        success: false,
        message: `Antigravity CLI not found. Tried: ${triedCommands.join(', ')}. Please ensure one of these commands is in your system's PATH.`,
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
