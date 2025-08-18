/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from './types.js';
import { captureScreenshot } from '../utils/clipboardUtils.js';

export const screenshotCommand: SlashCommand = {
  name: 'screenshot',
  description: 'capture a screenshot for AI analysis',
  kind: CommandKind.BUILT_IN,
  action: async (_context, _args) => {
    try {
      const screenshotPath = await captureScreenshot();
      
      if (screenshotPath) {
        return {
          type: 'message',
          messageType: 'info',
          content: `Screenshot captured successfully!\nPath: ${screenshotPath}\n\nNow you can ask Gemini to analyze the image!`
        };
      } else {
        return {
          type: 'message',
          messageType: 'info',
          content: 'Screenshot capture was cancelled.'
        };
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  },
};