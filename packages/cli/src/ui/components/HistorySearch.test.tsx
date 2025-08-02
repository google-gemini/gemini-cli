/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { HistorySearch } from './HistorySearch.js';
import { HistoryItem, MessageType } from '../types.js';
import { describe, it, expect, vi } from 'vitest';

const history: HistoryItem[] = [
  { id: 1, type: MessageType.USER, text: 'first command' },
  { id: 2, type: MessageType.MODEL, text: 'first response' },
  { id: 3, type: MessageType.USER, text: 'second command' },
  { id: 4, type: MessageType.USER, text: 'third command' },
];

describe('<HistorySearch />', () => {
  it('renders correctly', () => {
    const { lastFrame } = render(
      <HistorySearch history={[]} onSelect={() => {}} onExit={() => {}} />,
    );
    expect(lastFrame()).toContain('(reverse-i-search)');
  });

  it('filters history based on search term', async () => {
    const { lastFrame, stdin } = render(
      <HistorySearch history={history} onSelect={() => {}} onExit={() => {}} />,
    );

    stdin.write('c');
    stdin.write('o');
    stdin.write('m');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const output = lastFrame();
    expect(output).toContain('third command');
    expect(output).toContain('second command');
    expect(output).toContain('first command');
  });

  it('calls onSelect when a command is selected', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <HistorySearch history={history} onSelect={onSelect} onExit={() => {}} />,
    );

    stdin.write('first');
    await new Promise((resolve) => setTimeout(resolve, 100));
    stdin.write('\r'); // Enter key

    expect(onSelect).toHaveBeenCalledWith('first command');
  });

  it('calls onExit on escape', () => {
    const onExit = vi.fn();
    const { stdin } = render(
      <HistorySearch history={history} onSelect={() => {}} onExit={onExit} />,
    );

    stdin.write('\u001B'); // Escape key
    expect(onExit).toHaveBeenCalled();
  });
});
