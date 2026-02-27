/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmptyWalletDialog } from './EmptyWalletDialog.js';

const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
};

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
    it('should match snapshot with fallback available', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
          resetTime="2:00 PM"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should match snapshot without fallback', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should display the model name and usage limit message', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      // get_credits is the first item, so just press Enter
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
          onGetCredits={mockOnGetCredits}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnGetCredits).toHaveBeenCalled();
        expect(mockOnChoice).toHaveBeenCalledWith('get_credits');
      });
      unmount();
    });

    it('should call onChoice without onGetCredits when onGetCredits is not provided', async () => {
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnChoice).toHaveBeenCalledWith('get_credits');
      });
      unmount();
    });

    it('should call onChoice with use_fallback when selected', async () => {
      // With fallback: items are [get_credits, use_fallback, stop]
      // use_fallback is the second item: Down + Enter
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\x1b[B'); // Down arrow
      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnChoice).toHaveBeenCalledWith('use_fallback');
      });
      unmount();
    });

    it('should call onChoice with stop when selected', async () => {
      // Without fallback: items are [get_credits, stop]
      // stop is the second item: Down + Enter
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <EmptyWalletDialog
          failedModel="gemini-2.5-pro"
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\x1b[B'); // Down arrow
      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnChoice).toHaveBeenCalledWith('stop');
      });
      unmount();
    });
  });
});
