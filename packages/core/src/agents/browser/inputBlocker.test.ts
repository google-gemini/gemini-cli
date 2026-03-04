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
        content: [{ type: 'text', text: 'Script executed' }],
      }),
    } as unknown as BrowserManager;
  });

  describe('injectInputBlocker', () => {
    it('should call evaluate_script with input blocker code', async () => {
      await injectInputBlocker(mockBrowserManager);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        {
          code: expect.stringContaining('__gemini_input_blocker'),
        },
      );
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
    it('should call evaluate_script with removal code', async () => {
      await removeInputBlocker(mockBrowserManager);

      expect(mockBrowserManager.callTool).toHaveBeenCalledWith(
        'evaluate_script',
        {
          code: expect.stringContaining(
            "getElementById('__gemini_input_blocker')",
          ),
        },
      );
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
