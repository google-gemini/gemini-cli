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
import { ALL_ITEMS } from '../../config/footerItems.js';
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
    const renderResult = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    expect(renderResult.lastFrame()).toMatchSnapshot();
    await expect(renderResult).toMatchSvgSnapshot();
  });

  it('toggles an item when enter is pressed', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

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
    const { lastFrame, stdin } = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    // Initial order: workspace, git-branch, ...
    const output = lastFrame();
    const cwdIdx = output.indexOf('] workspace');
    const branchIdx = output.indexOf('] git-branch');
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
      const branchIdxAfter = outputAfter.indexOf('] git-branch');
      expect(cwdIdxAfter).toBeGreaterThan(-1);
      expect(branchIdxAfter).toBeGreaterThan(-1);
      expect(branchIdxAfter).toBeLessThan(cwdIdxAfter);
    });
  });

  it('closes on Esc', async () => {
    const settings = createMockSettings();
    const { stdin } = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    act(() => {
      stdin.write('\x1b'); // Esc
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('highlights the active item in the preview', async () => {
    const settings = createMockSettings();
    const renderResult = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    const { lastFrame, stdin } = renderResult;

    expect(lastFrame()).toContain('~/project/path');

    // Move focus down to 'code-changes' (which has colored elements)
    for (let i = 0; i < 9; i++) {
      act(() => {
        stdin.write('\u001b[B'); // Down arrow
      });
    }

    await waitFor(() => {
      // The selected indicator should be next to 'code-changes'
      expect(lastFrame()).toMatch(/> \[ \] code-changes/);
    });

    // Toggle it on
    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      // It should now be checked and appear in the preview
      expect(lastFrame()).toMatch(/> \[✓\] code-changes/);
      expect(lastFrame()).toContain('+12 -4');
    });

    await expect(renderResult).toMatchSvgSnapshot();
  });

  it('shows an empty preview when all items are deselected', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

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

  it('moves item correctly after trying to move up at the top', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    // Default initial items in mock settings are 'git-branch', 'workspace', ...
    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('] git-branch');
      expect(output).toContain('] workspace');
    });

    const output = lastFrame();
    const branchIdx = output.indexOf('] git-branch');
    const workspaceIdx = output.indexOf('] workspace');
    expect(workspaceIdx).toBeLessThan(branchIdx);

    // Try to move workspace up (left arrow) while it's at the top
    act(() => {
      stdin.write('\u001b[D'); // Left arrow
    });

    // Move workspace down (right arrow)
    act(() => {
      stdin.write('\u001b[C'); // Right arrow
    });

    await waitFor(() => {
      const outputAfter = lastFrame();
      const bIdxAfter = outputAfter.indexOf('] git-branch');
      const wIdxAfter = outputAfter.indexOf('] workspace');
      // workspace should now be after git-branch
      expect(bIdxAfter).toBeLessThan(wIdxAfter);
    });
  });

  it('updates the preview when Show footer labels is toggled off', async () => {
    const settings = createMockSettings();
    const renderResult = await renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    const { lastFrame, stdin } = renderResult;

    // By default labels are on
    expect(lastFrame()).toContain('workspace (/directory)');
    expect(lastFrame()).toContain('sandbox');
    expect(lastFrame()).toContain('/model');

    // Move to "Show footer labels" (which is the second to last item)
    for (let i = 0; i < ALL_ITEMS.length; i++) {
      act(() => {
        stdin.write('\u001b[B'); // Down arrow
      });
    }

    await waitFor(() => {
      expect(lastFrame()).toMatch(/> \[✓\] Show footer labels/);
    });

    // Toggle it off
    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(lastFrame()).toMatch(/> \[ \] Show footer labels/);
      // The headers should no longer be in the preview
      expect(lastFrame()).not.toContain('workspace (/directory)');
      expect(lastFrame()).not.toContain('/model');

      // We can't strictly search for "sandbox" because the menu item also says "sandbox".
      // Let's assert that the spacer dots are now present in the preview instead.
      const previewLine =
        lastFrame()
          .split('\n')
          .find((line) => line.includes('Preview:')) || '';
      const nextLine =
        lastFrame().split('\n')[
          lastFrame().split('\n').indexOf(previewLine) + 1
        ] || '';
      expect(nextLine).toContain('·');
      expect(nextLine).toContain('~/project/path');
      expect(nextLine).toContain('docker');
      expect(nextLine).toContain('42% used');
    });

    await expect(renderResult).toMatchSvgSnapshot();
  });
});
