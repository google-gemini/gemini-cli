/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { EmptyWalletDialog } from './EmptyWalletDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

// Mock the child component to make it easier to test the parent
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

describe('EmptyWalletDialog', () => {
  const mockOnChoice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render with correct menu options', () => {
      const { unmount } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          resetTime="2:00 PM"
          onChoice={mockOnChoice}
        />,
      );

      expect(RadioButtonSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              label: 'Get AI Credits - Open browser to purchase credits',
              value: 'get_credits',
              key: 'get_credits',
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

    it('should not display credit balance in empty wallet state', () => {
      const { lastFrame, unmount } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).not.toContain('AI Credits available');
      expect(output).toContain('purchase more AI Credits');
      unmount();
    });

    it('should display the model name', () => {
      const { lastFrame, unmount } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('gemini-2.5-pro');
      expect(output).toContain('Usage limit reached');
      unmount();
    });

    it('should display purchase prompt', () => {
      const { lastFrame, unmount } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).toContain('purchase more AI Credits');
      unmount();
    });

    it('should display reset time when provided', () => {
      const { lastFrame, unmount } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          resetTime="3:45 PM"
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
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );

      const output = lastFrame() ?? '';
      expect(output).not.toContain('Access resets at');
      unmount();
    });
  });

  describe('onChoice handling', () => {
    it('should call onChoice with get_credits when selected', () => {
      const { unmount } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('get_credits');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('get_credits');
      unmount();
    });

    it('should call onChoice with switch_auth when selected', () => {
      const { unmount } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
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
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
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
