/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('renders correctly with default settings', () => {
    const settings = createMockSettings();
    const { lastFrame } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('Configure Footer');
    expect(output).toContain('[✓] cwd');
    expect(output).toContain('[ ] session-id');
  });

  it('toggles an item when enter is pressed', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    // Initial state: cwd is checked by default and highlighted

    act(() => {
      stdin.write('\r'); // Enter to toggle
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('[ ] cwd');
    });

    // Toggle it back
    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('[✓] cwd');
    });
  });

  it('filters items when typing in search', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    await act(async () => {
      stdin.write('session');
      // Give search a moment to trigger and re-render
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output).toContain('session-id');
      expect(output).not.toContain('model-name');
    });
  });

  it('reorders items with arrow keys', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    // Initial order: cwd, git-branch, ...
    const output = lastFrame();
    expect(output).toBeDefined();
    const cwdIdx = output!.indexOf('cwd');
    const branchIdx = output!.indexOf('git-branch');
    expect(cwdIdx).toBeLessThan(branchIdx);

    // Move cwd down (right arrow)
    act(() => {
      stdin.write('\u001b[C'); // Right arrow
    });

    await waitFor(() => {
      const outputAfter = lastFrame();
      expect(outputAfter).toBeDefined();
      const cwdIdxAfter = outputAfter!.indexOf('cwd');
      const branchIdxAfter = outputAfter!.indexOf('git-branch');
      expect(branchIdxAfter).toBeLessThan(cwdIdxAfter);
    });
  });

  it('closes on Esc', async () => {
    const settings = createMockSettings();
    const { stdin } = renderWithProviders(
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
    const { lastFrame, stdin } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    // Initial state: 'cwd' is active.
    // Verify 'cwd' content exists in the preview area
    expect(lastFrame()).toContain('~/project/path');

    // Move focus down to 'git-branch'
    act(() => {
      stdin.write('\u001b[B'); // Down arrow
    });

    await waitFor(() => {
      const output = lastFrame();
      // Verify 'git-branch' content exists in the preview area
      expect(output).toContain('main*');
    });
  });

  it('shows an empty preview when all items are deselected', async () => {
    const settings = createMockSettings();
    const { lastFrame, stdin } = renderWithProviders(
      <FooterConfigDialog onClose={mockOnClose} />,
      { settings },
    );

    // Deselect all items (assuming we know which ones are selected by default)
    // By default: cwd, git-branch, sandbox-status, model-name, quota are selected.
    // They are at indices 0, 1, 2, 3, 4.
    for (let i = 0; i < 5; i++) {
      act(() => {
        stdin.write('\r'); // Toggle (deselect)
        stdin.write('\u001b[B'); // Down arrow
      });
    }

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output).toContain('Preview:');
      // The preview area should not contain any of the mock values
      expect(output).not.toContain('~/project/path');
      expect(output).not.toContain('main*');
      expect(output).not.toContain('docker');
      expect(output).not.toContain('gemini-2.5-pro');
      expect(output).not.toContain('1.2k left');
    });
  });
});
