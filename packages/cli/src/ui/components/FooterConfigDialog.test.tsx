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
    const renderResult = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await renderResult.waitUntilReady();
    expect(renderResult.lastFrame()).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
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
      expect(lastFrame()).toContain('[ ] workspace');
    });

    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('[✓] workspace');
    });
  });

  it('reorders items with arrow keys', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();
    // Initial order: workspace, branch, ...
    const output = lastFrame();
    const cwdIdx = output.indexOf('] workspace');
    const branchIdx = output.indexOf('] branch');
    expect(cwdIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeGreaterThan(-1);
    expect(cwdIdx).toBeLessThan(branchIdx);

    // Move workspace down (right arrow)
    act(() => {
      stdin.write('\u001b[C'); // Right arrow
    });

    await waitFor(() => {
      const outputAfter = lastFrame();
      const cwdIdxAfter = outputAfter.indexOf('] workspace');
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
    const renderResult = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    const { lastFrame, stdin, waitUntilReady } = renderResult;

    await waitUntilReady();
    expect(lastFrame()).toContain('~/project/path');

    // Move focus down to 'diff' (which has key 'code-changes' and colored elements)
    for (let i = 0; i < 8; i++) {
      act(() => {
        stdin.write('\u001b[B'); // Down arrow
      });
    }

    await waitFor(() => {
      // The selected indicator should be next to 'diff'
      expect(lastFrame()).toMatch(/> \[ \] diff/);
    });

    // Toggle it on
    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      // It should now be checked and appear in the preview
      expect(lastFrame()).toMatch(/> \[✓\] diff/);
      expect(lastFrame()).toContain('+12 -4');
    });

    await expect(renderResult).toMatchSvgSnapshot();
  });

  it('shows an empty preview when all items are deselected', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin, waitUntilReady } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await waitUntilReady();

    // Default items are the first 5. We toggle them off.
    for (let i = 0; i < 5; i++) {
      act(() => {
        stdin.write('\r'); // Toggle off
      });
      act(() => {
        stdin.write('\u001b[B'); // Down arrow
      });
    }

    await waitFor(
      () => {
        const output = lastFrame();
        expect(output).toContain('Preview:');
        expect(output).not.toContain('~/project/path');
        expect(output).not.toContain('docker');
      },
      { timeout: 2000 },
    );
  });
});
