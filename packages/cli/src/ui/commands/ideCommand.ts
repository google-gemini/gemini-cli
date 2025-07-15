/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileURLToPath } from 'url';
import { Config } from '@google/gemini-cli-core';
import { SlashCommand } from './types.js';
import * as child_process from 'child_process';
import * as process from 'process';
import { glob } from 'glob';
import * as path from 'path';

const VSCODE_COMMAND = process.platform === 'win32' ? 'code.cmd' : 'code';

function isVSCodeInstalled(): boolean {
  try {
    child_process.execSync(
      process.platform === 'win32'
        ? `where.exe ${VSCODE_COMMAND}`
        : `command -v ${VSCODE_COMMAND}`,
      { stdio: 'ignore' },
    );
    return true;
  } catch (_e) {
    return false;
  }
}

interface ExecError extends Error {
  stderr: Buffer;
}

export const ideCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getIdeMode()) {
    return null;
  }

  return {
    name: 'ide',
    description: 'Commands for interacting with the IDE.',
    subCommands: [
      {
        name: 'install',
        description: 'Install IDE extension.',
        action: async (context) => {
          if (!isVSCodeInstalled()) {
            context.ui.addItem(
              {
                type: 'error',
                text: `VSCode command-line tool "${VSCODE_COMMAND}" not found in your PATH. Please make sure it is installed and configured correctly.`,
              },
              Date.now(),
            );
            return;
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
              'vscode-ide-companion',
              '*.vsix',
            );
            console.log(devPath)
            vsixFiles = glob.sync(devPath);
          }

          if (vsixFiles.length === 0) {
            context.ui.addItem(
              {
                type: 'error',
                text: 'Could not find the VSCode extension file (.vsix).',
              },
              Date.now(),
            );
            return;
          }
          const vsixPath = vsixFiles[0];
          if (!vsixPath) {
            context.ui.addItem(
              {
                type: 'error',
                text: 'Could not find the VSCode extension file (.vsix).',
              },
              Date.now(),
            );
            return;
          }

          const command = `${VSCODE_COMMAND} --install-extension ${vsixPath} --force`;
          context.ui.addItem(
            {
              type: 'info',
              text: `Installing VSCode extension from ${vsixPath}...`,
            },
            Date.now(),
          );
          try {
            child_process.execSync(command, { stdio: 'pipe' });
            context.ui.addItem(
              {
                type: 'info',
                text: 'VSCode extension installed successfully.',
              },
              Date.now(),
            );
          } catch (error) {
            const execError = error as ExecError;
            context.ui.addItem(
              {
                type: 'error',
                text: `Failed to install VSCode extension. Command failed: ${command}\nError: ${execError.stderr.toString()}`,
              },
              Date.now(),
            );
          }
        },
      },
    ],
  };
};
