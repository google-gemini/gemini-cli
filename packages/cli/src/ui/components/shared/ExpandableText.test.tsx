/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from 'chalk';
import { describe, it, expect } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { ExpandableText, MAX_WIDTH } from './ExpandableText.js';

describe('ExpandableText', () => {
  const color = 'white';
  const flat = (s: string | undefined) => (s ?? '').replace(/\n/g, '');

  it('renders plain label when no match (short label)', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ExpandableText
        label="simple command"
        userInput=""
        matchedIndex={undefined}
        textColor={color}
        isExpanded={false}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('truncates long label when collapsed and no match', async () => {
    const long = 'x'.repeat(MAX_WIDTH + 25);
    const { lastFrame, waitUntilReady, unmount } = render(
      <ExpandableText
        label={long}
        userInput=""
        textColor={color}
        isExpanded={false}
      />,
    );
    await waitUntilReady();
    const out = lastFrame();
    const f = flat(out);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(MAX_WIDTH + 3);
    expect(out).toMatchSnapshot();
    unmount();
  });

  it('shows full long label when expanded and no match', async () => {
    const long = 'y'.repeat(MAX_WIDTH + 25);
    const { lastFrame, waitUntilReady, unmount } = render(
      <ExpandableText
        label={long}
        userInput=""
        textColor={color}
        isExpanded={true}
      />,
    );
    await waitUntilReady();
    const out = lastFrame();
    const f = flat(out);
    expect(f.length).toBe(long.length);
    expect(out).toMatchSnapshot();
    unmount();
  });

  it('highlights matched substring when expanded (text only visible)', async () => {
    const label = 'run: git commit -m "feat: add search"';
    const userInput = 'commit';
    const matchedIndex = label.indexOf(userInput);
    const { lastFrame, waitUntilReady, unmount } = render(
      <ExpandableText
        label={label}
        userInput={userInput}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={true}
      />,
      100,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).toContain(chalk.inverse(userInput));
    unmount();
  });

  it('creates centered window around match when collapsed', async () => {
    const prefix = 'cd_/very/long/path/that/keeps/going/'.repeat(3);
    const core = 'search-here';
    const suffix = '/and/then/some/more/components/'.repeat(3);
    const label = prefix + core + suffix;
    const matchedIndex = prefix.length;
    const { lastFrame, waitUntilReady, unmount } = render(
      <ExpandableText
        label={label}
        userInput={core}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={false}
      />,
      100,
    );
    await waitUntilReady();
    const out = lastFrame();
    const f = flat(out);
    expect(f.includes(core)).toBe(true);
    expect(f.startsWith('...')).toBe(true);
    expect(f.endsWith('...')).toBe(true);
    expect(out).toMatchSnapshot();
    unmount();
  });

  it('truncates match itself when match is very long', async () => {
    const prefix = 'find ';
    const core = 'x'.repeat(MAX_WIDTH + 25);
    const suffix = ' in this text';
    const label = prefix + core + suffix;
    const matchedIndex = prefix.length;
    const { lastFrame, waitUntilReady, unmount } = render(
      <ExpandableText
        label={label}
        userInput={core}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={false}
      />,
    );
    await waitUntilReady();
    const out = lastFrame();
    const f = flat(out);
    expect(f.includes('...')).toBe(true);
    expect(f.startsWith('...')).toBe(false);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(MAX_WIDTH + 2);
    expect(out).toMatchSnapshot();
    unmount();
  });

  it('respects custom maxWidth', async () => {
    const customWidth = 50;
    const long = 'z'.repeat(100);
    const { lastFrame, waitUntilReady, unmount } = render(
      <ExpandableText
        label={long}
        userInput=""
        textColor={color}
        isExpanded={false}
        maxWidth={customWidth}
      />,
    );
    await waitUntilReady();
    const out = lastFrame();
    const f = flat(out);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(customWidth + 3);
    expect(out).toMatchSnapshot();
    unmount();
  });
});
