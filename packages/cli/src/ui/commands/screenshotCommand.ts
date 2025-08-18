/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from './types.js';
import { captureScreenshot } from '../utils/clipboardUtils.js';

export const screenshotCommand: SlashCommand = {
  name: 'screenshot',
  description: 'capture a screenshot for AI analysis (auto-analyze by default, or use "only" to capture only)',
  kind: CommandKind.BUILT_IN,
  action: async (_context, args) => {
    try {
      const screenshotPath = await captureScreenshot();
      
      if (screenshotPath) {
        // If "only" argument provided, just capture and show path
        if (args.trim() === 'only') {
          return {
            type: 'message',
            messageType: 'info',
            content: `Screenshot captured successfully!\nPath: ${screenshotPath}\n\nNow you can ask Gemini to analyze the image!`
          };
        } else {
          // Default behavior: automatically analyze the screenshot
          return {
            type: 'submit_prompt',
            content: `${screenshotPath}\n\nPlease analyze this screenshot and describe what you see.`
          };
        }
      } else {
        return {
          type: 'message',
          messageType: 'info',
          content: `Screenshot capture was cancelled.\n\n💡 If you see only background/wallpaper:\n   Enable Screen Recording permission for your terminal in\n   System Preferences > Security & Privacy > Privacy`
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