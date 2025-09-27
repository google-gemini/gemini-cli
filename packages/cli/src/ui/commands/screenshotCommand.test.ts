/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screenshotCommand } from './screenshotCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { CommandKind } from './types.js';

vi.mock('../utils/clipboardUtils.js', () => ({
  captureScreenshot: vi.fn(),
}));

import { captureScreenshot } from '../utils/clipboardUtils.js';

describe('screenshotCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    vi.clearAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(screenshotCommand.name).toBe('screenshot');
    expect(screenshotCommand.description).toBe('capture a screenshot for AI analysis (modes: fullscreen, window, interactive [default], or "only" to capture without analysis)');
    expect(screenshotCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should have an action function', () => {
    expect(screenshotCommand.action).toBeDefined();
    expect(typeof screenshotCommand.action).toBe('function');
  });

  describe('argument parsing', () => {
    it('should use interactive mode by default with empty args', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      await screenshotCommand.action!(mockContext, '');

      expect(captureScreenshot).toHaveBeenCalledWith('interactive');
    });

    it('should parse fullscreen mode correctly', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      await screenshotCommand.action!(mockContext, 'fullscreen');

      expect(captureScreenshot).toHaveBeenCalledWith('fullscreen');
    });

    it('should parse window mode correctly', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      await screenshotCommand.action!(mockContext, 'window');

      expect(captureScreenshot).toHaveBeenCalledWith('window');
    });

    it('should parse interactive mode correctly', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      await screenshotCommand.action!(mockContext, 'interactive');

      expect(captureScreenshot).toHaveBeenCalledWith('interactive');
    });

    it('should handle case insensitive input', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      await screenshotCommand.action!(mockContext, 'FULLSCREEN');

      expect(captureScreenshot).toHaveBeenCalledWith('fullscreen');
    });

    it('should handle whitespace in input', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      await screenshotCommand.action!(mockContext, '  window  ');

      expect(captureScreenshot).toHaveBeenCalledWith('window');
    });

    it('should return error for invalid capture mode', async () => {
      const result = await screenshotCommand.action!(mockContext, 'invalid');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Invalid capture mode: "invalid". Valid modes: fullscreen, window, interactive.'
      });
      expect(captureScreenshot).not.toHaveBeenCalled();
    });

    it('should return error for multiple capture modes', async () => {
      const result = await screenshotCommand.action!(mockContext, 'fullscreen window');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Invalid arguments: Please specify at most one capture mode. Valid modes: fullscreen, window, interactive (or empty for default).'
      });
      expect(captureScreenshot).not.toHaveBeenCalled();
    });
  });

  describe('only flag handling', () => {
    it('should capture and analyze by default', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      const result = await screenshotCommand.action!(mockContext, 'fullscreen');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: '/path/to/screenshot.png\n\nPlease analyze this screenshot and describe what you see.'
      });
    });

    it('should capture without analysis when only flag is used', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      const result = await screenshotCommand.action!(mockContext, 'only');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Screenshot captured successfully!\nPath: /path/to/screenshot.png\n\nNow you can ask Gemini to analyze the image!'
      });
    });

    it('should handle only flag with capture mode', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      const result = await screenshotCommand.action!(mockContext, 'fullscreen only');

      expect(captureScreenshot).toHaveBeenCalledWith('fullscreen');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Screenshot captured successfully!\nPath: /path/to/screenshot.png\n\nNow you can ask Gemini to analyze the image!'
      });
    });

    it('should handle only flag with different order', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      const result = await screenshotCommand.action!(mockContext, 'only window');

      expect(captureScreenshot).toHaveBeenCalledWith('window');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Screenshot captured successfully!\nPath: /path/to/screenshot.png\n\nNow you can ask Gemini to analyze the image!'
      });
    });
  });

  describe('screenshot capture behavior', () => {
    it('should return submit_prompt when screenshot is captured and shouldAnalyze is true', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      const result = await screenshotCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: '/path/to/screenshot.png\n\nPlease analyze this screenshot and describe what you see.'
      });
    });

    it('should return info message when screenshot is captured and shouldAnalyze is false', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue('/path/to/screenshot.png');

      const result = await screenshotCommand.action!(mockContext, 'only');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Screenshot captured successfully!\nPath: /path/to/screenshot.png\n\nNow you can ask Gemini to analyze the image!'
      });
    });

    it('should return cancellation message when screenshot capture returns null', async () => {
      vi.mocked(captureScreenshot).mockResolvedValue(null);

      const result = await screenshotCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Screenshot capture was cancelled.'
      });
    });

    it('should return error message when screenshot capture throws error', async () => {
      const error = new Error('Permission denied');
      vi.mocked(captureScreenshot).mockRejectedValue(error);

      const result = await screenshotCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to capture screenshot: Permission denied'
      });
    });

    it('should handle non-Error objects thrown by captureScreenshot', async () => {
      vi.mocked(captureScreenshot).mockRejectedValue('Something went wrong');

      const result = await screenshotCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to capture screenshot: Something went wrong'
      });
    });
  });
});