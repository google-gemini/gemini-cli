/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { WebFetchTool } from './web-fetch.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ToolConfirmationOutcome } from './tools.js';

describe('WebFetchTool', () => {
  const mockConfig = {
    getApprovalMode: vi.fn(),
    setApprovalMode: vi.fn(),
  } as unknown as Config;

  describe('shouldConfirmExecute', () => {
    it('should return confirmation details with the correct prompt and urls', async () => {
      const tool = new WebFetchTool(mockConfig);
      const params = { prompt: 'fetch https://example.com' };
      const confirmationDetails = await tool.shouldConfirmExecute(params);

      expect(confirmationDetails).toEqual({
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt: 'fetch https://example.com',
        urls: ['https://example.com'],
        onConfirm: expect.any(Function),
      });
    });

    it('should convert github urls to raw format', async () => {
      const tool = new WebFetchTool(mockConfig);
      const params = {
        prompt:
          'fetch https://github.com/google/gemini-react/blob/main/README.md',
      };
      const confirmationDetails = await tool.shouldConfirmExecute(params);

      expect(confirmationDetails).toEqual({
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt:
          'fetch https://github.com/google/gemini-react/blob/main/README.md',
        urls: [
          'https://raw.githubusercontent.com/google/gemini-react/main/README.md',
        ],
        onConfirm: expect.any(Function),
      });
    });

    it('should return false if approval mode is AUTO_EDIT', async () => {
      const tool = new WebFetchTool({
        ...mockConfig,
        getApprovalMode: () => ApprovalMode.AUTO_EDIT,
      } as unknown as Config);
      const params = { prompt: 'fetch https://example.com' };
      const confirmationDetails = await tool.shouldConfirmExecute(params);

      expect(confirmationDetails).toBe(false);
    });

    it('should call setApprovalMode when onConfirm is called with ProceedAlways', async () => {
      const setApprovalMode = vi.fn();
      const tool = new WebFetchTool({
        ...mockConfig,
        setApprovalMode,
      } as unknown as Config);
      const params = { prompt: 'fetch https://example.com' };
      const confirmationDetails = await tool.shouldConfirmExecute(params);

      if (
        confirmationDetails &&
        typeof confirmationDetails === 'object' &&
        'onConfirm' in confirmationDetails
      ) {
        await confirmationDetails.onConfirm(
          ToolConfirmationOutcome.ProceedAlways,
        );
      }

      expect(setApprovalMode).toHaveBeenCalledWith(ApprovalMode.AUTO_EDIT);
    });
  });
});
