/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnalyzeScreenshotTool } from './analyzeScreenshot.js';
import type { BrowserManager, McpToolCallResult } from './browserManager.js';
import type { Config } from '../../config/config.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';

const mockMessageBus = {
  waitForConfirmation: vi.fn().mockResolvedValue({ approved: true }),
} as unknown as MessageBus;

function createMockBrowserManager(
  callToolResult?: McpToolCallResult,
): BrowserManager {
  return {
    callTool: vi.fn().mockResolvedValue(
      callToolResult ?? {
        content: [
          { type: 'text', text: 'Screenshot captured' },
          {
            type: 'image',
            data: 'base64encodeddata',
            mimeType: 'image/png',
          },
        ],
      },
    ),
  } as unknown as BrowserManager;
}

function createMockConfig(
  generateContentResult?: unknown,
  generateContentError?: Error,
): Config {
  const generateContent = generateContentError
    ? vi.fn().mockRejectedValue(generateContentError)
    : vi.fn().mockResolvedValue(
        generateContentResult ?? {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'The blue submit button is at coordinates (250, 400).',
                  },
                ],
              },
            },
          ],
        },
      );

  return {
    getBrowserAgentConfig: vi.fn().mockReturnValue({
      customConfig: { visualModel: 'test-visual-model' },
    }),
    getContentGenerator: vi.fn().mockReturnValue({
      generateContent,
    }),
  } as unknown as Config;
}

describe('analyzeScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAnalyzeScreenshotTool', () => {
    it('creates a tool with the correct name and schema', () => {
      const browserManager = createMockBrowserManager();
      const config = createMockConfig();
      const tool = createAnalyzeScreenshotTool(
        browserManager,
        config,
        mockMessageBus,
      );

      expect(tool.name).toBe('analyze_screenshot');
    });
  });

  describe('AnalyzeScreenshotInvocation', () => {
    it('captures a screenshot and returns visual analysis', async () => {
      const browserManager = createMockBrowserManager();
      const config = createMockConfig();
      const tool = createAnalyzeScreenshotTool(
        browserManager,
        config,
        mockMessageBus,
      );

      const invocation = tool.build({
        instruction: 'Find the blue submit button',
      });
      const result = await invocation.execute(new AbortController().signal);

      // Verify screenshot was captured
      expect(browserManager.callTool).toHaveBeenCalledWith(
        'take_screenshot',
        {},
      );

      // Verify the visual model was called
      const contentGenerator = config.getContentGenerator();
      expect(contentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-visual-model',
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: expect.arrayContaining([
                expect.objectContaining({
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'base64encodeddata',
                  },
                }),
              ]),
            }),
          ]),
        }),
        'visual-analysis',
        'utility_tool',
      );

      // Verify result
      expect(result.llmContent).toContain('Visual Analysis Result');
      expect(result.llmContent).toContain(
        'The blue submit button is at coordinates (250, 400).',
      );
      expect(result.error).toBeUndefined();
    });

    it('returns an error when screenshot capture fails (no image)', async () => {
      const browserManager = createMockBrowserManager({
        content: [{ type: 'text', text: 'No screenshot available' }],
      });
      const config = createMockConfig();
      const tool = createAnalyzeScreenshotTool(
        browserManager,
        config,
        mockMessageBus,
      );

      const invocation = tool.build({
        instruction: 'Find the button',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Failed to capture screenshot');
      // Should NOT call the visual model
      const contentGenerator = config.getContentGenerator();
      expect(contentGenerator.generateContent).not.toHaveBeenCalled();
    });

    it('returns an error when visual model returns empty response', async () => {
      const browserManager = createMockBrowserManager();
      const config = createMockConfig({
        candidates: [{ content: { parts: [] } }],
      });
      const tool = createAnalyzeScreenshotTool(
        browserManager,
        config,
        mockMessageBus,
      );

      const invocation = tool.build({
        instruction: 'Check the layout',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Visual model returned no analysis');
    });

    it('returns a model-unavailability fallback for 404 errors', async () => {
      const browserManager = createMockBrowserManager();
      const config = createMockConfig(
        undefined,
        new Error('Model not found: 404'),
      );
      const tool = createAnalyzeScreenshotTool(
        browserManager,
        config,
        mockMessageBus,
      );

      const invocation = tool.build({
        instruction: 'Find the red error',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain(
        'Visual analysis model is not available',
      );
    });

    it('returns a model-unavailability fallback for 403 errors', async () => {
      const browserManager = createMockBrowserManager();
      const config = createMockConfig(
        undefined,
        new Error('permission denied: 403'),
      );
      const tool = createAnalyzeScreenshotTool(
        browserManager,
        config,
        mockMessageBus,
      );

      const invocation = tool.build({
        instruction: 'Identify the element',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain(
        'Visual analysis model is not available',
      );
    });

    it('returns a generic error for non-model errors', async () => {
      const browserManager = createMockBrowserManager();
      const config = createMockConfig(undefined, new Error('Network timeout'));
      const tool = createAnalyzeScreenshotTool(
        browserManager,
        config,
        mockMessageBus,
      );

      const invocation = tool.build({
        instruction: 'Find something',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Visual analysis failed');
      expect(result.llmContent).toContain('Network timeout');
    });
  });
});
