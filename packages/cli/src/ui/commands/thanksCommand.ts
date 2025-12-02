/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import {
  logUserPositiveFeedback,
  UserPositiveFeedbackEvent,
} from '@google/gemini-cli-core';

export const thanksCommand: SlashCommand = {
  name: 'thanks',
  description: 'Express gratitude without consuming tokens.',
  kind: CommandKind.BUILT_IN,
  hidden: true, // Hide from /help list
  action: async (context, _args) => {
    if (!context.session.lastGeminiResponsePromptId) {
      context.ui.addItem(
        {
          type: 'info',
          text: 'There is no recent AI response to give feedback on.',
        },
        Date.now(),
      );
      return;
    }

    context.ui.addItem(
      {
        type: 'info',
        text: 'Feedback received. Thank you!',
      },
      Date.now(),
    );

    // Log positive feedback telemetry
    if (context.services.config) {
      logUserPositiveFeedback(
        context.services.config,
        new UserPositiveFeedbackEvent(
          context.session.lastGeminiResponsePromptId,
        ),
      );
    }
    return;
  },
};
