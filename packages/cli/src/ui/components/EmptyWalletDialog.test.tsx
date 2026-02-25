/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { EmptyWalletDialog } from './EmptyWalletDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

// Mock the child component to make it easier to test the parent
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

describe('EmptyWalletDialog', () => {
  const mockOnChoice = vi.fn();
  const mockOnGetCredits = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render with correct menu options when fallback is available', async () => {
      const { unmount, waitUntilReady } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
          resetTime="2:00 PM"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(RadioButtonSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              label: 'Get AI Credits - Open browser to purchase credits',
              value: 'get_credits',
              key: 'get_credits',
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
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(RadioButtonSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              label: 'Get AI Credits - Open browser to purchase credits',
              value: 'get_credits',
              key: 'get_credits',
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

    it('should display the model name and usage limit message', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const output = lastFrame() ?? '';
      expect(output).toContain('gemini-2.5-pro');
      expect(output).toContain('Usage limit reached');
      unmount();
    });

    it('should display purchase prompt and credits update notice', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const output = lastFrame() ?? '';
      expect(output).toContain('purchase more AI Credits');
      expect(output).toContain(
        'Newly purchased AI credits may take a few minutes to update',
      );
      unmount();
    });

    it('should display reset time when provided', async () => {
      const { lastFrame, unmount, waitUntilReady } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          resetTime="3:45 PM"
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
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
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
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
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
    it('should call onGetCredits and onChoice when get_credits is selected', async () => {
      const { unmount, waitUntilReady } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
          onGetCredits={mockOnGetCredits}
        />,
      );
      await waitUntilReady();

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

      await act(async () => {
        onSelect('get_credits');
      });

      expect(mockOnGetCredits).toHaveBeenCalled();
      expect(mockOnChoice).toHaveBeenCalledWith('get_credits');
      unmount();
    });

    it('should call onChoice without onGetCredits when onGetCredits is not provided', async () => {
      const { unmount, waitUntilReady } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

      await act(async () => {
        onSelect('get_credits');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('get_credits');
      unmount();
    });

    it('should call onChoice with use_fallback when selected', async () => {
      const { unmount, waitUntilReady } = render(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
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
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
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
