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

  it('renders a string prompt with MarkdownDisplay', () => {
    const prompt = 'Are you sure?';
    const { unmount } = render(
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

  it('renders a ReactNode prompt directly', () => {
    const prompt = <Text>Are you sure?</Text>;
    const { lastFrame, unmount } = render(
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

  it('calls onConfirm with true when "Yes" is selected', () => {
    const prompt = 'Are you sure?';
    const { unmount } = render(
      <ConsentPrompt
        prompt={prompt}
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    const onSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    act(() => {
      onSelect(true);
    });

    expect(onConfirm).toHaveBeenCalledWith(true);
    unmount();
  });

  it('calls onConfirm with false when "No" is selected', () => {
    const prompt = 'Are you sure?';
    const { unmount } = render(
      <ConsentPrompt
        prompt={prompt}
        onConfirm={onConfirm}
        terminalWidth={terminalWidth}
      />,
    );

    const onSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    act(() => {
      onSelect(false);
    });

    expect(onConfirm).toHaveBeenCalledWith(false);
    unmount();
  });

  it('passes correct items to RadioButtonSelect', () => {
    const prompt = 'Are you sure?';
    const { unmount } = render(
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
});
