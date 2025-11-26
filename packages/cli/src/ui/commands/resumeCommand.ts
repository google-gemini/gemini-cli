/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResumedSessionData } from '@google/gemini-cli-core';
import { SessionSelector } from '../../utils/sessionUtils.js';
import { convertSessionToHistoryFormats } from '../hooks/useSessionBrowser.js';
import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';

async function resumeFromIdentifier(
  context: CommandContext,
  identifier: string,
): Promise<SlashCommandActionReturn> {
  const { config } = context.services;

  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Configuration is not available.',
    };
  }

  const sessionSelector = new SessionSelector(config);

  try {
    const result = await sessionSelector.resolveSession(identifier);
    const resumedSessionData: ResumedSessionData = {
      conversation: result.sessionData,
      filePath: result.sessionPath,
    };

    // Continue recording into the same session file.
    config.setSessionId(resumedSessionData.conversation.sessionId);

    const historyData = convertSessionToHistoryFormats(
      resumedSessionData.conversation.messages,
    );

    return {
      type: 'load_history',
      history: historyData.uiHistory,
      clientHistory: historyData.clientHistory,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error resuming session.';

    // Surface the error to the UI as a regular error message.
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Error resuming session: ${message}`,
      },
      Date.now(),
    );

    return {
      type: 'message',
      messageType: 'error',
      content: `Error resuming session: ${message}`,
    };
  }
}

export const resumeCommand: SlashCommand = {
  name: 'resume',
  description:
    'Resume an auto-saved session. Usage: /resume [number|uuid|latest]. Run without arguments to open the session browser.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const identifier = (args || '').trim();
    if (!identifier) {
      return {
        type: 'dialog',
        dialog: 'sessionBrowser',
      };
    }

    return resumeFromIdentifier(context, identifier);
  },
};
