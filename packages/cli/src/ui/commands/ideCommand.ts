/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileURLToPath } from 'url';
import { Config, IDEConnectionStatus } from '@google/gemini-cli-core';
import {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import * as child_process from 'child_process';
import * as process from 'process';
import { glob } from 'glob';
import * as path from 'path';

const VSCODE_COMMAND = process.platform === 'win32' ? 'code.cmd' : 'code';
const VSCODE_COMPANION_EXTENSION_FOLDER = 'vscode-ide-companion';

function isVSCodeInstalled(): boolean {
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

export const ideCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getIdeMode()) {
    return null;
  }

  return {
    name: 'ide',
    description: 'manage IDE integration',
    kind: CommandKind.BUILT_IN,
    subCommands: [
      {
        name: 'status',
        description: 'check status of IDE integration',
        kind: CommandKind.BUILT_IN,
        action: (_context: CommandContext): SlashCommandActionReturn => {
          const connection = config.getIdeClient()?.getConnectionStatus();
          switch (connection?.status) {
            case IDEConnectionStatus.Connected:
              return {
                type: 'message',
                messageType: 'info',
                content: `🟢 Connected`,
              } as const;
            case IDEConnectionStatus.Connecting:
              return {
                type: 'message',
                messageType: 'info',
                content: `🟡 Connecting...`,
              } as const;
            default: {
              let content = `🔴 Disconnected`;
              if (connection?.details) {
                content += `: ${connection.details}`;
              }
              return {
                type: 'message',
                messageType: 'error',
                content,
              } as const;
            }
          }
        },
      },
      {
        name: 'install',
        description: 'install required VS Code companion extension',
        kind: CommandKind.BUILT_IN,
        action: async (context) => {
          if (!isVSCodeInstalled()) {
            context.ui.addItem(
              {
                type: 'error',
                text: `VS Code command-line tool "${VSCODE_COMMAND}" not found in your PATH.`,
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
              VSCODE_COMPANION_EXTENSION_FOLDER,
              '*.vsix',
            );
            vsixFiles = glob.sync(devPath);
          }
          if (vsixFiles.length === 0) {
            context.ui.addItem(
              {
                type: 'error',
                text: 'Could not find the required VS Code companion extension. Please file a bug via /bug.',
              },
              Date.now(),
            );
            return;
          }

          const vsixPath = vsixFiles[0];
          const command = `${VSCODE_COMMAND} --install-extension ${vsixPath} --force`;
          context.ui.addItem(
            {
              type: 'info',
              text: `Installing VS Code companion extension...`,
            },
            Date.now(),
          );
          try {
            child_process.execSync(command, { stdio: 'pipe' });
            context.ui.addItem(
              {
                type: 'info',
                text: 'VS Code companion extension installed successfully. Restart gemini-cli in a fresh terminal window.',
              },
              Date.now(),
            );
          } catch (_error) {
            context.ui.addItem(
              {
                type: 'error',
                text: `Failed to install VS Code companion extension.`,
              },
              Date.now(),
            );
          }
        },
      },
    ],
  };
};
