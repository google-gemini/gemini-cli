/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  type MessageActionReturn,
  LlmRole,
  debugLogger,
} from '@google/gemini-cli-core';
import { RemoteControlServer } from '@google/gemini-cli-remote-control';
import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Module-level singleton – one server per CLI process.
// ---------------------------------------------------------------------------

let activeServer: RemoteControlServer | null = null;
const conversationHistory: Content[] = [];

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

async function actionStart(
  context: CommandContext,
  sessionName?: string,
): Promise<MessageActionReturn> {
  if (activeServer?.isRunning()) {
    const info = activeServer.getSessionInfo()!;
    return {
      type: 'message',
      messageType: 'info',
      content: formatSessionInfo(
        info.url,
        info.sessionId,
        activeServer.getConnectedClientCount(),
      ),
    };
  }

  const config = context.services.config;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Remote control requires an active configuration.',
    };
  }

  // Reset conversation history for the new session
  conversationHistory.length = 0;

  activeServer = new RemoteControlServer({
    name: sessionName,
    verbose: false,
  });

  activeServer.setMessageHandler(async (userMessage, onChunk) => {
    const contentGenerator = config.getContentGenerator();
    const model = config.getModel();

    const contents: Content[] = [
      ...conversationHistory,
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const stream = await contentGenerator.generateContentStream(
      { model, contents },
      'remote-control',
      LlmRole.MAIN,
    );

    let fullText = '';
    for await (const chunk of stream) {
      const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (text) {
        fullText += text;
        await onChunk(text);
      }
    }

    // Maintain history for multi-turn conversations
    conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    conversationHistory.push({ role: 'model', parts: [{ text: fullText }] });
    return fullText;
  });

  activeServer.on('clientConnected', (clientId: string) => {
    debugLogger.debug(`[remote-control] client connected: ${clientId}`);
  });

  activeServer.on('error', (err: Error) => {
    debugLogger.warn(`[remote-control] error: ${err.message}`);
  });

  try {
    const sessionInfo = await activeServer.start();
    return {
      type: 'message',
      messageType: 'info',
      content: formatSessionInfo(
        sessionInfo.url,
        sessionInfo.sessionId,
        0,
        sessionInfo.projectName,
      ),
    };
  } catch (err) {
    activeServer = null;
    conversationHistory.length = 0;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to start remote control: ${msg}`,
    };
  }
}

async function actionStop(): Promise<MessageActionReturn> {
  if (!activeServer?.isRunning()) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No active remote-control session.',
    };
  }
  await activeServer.stop();
  activeServer = null;
  conversationHistory.length = 0;
  return {
    type: 'message',
    messageType: 'info',
    content: 'Remote control session stopped.',
  };
}

function actionStatus(): MessageActionReturn {
  if (!activeServer?.isRunning()) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'Remote control is not running. Use /remote-control start to begin.',
    };
  }
  const info = activeServer.getSessionInfo()!;
  return {
    type: 'message',
    messageType: 'info',
    content: formatSessionInfo(
      info.url,
      info.sessionId,
      activeServer.getConnectedClientCount(),
      info.projectName,
    ),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatSessionInfo(
  url: string,
  sessionId: string,
  connectedClients: number,
  projectName?: string,
): string {
  const lines: string[] = [
    '── Remote Control Session ──────────────────────────────',
  ];
  if (projectName) lines.push(`Project : ${projectName}`);
  lines.push(`Session : ${sessionId}`);
  lines.push(`URL     : ${url}`);
  lines.push(`Clients : ${connectedClients}`);
  lines.push('');
  lines.push('Connect a WebSocket client to the URL above to start a');
  lines.push('remote session. Messages are forwarded to this Gemini session.');
  lines.push('────────────────────────────────────────────────────────');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Slash command definition
// ---------------------------------------------------------------------------

export const remoteControlCommand: SlashCommand = {
  name: 'remote-control',
  altNames: ['rc'],
  description: 'Start or manage a remote control session',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,

  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const trimmed = args.trim();
    // If called without a sub-command, show status if running or start if not
    if (trimmed === '') {
      if (activeServer?.isRunning()) {
        return actionStatus();
      }
      return actionStart(context);
    }
    // Otherwise treat the whole args as a session name and start
    return actionStart(context, trimmed);
  },

  subCommands: [
    {
      name: 'start',
      description: 'Start a new remote control session',
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      action: async (
        context: CommandContext,
        args: string,
      ): Promise<MessageActionReturn> =>
        actionStart(context, args.trim() || undefined),
    },
    {
      name: 'stop',
      description: 'Stop the current remote control session',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (): Promise<MessageActionReturn> => actionStop(),
    },
    {
      name: 'status',
      description: 'Show the current remote control session status',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (): Promise<MessageActionReturn> => actionStatus(),
    },
  ],
};
