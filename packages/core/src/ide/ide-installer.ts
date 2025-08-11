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
        message: `VS Code CLI not found. Please ensure 'code' is in your system's PATH. For help, see https://code.visualstudio.com/docs/configure/command-line#_code-is-not-recognized-as-an-internal-or-external-command. You can also install the companion extension manually from the VS Code marketplace.`,
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
          'VS Code companion extension was installed successfully. Please restart your terminal to complete the setup.',
      };
    } catch (_error) {
      return {
        success: false,
        message: `Failed to install VS Code companion extension. Please try installing it manually from the VS Code marketplace.`,
      };
    }
  }
}

class OpenVSXInstaller implements IdeInstaller {
  async install(): Promise<InstallResult> {
    // TODO: Use the correct extension path.
    const command = `npx ovsx get google.gemini-cli-vscode-ide-companion`;
    try {
      child_process.execSync(command, { stdio: 'pipe' });
      return {
        success: true,
        message:
          'VS Code companion extension was installed successfully from OpenVSX. Please restart your terminal to complete the setup.',
      };
    } catch (_error) {
      return {
        success: false,
        message: `Failed to install VS Code companion extension from OpenVSX. Please try installing it manually.`,
      };
    }
  }
}

export function getIdeInstaller(ide: DetectedIde): IdeInstaller | null {
  switch (ide) {
    case DetectedIde.VSCode:
      return new VsCodeInstaller();
    default:
      return new OpenVSXInstaller();
  }
}
