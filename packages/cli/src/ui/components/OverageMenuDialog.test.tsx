/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OverageMenuDialog } from './OverageMenuDialog.js';

const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
};

describe('OverageMenuDialog', () => {
  const mockOnChoice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should match snapshot with fallback available', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
          resetTime="2:00 PM"
          creditBalance={500}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should match snapshot without fallback', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={500}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('should display the credit balance', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
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
      // use_credits is the first item, so just press Enter
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnChoice).toHaveBeenCalledWith('use_credits');
      });
      unmount();
    });

    it('should call onChoice with manage when selected', async () => {
      // manage is the second item: Down + Enter
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\x1b[B'); // Down arrow
      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnChoice).toHaveBeenCalledWith('manage');
      });
      unmount();
    });

    it('should call onChoice with use_fallback when selected', async () => {
      // With fallback: items are [use_credits, manage, use_fallback, stop]
      // use_fallback is the third item: Down x2 + Enter
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          fallbackModel="gemini-3-flash-preview"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\x1b[B'); // Down arrow
      writeKey(stdin, '\x1b[B'); // Down arrow
      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnChoice).toHaveBeenCalledWith('use_fallback');
      });
      unmount();
    });

    it('should call onChoice with stop when selected', async () => {
      // Without fallback: items are [use_credits, manage, stop]
      // stop is the third item: Down x2 + Enter
      const { unmount, stdin, waitUntilReady } = renderWithProviders(
        <OverageMenuDialog
          failedModel="gemini-2.5-pro"
          creditBalance={100}
          onChoice={mockOnChoice}
        />,
      );
      await waitUntilReady();

      writeKey(stdin, '\x1b[B'); // Down arrow
      writeKey(stdin, '\x1b[B'); // Down arrow
      writeKey(stdin, '\r');

      await waitFor(() => {
        expect(mockOnChoice).toHaveBeenCalledWith('stop');
      });
      unmount();
    });
  });
});
