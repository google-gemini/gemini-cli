/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectInputBlocker, removeInputBlocker } from './inputBlocker.js';
import type { BrowserManager } from './browserManager.js';

describe('inputBlocker', () => {
  let mockBrowserManager: BrowserManager;

  beforeEach(() => {
    mockBrowserManager = {
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Script ran on page and returned:' }],
      }),
    } as unknown as BrowserManager;
  });

  describe('injectInputBlocker', () => {
    it('should call evaluate_script with correct function parameter', async () => {
      await injectInputBlocker(mockBrowserManager);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        {
          function: expect.stringContaining('__gemini_input_blocker'),
        },
      );
    });

    it('should pass a function declaration, not an IIFE', async () => {
      await injectInputBlocker(mockBrowserManager);

      const call = vi.mocked(mockBrowserManager.callTool).mock.calls[0];
      const args = call[1] as { function: string };
      // Must start with "() =>" — chrome-devtools-mcp requires a function declaration
      expect(args.function.trimStart()).toMatch(/^\(\)\s*=>/);
      // Must NOT contain an IIFE invocation at the end
      expect(args.function.trimEnd()).not.toMatch(/\}\)\(\)\s*;?\s*$/);
    });

    it('should use "function" parameter name, not "code"', async () => {
      await injectInputBlocker(mockBrowserManager);

      const call = vi.mocked(mockBrowserManager.callTool).mock.calls[0];
      const args = call[1];
      expect(args).toHaveProperty('function');
      expect(args).not.toHaveProperty('code');
      expect(args).not.toHaveProperty('expression');
    });

    it('should include the informational banner text', async () => {
      await injectInputBlocker(mockBrowserManager);

      const call = vi.mocked(mockBrowserManager.callTool).mock.calls[0];
      const args = call[1] as { function: string };
      expect(args.function).toContain('Gemini CLI is controlling this browser');
    });

    it('should set aria-hidden to prevent accessibility tree pollution', async () => {
      await injectInputBlocker(mockBrowserManager);

      const call = vi.mocked(mockBrowserManager.callTool).mock.calls[0];
      const args = call[1] as { function: string };
      expect(args.function).toContain('aria-hidden');
    });

    it('should not throw if script execution fails', async () => {
      mockBrowserManager.callTool = vi
        .fn()
        .mockRejectedValue(new Error('Script failed'));

      await expect(
        injectInputBlocker(mockBrowserManager),
      ).resolves.toBeUndefined();
    });
  });

  describe('removeInputBlocker', () => {
    it('should call evaluate_script with function to remove blocker', async () => {
      await removeInputBlocker(mockBrowserManager);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        {
          function: expect.stringContaining('__gemini_input_blocker'),
        },
      );
    });

    it('should use "function" parameter name for removal too', async () => {
      await removeInputBlocker(mockBrowserManager);

      const call = vi.mocked(mockBrowserManager.callTool).mock.calls[0];
      const args = call[1];
      expect(args).toHaveProperty('function');
      expect(args).not.toHaveProperty('code');
    });

    it('should not throw if removal fails', async () => {
      mockBrowserManager.callTool = vi
        .fn()
        .mockRejectedValue(new Error('Removal failed'));

      await expect(
        removeInputBlocker(mockBrowserManager),
      ).resolves.toBeUndefined();
    });
  });
});
