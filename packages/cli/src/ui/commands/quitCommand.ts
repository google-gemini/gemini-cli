/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDuration } from '../utils/formatters.js';
import { CommandKind, type SlashCommand } from './types.js';
import { getConversationSessionName } from '../../utils/sessionUtils.js';

export const quitCommand: SlashCommand = {
  name: 'quit',
  altNames: ['exit'],
  description: 'Exit the cli',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    const now = Date.now();
    const { sessionStartTime } = context.session.stats;
    const wallDuration = now - sessionStartTime.getTime();
    const conversation = context.services.config
      ?.getGeminiClient()
      ?.getChatRecordingService()
      ?.getConversation();
    const sessionName = conversation
      ? getConversationSessionName(conversation)
      : undefined;
    const resumeCommandHint = sessionName
      ? `gemini --resume ${sessionName}`
      : undefined;

    return {
      type: 'quit',
      messages: [
        {
          type: 'user',
          text: `/quit`, // Keep it consistent, even if /exit was used
          id: now - 1,
        },
        {
          type: 'quit',
          duration: formatDuration(wallDuration),
          ...(sessionName ? { sessionName } : {}),
          ...(resumeCommandHint ? { resumeCommandHint } : {}),
          id: now,
        },
      ],
    };
  },
};
