/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ShellInputPrompt } from './ShellInputPrompt.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { ShellExecutionService } from '@google/gemini-cli-core';
import { useUIActions, type UIActions } from '../contexts/UIActionsContext.js';

// Mock useUIActions
vi.mock('../contexts/UIActionsContext.js', () => ({
  useUIActions: vi.fn(),
}));

// Mock useKeypress
const mockUseKeypress = vi.fn();
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: (handler: (input: unknown) => void, options?: unknown) =>
    mockUseKeypress(handler, options),
}));

// Mock ShellExecutionService
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    ShellExecutionService: {
      writeToPty: vi.fn(),
      scrollPty: vi.fn(),
    },
  };
});

describe('ShellInputPrompt', () => {
  const mockWriteToPty = vi.mocked(ShellExecutionService.writeToPty);
  const mockScrollPty = vi.mocked(ShellExecutionService.scrollPty);
  const mockHandleWarning = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUIActions).mockReturnValue({
      handleWarning: mockHandleWarning,
    } as Partial<UIActions> as UIActions);
  });

  it('renders nothing', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={true} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('sends tab to pty', async () => {
    const { waitUntilReady, unmount } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={true} />,
    );
    await waitUntilReady();

    const handler = mockUseKeypress.mock.calls[0][0];

    await act(async () => {
      handler({
        name: 'tab',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\t',
      });
    });
    await waitUntilReady();

    expect(mockWriteToPty).toHaveBeenCalledWith(1, '\t');
    unmount();
  });

  it.each([
    ['a', 'a'],
    ['b', 'b'],
  ])('handles keypress input: %s', async (name, sequence) => {
    const { waitUntilReady, unmount } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={true} />,
    );
    await waitUntilReady();

    // Get the registered handler
    const handler = mockUseKeypress.mock.calls[0][0];

    // Simulate keypress
    await act(async () => {
      handler({
        name,
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence,
      });
    });
    await waitUntilReady();

    expect(mockWriteToPty).toHaveBeenCalledWith(1, sequence);
    unmount();
  });

  it.each([
    ['up', -1],
    ['down', 1],
  ])('handles scroll %s (Command.SCROLL_%s)', async (key, direction) => {
    const { waitUntilReady, unmount } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={true} />,
    );
    await waitUntilReady();

    const handler = mockUseKeypress.mock.calls[0][0];

    await act(async () => {
      handler({ name: key, shift: true, alt: false, ctrl: false, cmd: false });
    });
    await waitUntilReady();

    expect(mockScrollPty).toHaveBeenCalledWith(1, direction);
    unmount();
  });

  it.each([
    ['pageup', -15],
    ['pagedown', 15],
  ])(
    'handles page scroll %s (Command.PAGE_%s) with default size',
    async (key, expectedScroll) => {
      const { waitUntilReady, unmount } = render(
        <ShellInputPrompt activeShellPtyId={1} focus={true} />,
      );
      await waitUntilReady();

      const handler = mockUseKeypress.mock.calls[0][0];

      await act(async () => {
        handler({
          name: key,
          shift: false,
          alt: false,
          ctrl: false,
          cmd: false,
        });
      });
      await waitUntilReady();

      expect(mockScrollPty).toHaveBeenCalledWith(1, expectedScroll);
      unmount();
    },
  );

  it('respects scrollPageSize prop', async () => {
    const { waitUntilReady, unmount } = render(
      <ShellInputPrompt
        activeShellPtyId={1}
        focus={true}
        scrollPageSize={10}
      />,
    );
    await waitUntilReady();

    const handler = mockUseKeypress.mock.calls[0][0];

    // PageDown
    await act(async () => {
      handler({
        name: 'pagedown',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
      });
    });
    await waitUntilReady();
    expect(mockScrollPty).toHaveBeenCalledWith(1, 10);

    // PageUp
    await act(async () => {
      handler({
        name: 'pageup',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
      });
    });
    await waitUntilReady();
    expect(mockScrollPty).toHaveBeenCalledWith(1, -10);
    unmount();
  });

  it('does not handle input when not focused', async () => {
    const { waitUntilReady, unmount } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={false} />,
    );
    await waitUntilReady();

    const handler = mockUseKeypress.mock.calls[0][0];

    await act(async () => {
      handler({
        name: 'a',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: 'a',
      });
    });
    await waitUntilReady();

    expect(mockWriteToPty).not.toHaveBeenCalled();
    unmount();
  });

  it('does not handle input when no active shell', async () => {
    const { waitUntilReady, unmount } = render(
      <ShellInputPrompt activeShellPtyId={null} focus={true} />,
    );
    await waitUntilReady();

    const handler = mockUseKeypress.mock.calls[0][0];

    await act(async () => {
      handler({
        name: 'a',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: 'a',
      });
    });
    await waitUntilReady();

    expect(mockWriteToPty).not.toHaveBeenCalled();
    unmount();
  });

  it('ignores Command.UNFOCUS_SHELL (Shift+Tab) to allow focus navigation', async () => {
    const { waitUntilReady, unmount } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={true} />,
    );
    await waitUntilReady();

    const handler = mockUseKeypress.mock.calls[0][0];

    let result: boolean | undefined;
    await act(async () => {
      result = handler({
        name: 'tab',
        shift: true,
        alt: false,
        ctrl: false,
        cmd: false,
      });
    });
    await waitUntilReady();

    expect(result).toBe(false);
    expect(mockWriteToPty).not.toHaveBeenCalled();
    unmount();
  });
});
