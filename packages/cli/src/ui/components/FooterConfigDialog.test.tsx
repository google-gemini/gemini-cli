/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { FooterConfigDialog } from './FooterConfigDialog.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { act } from 'react';

describe('<FooterConfigDialog />', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly with default settings', async () => {
    const settings = createMockSettings();
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('toggles an item when enter is pressed', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();
    act(() => {
      stdin.write('\r'); // Enter to toggle
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('[ ] workspace (/directory)');
    });

    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('[✓] workspace (/directory)');
    });
  });

  it('reorders items with arrow keys', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();
    // Initial order: workspace (/directory), branch, ...
    const output = lastFrame();
    const cwdIdx = output.indexOf('] workspace (/directory)');
    const branchIdx = output.indexOf('] branch');
    expect(cwdIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeGreaterThan(-1);
    expect(cwdIdx).toBeLessThan(branchIdx);

    // Move workspace (/directory) down (right arrow)
    act(() => {
      stdin.write('\u001b[C'); // Right arrow
    });

    await waitFor(() => {
      const outputAfter = lastFrame();
      const cwdIdxAfter = outputAfter.indexOf('] workspace (/directory)');
      const branchIdxAfter = outputAfter.indexOf('] branch');
      expect(cwdIdxAfter).toBeGreaterThan(-1);
      expect(branchIdxAfter).toBeGreaterThan(-1);
      expect(branchIdxAfter).toBeLessThan(cwdIdxAfter);
    });
  });

  it('closes on Esc', async () => {
    const settings = createMockSettings();
    const { stdin, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();
    act(() => {
      stdin.write('\x1b'); // Esc
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('highlights the active item in the preview', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('~/project/path');

    // Move focus down to 'git-branch'
    act(() => {
      stdin.write('\u001b[B'); // Down arrow
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('main');
    });
  });

  it('shows an empty preview when all items are deselected', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();
    for (let i = 0; i < 10; i++) {
      act(() => {
        stdin.write('\r'); // Toggle (deselect)
        stdin.write('\u001b[B'); // Down arrow
      });
    }

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Preview:');
      expect(output).not.toContain('~/project/path');
      expect(output).not.toContain('docker');
      expect(output).not.toContain('gemini-2.5-pro');
      expect(output).not.toContain('1.2k left');
    });
  });
});
