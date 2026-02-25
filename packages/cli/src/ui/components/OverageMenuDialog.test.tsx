/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { OverageMenuDialog } from './OverageMenuDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

// Mock the child component to make it easier to test the parent
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

describe('OverageMenuDialog', () => {
  const mockOnChoice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render with correct menu options when fallback is available', async () => {
      const { unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
          resetTime="2:00 PM"
          creditBalance={500}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(RadioButtonSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              label: 'Use AI Credits - Continue this request (Overage)',
              value: 'use_credits',
              key: 'use_credits',
            },
            {
              label: 'Manage - View balance and purchase more credits',
              value: 'manage',
              key: 'manage',
            },
            {
              label: 'Switch to gemini-3-flash-preview',
              value: 'use_fallback',
              key: 'use_fallback',
            },
            {
              label: 'Stop - Abort request',
              value: 'stop',
              key: 'stop',
            },
          ],
        }),
        undefined,
      );
      unmount();
    });

    it('should omit fallback option when fallbackModel is not provided', async () => {
      const { unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={500}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(RadioButtonSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              label: 'Use AI Credits - Continue this request (Overage)',
              value: 'use_credits',
              key: 'use_credits',
            },
            {
              label: 'Manage - View balance and purchase more credits',
              value: 'manage',
              key: 'manage',
            },
            {
              label: 'Stop - Abort request',
              value: 'stop',
              key: 'stop',
            },
          ],
        }),
        undefined,
      );
      unmount();
    });

    it('should display the credit balance', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={200}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const output = lastFrame() ?? '';
      expect(output).toContain('200');
      expect(output).toContain('AI Credits available');
      unmount();
    });

    it('should display the model name', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const output = lastFrame() ?? '';
      expect(output).toContain('gemini-2.5-pro');
      expect(output).toContain('Usage limit reached');
      unmount();
    });

    it('should display reset time when provided', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          resetTime="3:45 PM"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const output = lastFrame() ?? '';
      expect(output).toContain('3:45 PM');
      expect(output).toContain('Access resets at');
      unmount();
    });

    it('should not display reset time when not provided', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const output = lastFrame() ?? '';
      expect(output).not.toContain('Access resets at');
      unmount();
    });

    it('should display slash command hints', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const output = lastFrame() ?? '';
      expect(output).toContain('/stats');
      expect(output).toContain('/model');
      expect(output).toContain('/auth');
      unmount();
    });
  });

  describe('onChoice handling', () => {
    it('should call onChoice with use_credits when selected', async () => {
      const { unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      await act(async () => {
        onSelect('use_credits');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('use_credits');
      unmount();
    });

    it('should call onChoice with manage when selected', async () => {
      const { unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      await act(async () => {
        onSelect('manage');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('manage');
      unmount();
    });

    it('should call onChoice with use_fallback when selected', async () => {
      const { unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      await act(async () => {
        onSelect('use_fallback');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('use_fallback');
      unmount();
    });

    it('should call onChoice with stop when selected', async () => {
      const { unmount, waitUntilReady } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      await act(async () => {
        onSelect('stop');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('stop');
      unmount();
    });
  });
});
