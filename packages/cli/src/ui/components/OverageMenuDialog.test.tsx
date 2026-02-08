/**
 * @license
 * Copyright 2025 Google LLC
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
    it('should render with correct menu options', () => {
      const { unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          resetTime="2:00 PM"
          creditBalance={500}
          onChoice={mockOnChoice}
        />,
      );

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
              label: 'Switch Auth - Use a different authentication mode',
              value: 'switch_auth',
              key: 'switch_auth',
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

    it('should display the credit balance', () => {
      const { lastFrame, unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={200}
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('200');
      expect(output).toContain('AI Credits available');
      unmount();
    });

    it('should display the model name', () => {
      const { lastFrame, unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('gemini-2.5-pro');
      expect(output).toContain('Usage limit reached');
      unmount();
    });

    it('should display reset time when provided', () => {
      const { lastFrame, unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          resetTime="3:45 PM"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('3:45 PM');
      expect(output).toContain('Access resets at');
      unmount();
    });

    it('should not display reset time when not provided', () => {
      const { lastFrame, unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).not.toContain('Access resets at');
      unmount();
    });
  });

  describe('onChoice handling', () => {
    it('should call onChoice with use_credits when selected', () => {
      const { unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('use_credits');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('use_credits');
      unmount();
    });

    it('should call onChoice with manage when selected', () => {
      const { unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('manage');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('manage');
      unmount();
    });

    it('should call onChoice with switch_auth when selected', () => {
      const { unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('switch_auth');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('switch_auth');
      unmount();
    });

    it('should call onChoice with stop when selected', () => {
      const { unmount } = render(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('stop');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('stop');
      unmount();
    });
  });
});
