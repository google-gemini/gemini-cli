/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TeleportService, getAdminErrorMessage } from '@google/gemini-cli-core';
import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
  type SlashCommandActionReturn,
} from './types.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import prompts from 'prompts';

async function getSecret(keyFilePath?: string): Promise<string | undefined> {
  // 1. Check environment variable
  if (process.env['GEMINI_TELEPORT_SECRET']) {
    return process.env['GEMINI_TELEPORT_SECRET'];
  }

  // 2. Check key file
  if (keyFilePath) {
    if (fs.existsSync(keyFilePath)) {
      return fs.readFileSync(keyFilePath, 'utf8').trim();
    }
    throw new Error(`Key file not found: ${keyFilePath}`);
  }

  // 3. Interactive prompt
  const response = await prompts({
    type: 'password',
    name: 'secret',
    message: 'Enter teleport secret:',
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return response.secret as string | undefined;
}

export const teleportCommand: SlashCommand = {
  name: 'teleport',
  description:
    'Export or import sessions to make them portable across machines',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'export',
      description: 'Export a session to a portable tarball or blob storage',
      kind: CommandKind.BUILT_IN,
      action: async (
        context: CommandContext,
        args: string,
      ): Promise<SlashCommandActionReturn> => {
        if (!context.services.config) {
          return {
            type: 'message',
            messageType: 'error',
            content: getAdminErrorMessage('Teleport', undefined),
          };
        }

        const parts = args
          .trim()
          .split(/\s+/)
          .filter((p) => p !== '');
        let sessionId = '';
        let outputPath = '';
        let useSecret = false;
        let keyFilePath: string | undefined;
        let blobUri: string | undefined;

        for (let i = 0; i < parts.length; i++) {
          if (parts[i] === '--secret') {
            useSecret = true;
          } else if (parts[i] === '--key-file') {
            useSecret = true;
            keyFilePath = parts[i + 1];
            i++;
          } else if (parts[i] === '--blob') {
            blobUri = parts[i + 1];
            if (!blobUri || blobUri.startsWith('--')) {
              return {
                type: 'message',
                messageType: 'error',
                content:
                  'Please provide a blob URI after --blob flag (e.g. gs://bucket/path).',
              };
            }
            i++;
          } else if (!sessionId && !parts[i].startsWith('--')) {
            sessionId = parts[i];
          } else if (!outputPath && !parts[i].startsWith('--')) {
            outputPath = parts[i];
          }
        }

        if (!sessionId || sessionId === 'current' || sessionId === '') {
          sessionId = context.services.config.getSessionId();
        }

        if (!outputPath) {
          outputPath = `gemini-session-${sessionId.slice(0, 8)}.tar.gz`;
        }

        let secret: string | undefined;
        if (useSecret) {
          try {
            secret = await getSecret(keyFilePath);
            if (!secret) {
              return {
                type: 'message',
                messageType: 'error',
                content: 'Export cancelled: secret is required.',
              };
            }
          } catch (e) {
            return {
              type: 'message',
              messageType: 'error',
              content: String(e),
            };
          }
        }

        const teleportService = new TeleportService(context.services.config);
        try {
          const result = await teleportService.exportSession(
            sessionId,
            outputPath,
            secret,
            blobUri,
          );
          let message = `Session ${sessionId} exported successfully to ${path.resolve(outputPath)}.\nIncluded ${result.filesIncluded.length} files/directories.${secret ? ' (Encrypted)' : ''}`;
          if (blobUri) {
            message += `\nAlso uploaded to: ${blobUri}`;
          }
          return {
            type: 'message',
            messageType: 'info',
            content: message,
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to export session: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: 'import',
      description: 'Import a session from a portable tarball or blob storage',
      kind: CommandKind.BUILT_IN,
      action: async (
        context: CommandContext,
        args: string,
      ): Promise<SlashCommandActionReturn> => {
        if (!context.services.config) {
          return {
            type: 'message',
            messageType: 'error',
            content: getAdminErrorMessage('Teleport', undefined),
          };
        }

        const parts = args
          .trim()
          .split(/\s+/)
          .filter((p) => p !== '');
        let packagePathOrUri = '';
        let useSecret = false;
        let keyFilePath: string | undefined;

        for (let i = 0; i < parts.length; i++) {
          if (parts[i] === '--secret') {
            useSecret = true;
          } else if (parts[i] === '--key-file') {
            useSecret = true;
            keyFilePath = parts[i + 1];
            i++;
          } else if (!packagePathOrUri && !parts[i].startsWith('--')) {
            packagePathOrUri = parts[i];
          }
        }

        if (!packagePathOrUri) {
          return {
            type: 'message',
            messageType: 'error',
            content:
              'Please provide the path or URI to the session tarball to import.',
          };
        }

        // Only check local file if it doesn't look like a URI
        if (
          !packagePathOrUri.startsWith('gs://') &&
          !packagePathOrUri.startsWith('s3://') &&
          !fs.existsSync(packagePathOrUri)
        ) {
          return {
            type: 'message',
            messageType: 'error',
            content: `File not found: ${packagePathOrUri}`,
          };
        }

        let secret: string | undefined;
        if (useSecret) {
          try {
            secret = await getSecret(keyFilePath);
            if (!secret) {
              return {
                type: 'message',
                messageType: 'error',
                content: 'Import cancelled: secret is required.',
              };
            }
          } catch (e) {
            return {
              type: 'message',
              messageType: 'error',
              content: String(e),
            };
          }
        }

        const teleportService = new TeleportService(context.services.config);
        try {
          const result = await teleportService.importSession(
            packagePathOrUri,
            secret,
          );
          return {
            type: 'message',
            messageType: 'info',
            content: `Session imported successfully.\nSession ID: ${result.sessionId}\nProject: ${result.projectIdentifier}\n\nYou can now resume this session using: /resume ${result.sessionId}`,
          };
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to import session: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ],
  action: async (
    _context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'Use `/teleport export [session-id] [output-path] [--secret] [--key-file <path>] [--blob <uri>]` to export a session.\nUse `/teleport import <package-path-or-uri> [--secret] [--key-file <path>]` to import a session.',
    };
  },
};
