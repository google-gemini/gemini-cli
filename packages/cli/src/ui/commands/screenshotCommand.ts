/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from './types.js';
import { captureScreenshot } from '../utils/clipboardUtils.js';

export const screenshotCommand: SlashCommand = {
  name: 'screenshot',
  description: 'capture a screenshot for AI analysis (modes: fullscreen, window, interactive [default], or "only" to capture without analysis)',
  kind: CommandKind.BUILT_IN,
  action: async (_context, args) => {
    try {
      const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let captureMode: 'interactive' | 'fullscreen' | 'window' = 'interactive';
      const shouldAnalyze = !parts.includes('only');

      const modes = parts.filter(p => p !== 'only');

      // Validate: at most one capture mode allowed
      if (modes.length > 1) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Invalid arguments: Please specify at most one capture mode. Valid modes: fullscreen, window, interactive (or empty for default).`
        };
      }

      // Set capture mode based on valid input
      const mode = modes[0];
      if (mode === 'fullscreen') {
        captureMode = 'fullscreen';
      } else if (mode === 'window') {
        captureMode = 'window';
      } else if (mode === 'area' || mode === undefined) {
        captureMode = 'interactive';
      } else {
        return {
          type: 'message',
          messageType: 'error',
          content: `Invalid capture mode: "${mode}". Valid modes: fullscreen, window, interactive.`
        };
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
          content: `Screenshot capture was cancelled.`
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
