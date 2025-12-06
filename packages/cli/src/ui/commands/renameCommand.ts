/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatRecordingService } from '@google/gemini-cli-core';
import path from 'node:path';
import { SessionSelector } from '../../utils/sessionUtils.js';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

export const renameCommand: SlashCommand = {
  name: 'rename',
  description: 'Set the display name for the current session',
  kind: CommandKind.BUILT_IN,
  action: async (context, input): Promise<SlashCommandActionReturn | void> => {
    const newName = input.trim();
    if (!newName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a new name for the session.',
      };
    }

    if (!context.services.config) {
      return;
    }

    const sessionSelector = new SessionSelector(context.services.config);
    const sessions = await sessionSelector.listSessions();
    const currentSession = sessions.find((s) => s.isCurrentSession);

    if (!currentSession) {
      return;
    }

    const chatsDir = path.join(
      context.services.config.storage.getProjectTempDir(),
      'chats',
    );
    const filePath = path.join(chatsDir, currentSession.fileName);

    const recordingService = new ChatRecordingService(context.services.config);
    recordingService.initialize({
      sessionId: currentSession.id,
      filePath,
    });

    recordingService.setDisplayName(newName);

    return {
      type: 'message',
      messageType: 'info',
      content: `Session renamed to "${newName}"`,
    };
  },
};
