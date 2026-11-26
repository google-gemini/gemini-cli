/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { ConsentPrompt } from './ConsentPrompt.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';

vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(() => null),
}));

vi.mock('../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: vi.fn(() => null),
}));

const MockedRadioButtonSelect = vi.mocked(RadioButtonSelect);
const MockedMarkdownDisplay = vi.mocked(MarkdownDisplay);

describe('ConsentPrompt', () => {
  const onConfirm = vi.fn();
  const terminalWidth = 80;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a string prompt with MarkdownDisplay', async () => {
    const prompt = 'Are you sure?';
    const { unmount } = await render(
      <ConsentPrompt
        prompt={prompt}
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    expect(MockedMarkdownDisplay).toHaveBeenCalledWith(
      {
        isPending: true,
        text: prompt,
        terminalWidth,
      },
      undefined,
    );
    unmount();
  });

  it('renders a ReactNode prompt directly', async () => {
    const prompt = <Text>Are you sure?</Text>;
    const { lastFrame, unmount } = await render(
      <ConsentPrompt
        prompt={prompt}
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    expect(MockedMarkdownDisplay).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('Are you sure?');
    unmount();
  });

  it('calls onConfirm with true when "Yes" is selected', async () => {
    const prompt = 'Are you sure?';
    const { waitUntilReady, unmount } = await render(
      <ConsentPrompt
        prompt={prompt}
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    const onSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    await act(async () => {
      onSelect(true);
    });
    await waitUntilReady();

    expect(onConfirm).toHaveBeenCalledWith(true);
    unmount();
  });

  it('calls onConfirm with false when "No" is selected', async () => {
    const prompt = 'Are you sure?';
    const { waitUntilReady, unmount } = await render(
      <ConsentPrompt
        prompt={prompt}
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    const onSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    await act(async () => {
      onSelect(false);
    });
    await waitUntilReady();

    expect(onConfirm).toHaveBeenCalledWith(false);
    unmount();
  });

  it('passes correct items to RadioButtonSelect', async () => {
    const prompt = 'Are you sure?';
    const { unmount } = await render(
      <ConsentPrompt
        prompt={prompt}
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    expect(MockedRadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { label: 'Yes', value: true, key: 'Yes' },
          { label: 'No', value: false, key: 'No' },
        ],
      }),
      undefined,
    );
    unmount();
  });

  it('selects "Yes" first by default', async () => {
    const { unmount } = await render(
      <ConsentPrompt
        prompt="Are you sure?"
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    expect(MockedRadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({ initialIndex: 0 }),
      undefined,
    );
    unmount();
  });

  it('selects "No" first when defaultToNo is set, so Enter declines', async () => {
    const { waitUntilReady, unmount } = await render(
      <ConsentPrompt
        prompt="Install this extension?"
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
        defaultToNo
      />,
    );

    const { items, initialIndex, onSelect } =
      MockedRadioButtonSelect.mock.calls[0][0];
    expect(initialIndex).toBe(1);
    // Enter selects the highlighted item.
    await act(async () => {
      onSelect(items[initialIndex ?? 0].value);
    });
    await waitUntilReady();

    expect(onConfirm).toHaveBeenCalledWith(false);
    unmount();
  });
});
