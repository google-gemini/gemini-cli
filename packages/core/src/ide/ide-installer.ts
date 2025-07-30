/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process';
import * as process from 'process';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { DetectedIde } from './detect-ide.js';

const VSCODE_COMMAND = process.platform === 'win32' ? 'code.cmd' : 'code';
const VSCODE_COMPANION_EXTENSION_FOLDER = 'vscode-ide-companion';

export interface IdeInstaller {
  install(): Promise<InstallResult>;
  isInstalled(): Promise<boolean>;
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

  async isInstalled(): Promise<boolean> {
    return (await this.vsCodeCommand) !== null;
  }

  async install(): Promise<InstallResult> {
    const commandPath = await this.vsCodeCommand;
    if (!commandPath) {
      return {
        success: false,
        message: `VS Code command-line tool not found in your PATH or common installation locations.`,
      };
    }

    const bundleDir = path.dirname(fileURLToPath(import.meta.url));
    // The VSIX file is copied to the bundle directory as part of the build.
    let vsixFiles = glob.sync(path.join(bundleDir, '*.vsix'));
    if (vsixFiles.length === 0) {
      // If the VSIX file is not in the bundle, it might be a dev
      // environment running with `npm start`. Look for it in the original
      // package location, relative to the bundle dir.
      const devPath = path.join(
        bundleDir, // .../packages/core/dist/src/ide
        '..', // .../packages/core/dist/src
        '..', // .../packages/core/dist
        '..', // .../packages/core
        '..', // .../packages
        VSCODE_COMPANION_EXTENSION_FOLDER,
        '*.vsix',
      );
      vsixFiles = glob.sync(devPath);
    }
    if (vsixFiles.length === 0) {
      return {
        success: false,
        message:
          'Could not find the required VS Code companion extension. Please file a bug via /bug.',
      };
    }

    const vsixPath = vsixFiles[0];
    const command = `"${commandPath}" --install-extension "${vsixPath}" --force`;
    try {
      child_process.execSync(command, { stdio: 'pipe' });
      return {
        success: true,
        message:
          'VS Code companion extension installed successfully. Restart gemini-cli in a fresh terminal window.',
      };
    } catch (_error) {
      return {
        success: false,
        message: 'Failed to install VS Code companion extension.',
      };
    }
  }
}

export function getIdeInstaller(ide: DetectedIde): IdeInstaller | null {
  switch (ide) {
    case 'vscode':
      return new VsCodeInstaller();
    default:
      return null;
  }
}
