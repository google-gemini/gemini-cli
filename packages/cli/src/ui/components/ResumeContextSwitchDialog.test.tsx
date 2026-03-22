/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { Text } from 'ink';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { ResumeContextSwitchDialog } from './ResumeContextSwitchDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';

vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(() => null),
}));

vi.mock('../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: vi.fn(() => null),
}));

const mockedExit = vi.hoisted(() => vi.fn());

vi.mock('node:process', async () => {
  const actual =
    await vi.importActual<typeof import('node:process')>('node:process');
  return {
    ...actual,
    exit: mockedExit,
  };
});

const MockedRadioButtonSelect = vi.mocked(RadioButtonSelect);
const MockedMarkdownDisplay = vi.mocked(MarkdownDisplay);

describe('ResumeContextSwitchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders a string prompt with MarkdownDisplay', async () => {
    const { waitUntilReady, unmount } = renderWithProviders(
      <ResumeContextSwitchDialog
        prompt="Resume here?"
        terminalWidth={80}
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    await waitUntilReady();

    expect(MockedMarkdownDisplay).toHaveBeenCalledWith(
      {
        isPending: true,
        text: 'Resume here?',
        terminalWidth: 80,
      },
      undefined,
    );
    unmount();
  });

  it('calls onConfirm when yes is selected', async () => {
    const onConfirm = vi.fn();
    const onDecline = vi.fn();
    const { waitUntilReady, unmount } = renderWithProviders(
      <ResumeContextSwitchDialog
        prompt="Resume here?"
        terminalWidth={80}
        onConfirm={onConfirm}
        onDecline={onDecline}
      />,
    );
    await waitUntilReady();

    const onSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    await act(async () => {
      onSelect(true);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
    expect(mockedExit).not.toHaveBeenCalled();
    unmount();
  });

  it('shows an exit message and exits after no is selected in startup mode', async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const onDecline = vi.fn();
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ResumeContextSwitchDialog
        prompt="Resume here?"
        terminalWidth={80}
        onConfirm={onConfirm}
        onDecline={onDecline}
        exitOnDecline={true}
        declineExitMessage="Session resume was canceled. Exiting so you can switch to the original folder and rerun the resume command."
        exitCode={0}
      />,
    );
    await waitUntilReady();

    const onSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    await act(async () => {
      onSelect(false);
    });

    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(lastFrame()).toContain('Session resume was canceled.');
      expect(lastFrame()).toContain('original folder and rerun the resume');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockedExit).toHaveBeenCalledWith(0);
    unmount();
    vi.useRealTimers();
  });

  it('does not exit for browser decline', async () => {
    const onConfirm = vi.fn();
    const onDecline = vi.fn();
    const { waitUntilReady, unmount } = renderWithProviders(
      <ResumeContextSwitchDialog
        prompt={<Text>Resume here?</Text>}
        terminalWidth={80}
        onConfirm={onConfirm}
        onDecline={onDecline}
        exitOnDecline={false}
      />,
    );
    await waitUntilReady();

    const onSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    await act(async () => {
      onSelect(false);
    });

    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(mockedExit).not.toHaveBeenCalled();
    unmount();
  });

  it('treats escape as decline', async () => {
    const onDecline = vi.fn();
    const { stdin, waitUntilReady, unmount } = renderWithProviders(
      <ResumeContextSwitchDialog
        prompt="Resume here?"
        terminalWidth={80}
        onConfirm={vi.fn()}
        onDecline={onDecline}
      />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\u001b[27u');
    });
    await act(async () => {
      await waitUntilReady();
    });

    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(mockedExit).not.toHaveBeenCalled();
    unmount();
  });
});
