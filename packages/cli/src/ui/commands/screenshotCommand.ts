/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from './types.js';
import { captureScreenshot } from '../utils/clipboardUtils.js';

export const screenshotCommand: SlashCommand = {
  name: 'screenshot',
  description: 'capture a screenshot for AI analysis (modes: fullscreen, window, area [default], or "only" to capture without analysis)',
  kind: CommandKind.BUILT_IN,
  action: async (_context, args) => {
    try {
      const argStr = args.trim().toLowerCase();
      let captureMode: 'interactive' | 'fullscreen' | 'window' = 'interactive';
      let shouldAnalyze = true;

      // Parse arguments to determine capture mode and analysis preference
      if (argStr === 'only') {
        shouldAnalyze = false;
      } else if (argStr === 'fullscreen') {
        captureMode = 'fullscreen';
      } else if (argStr === 'window') {
        captureMode = 'window';
      } else if (argStr === 'area' || argStr === '') {
        captureMode = 'interactive';
      } else if (argStr.includes('only')) {
        // Handle cases like "fullscreen only", "window only"
        shouldAnalyze = false;
        if (argStr.includes('fullscreen')) {
          captureMode = 'fullscreen';
        } else if (argStr.includes('window')) {
          captureMode = 'window';
        }
      }

      const screenshotPath = await captureScreenshot(captureMode);
      
      if (screenshotPath) {
        if (shouldAnalyze) {
          // Default behavior: automatically analyze the screenshot
          return {
            type: 'submit_prompt',
            content: `${screenshotPath}\n\nPlease analyze this screenshot and describe what you see.`
          };
        } else {
          // Just capture and show path
          return {
            type: 'message',
            messageType: 'info',
            content: `Screenshot captured successfully!\nPath: ${screenshotPath}\n\nNow you can ask Gemini to analyze the image!`
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