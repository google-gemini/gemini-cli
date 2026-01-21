/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ProQuotaDialog } from './ProQuotaDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

import {
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '@google/gemini-cli-core';

// Mock the child component to make it easier to test the parent
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

describe('ProQuotaDialog', () => {
  const mockOnChoice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('for flash model failures', () => {
    it('should render "Keep trying" and "Stop" options', () => {
      const { unmount } = render(
        <ProQuotaDialog
          failedModel={DEFAULT_GEMINI_FLASH_MODEL}
          fallbackModel={DEFAULT_GEMINI_FLASH_MODEL}
          message="flash error"
          isTerminalQuotaError={true} // should not matter
          onChoice={mockOnChoice}
        />,
      );

      expect(RadioButtonSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              label: 'Keep trying',
              value: 'retry_once',
              key: 'retry_once',
            },
            {
              label: 'Stop',
              value: 'retry_later',
              key: 'retry_later',
            },
          ],
        }),
        undefined,
      );
      unmount();
    });
  });

  describe('for non-flash model failures', () => {
    describe('when it is a terminal quota error', () => {
      it('should render switch, upgrade, and stop options for paid tiers', () => {
        const { unmount } = render(
          <ProQuotaDialog
            failedModel="gemini-2.5-pro"
            fallbackModel="gemini-2.5-flash"
            message="paid tier quota error"
            isTerminalQuotaError={true}
            isModelNotFoundError={false}
            onChoice={mockOnChoice}
          />,
        );

        expect(RadioButtonSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              {
                label: 'Switch to gemini-2.5-flash',
                value: 'retry_always',
                key: 'retry_always',
              },
              {
                label: 'Upgrade for higher limits',
                value: 'upgrade',
                key: 'upgrade',
              },
              {
                label: 'Stop',
                value: 'retry_later',
                key: 'retry_later',
              },
            ],
          }),
          undefined,
        );
        unmount();
      });

      it('should render "Keep trying" and "Stop" options when failed model and fallback model are the same', () => {
        const { unmount } = render(
          <ProQuotaDialog
            failedModel={PREVIEW_GEMINI_MODEL}
            fallbackModel={PREVIEW_GEMINI_MODEL}
            message="flash error"
            isTerminalQuotaError={true}
            onChoice={mockOnChoice}
          />,
        );

        expect(RadioButtonSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              {
                label: 'Keep trying',
                value: 'retry_once',
                key: 'retry_once',
              },
              {
                label: 'Stop',
                value: 'retry_later',
                key: 'retry_later',
              },
            ],
          }),
          undefined,
        );
        unmount();
      });

      it('should render switch, upgrade, and stop options for free tier', () => {
        const { unmount } = render(
          <ProQuotaDialog
            failedModel="gemini-2.5-pro"
            fallbackModel="gemini-2.5-flash"
            message="free tier quota error"
            isTerminalQuotaError={true}
            isModelNotFoundError={false}
            onChoice={mockOnChoice}
          />,
        );

        expect(RadioButtonSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              {
                label: 'Switch to gemini-2.5-flash',
                value: 'retry_always',
                key: 'retry_always',
              },
              {
                label: 'Upgrade for higher limits',
                value: 'upgrade',
                key: 'upgrade',
              },
              {
                label: 'Stop',
                value: 'retry_later',
                key: 'retry_later',
              },
            ],
          }),
          undefined,
        );
        unmount();
      });
    });

    describe('when it is a capacity error', () => {
      it('should render keep trying, switch, and stop options', () => {
        const { unmount } = render(
          <ProQuotaDialog
            failedModel="gemini-2.5-pro"
            fallbackModel="gemini-2.5-flash"
            message="capacity error"
            isTerminalQuotaError={false}
            isModelNotFoundError={false}
            onChoice={mockOnChoice}
          />,
        );

        expect(RadioButtonSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              {
                label: 'Keep trying',
                value: 'retry_once',
                key: 'retry_once',
              },
              {
                label: 'Switch to gemini-2.5-flash',
                value: 'retry_always',
                key: 'retry_always',
              },
              { label: 'Stop', value: 'retry_later', key: 'retry_later' },
            ],
          }),
          undefined,
        );
        unmount();
      });
    });

    describe('when it is a model not found error', () => {
      it('should render switch and stop options regardless of tier', () => {
        const { unmount } = render(
          <ProQuotaDialog
            failedModel="gemini-3-pro-preview"
            fallbackModel="gemini-2.5-pro"
            message="You don't have access to gemini-3-pro-preview yet."
            isTerminalQuotaError={false}
            isModelNotFoundError={true}
            onChoice={mockOnChoice}
          />,
        );

        expect(RadioButtonSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              {
                label: 'Switch to gemini-2.5-pro',
                value: 'retry_always',
                key: 'retry_always',
              },
              {
                label: 'Upgrade for higher limits',
                value: 'upgrade',
                key: 'upgrade',
              },
              {
                label: 'Stop',
                value: 'retry_later',
                key: 'retry_later',
              },
            ],
          }),
          undefined,
        );
        unmount();
      });

      it('should render switch and stop options for paid tier as well', () => {
        const { unmount } = render(
          <ProQuotaDialog
            failedModel="gemini-3-pro-preview"
            fallbackModel="gemini-2.5-pro"
            message="You don't have access to gemini-3-pro-preview yet."
            isTerminalQuotaError={false}
            isModelNotFoundError={true}
            onChoice={mockOnChoice}
          />,
        );

        expect(RadioButtonSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              {
                label: 'Switch to gemini-2.5-pro',
                value: 'retry_always',
                key: 'retry_always',
              },
              {
                label: 'Upgrade for higher limits',
                value: 'upgrade',
                key: 'upgrade',
              },
              {
                label: 'Stop',
                value: 'retry_later',
                key: 'retry_later',
              },
            ],
          }),
          undefined,
        );
        unmount();
      });
    });
  });

  describe('onChoice handling', () => {
    it('should call onChoice with the selected value', () => {
      const { unmount } = render(
        <ProQuotaDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-2.5-flash"
          message=""
          isTerminalQuotaError={false}
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('retry_always');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('retry_always');
      unmount();
    });
  });
});
