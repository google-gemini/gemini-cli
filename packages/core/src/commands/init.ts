/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageActionReturn, SubmitPromptActionReturn } from './types.js';

export function performInit(
  doesGeminiMdExist: boolean,
): MessageActionReturn | SubmitPromptActionReturn {
  if (doesGeminiMdExist) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'A GEMINI.md file already exists in this directory. No changes were made.',
    };
  }

  return {
    type: 'message',
    messageType: 'info',
    content:
      'GEMINI.md has been initialized with default rules and project identity.',
  };
}
