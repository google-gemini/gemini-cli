/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process';
import * as process from 'process';
import { glob } from 'glob';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DetectedIde } from './detect-ide.js';

const VSCODE_COMMAND = process.platform === 'win32' ? 'code.cmd' : 'code';
const VSCODE_COMPANION_EXTENSION_FOLDER = 'vscode-ide-companion';

export interface IdeInstaller {
  install(): Promise<InstallResult>;
  isInstalled(): boolean;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

class VsCodeInstaller implements IdeInstaller {
  isInstalled(): boolean {
    try {
      child_process.execSync(
        process.platform === 'win32'
          ? `where.exe ${VSCODE_COMMAND}`
          : `command -v ${VSCODE_COMMAND}`,
        { stdio: 'ignore' },
      );
      return true;
    } catch {
      return false;
    }
  }

  async install(): Promise<InstallResult> {
    if (!this.isInstalled()) {
      return {
        success: false,
        message: `VS Code command-line tool "${VSCODE_COMMAND}" not found in your PATH.`,
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
        bundleDir,
        '..',
        '..',
        '..',
        '..',
        '..',
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
    const command = `${VSCODE_COMMAND} --install-extension ${vsixPath} --force`;
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
