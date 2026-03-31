/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * /web slash command — thin bridge to @google/gemini-cli-webui.
 * All web GUI logic lives in packages/webui; this file only wires
 * the server lifecycle into the CLI's SlashCommand interface.
 */

import open from 'open';
import process from 'node:process';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import {
  startServer,
  stopServer,
  setConfig,
  isRunning,
  WEB_PORT,
  WEB_URL,
} from '@google/gemini-cli-webui';

const webStartSubCommand: SlashCommand = {
  name: 'start',
  description: 'Start the web server without opening the browser',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    if (isRunning()) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Web server is already running at ${WEB_URL}`,
        },
        Date.now(),
      );
      return;
    }
    try {
      setConfig(context.services.agentContext?.config ?? null);
      await startServer();
      context.ui.addItem(
        { type: MessageType.INFO, text: `Web server started at ${WEB_URL}` },
        Date.now(),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      context.ui.addItem(
        { type: MessageType.ERROR, text: `Failed to start web server: ${msg}` },
        Date.now(),
      );
    }
  },
};

const webStopSubCommand: SlashCommand = {
  name: 'stop',
  description: 'Stop the running web server',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    if (!isRunning()) {
      context.ui.addItem(
        { type: MessageType.INFO, text: 'Web server is not running.' },
        Date.now(),
      );
      return;
    }
    await stopServer();
    context.ui.addItem(
      { type: MessageType.INFO, text: 'Web server stopped.' },
      Date.now(),
    );
  },
};

const webStatusSubCommand: SlashCommand = {
  name: 'status',
  description: 'Show current web server status',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (context: CommandContext): Promise<void> => {
    const status = isRunning()
      ? `Running at ${WEB_URL}`
      : 'Not running. Use /web or /web start to launch.';
    context.ui.addItem(
      { type: MessageType.INFO, text: `Web server status: ${status}` },
      Date.now(),
    );
  },
};

export const webCommand: SlashCommand = {
  name: 'web',
  description:
    'Open the Gemini chat web interface in your browser (port ' +
    WEB_PORT +
    ')',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  subCommands: [webStartSubCommand, webStopSubCommand, webStatusSubCommand],
  action: async (context: CommandContext): Promise<void> => {
    setConfig(context.services.agentContext?.config ?? null);

    try {
      await startServer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      context.ui.addItem(
        { type: MessageType.ERROR, text: `Failed to start web server: ${msg}` },
        Date.now(),
      );
      return;
    }

    if (process.env['SANDBOX'] && process.env['SANDBOX'] !== 'sandbox-exec') {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Gemini Chat UI available at: ${WEB_URL}`,
        },
        Date.now(),
      );
    } else {
      context.ui.addItem(
        { type: MessageType.INFO, text: `Opening Gemini Chat UI: ${WEB_URL}` },
        Date.now(),
      );
      await open(WEB_URL);
    }
  },
};
