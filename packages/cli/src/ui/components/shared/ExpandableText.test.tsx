/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { ExpandableText, MAX_WIDTH } from './ExpandableText.js';

describe('ExpandableText', () => {
  const color = 'white';
  const flat = (s: string | undefined) => (s ?? '').replace(/\n/g, '');
  const containsLoneSurrogate = (s: string) =>
    /[\uD800-\uDFFF]/.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''));

  it('renders plain label when no match (short label)', async () => {
    const renderResult = await render(
      <ExpandableText
        label="simple command"
        userInput=""
        matchedIndex={undefined}
        textColor={color}
        isExpanded={false}
      />,
    );
    const { unmount } = renderResult;
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('truncates long label when collapsed and no match', async () => {
    const long = 'x'.repeat(MAX_WIDTH + 25);
    const renderResult = await render(
      <ExpandableText
        label={long}
        userInput=""
        textColor={color}
        isExpanded={false}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const out = lastFrame();
    const f = flat(out);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(MAX_WIDTH + 3);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('shows full long label when expanded and no match', async () => {
    const long = 'y'.repeat(MAX_WIDTH + 25);
    const renderResult = await render(
      <ExpandableText
        label={long}
        userInput=""
        textColor={color}
        isExpanded={true}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const out = lastFrame();
    const f = flat(out);
    expect(f.length).toBe(long.length);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('highlights matched substring when expanded (text only visible)', async () => {
    const label = 'run: git commit -m "feat: add search"';
    const userInput = 'commit';
    const matchedIndex = label.indexOf(userInput);
    const renderResult = await render(
      <ExpandableText
        label={label}
        userInput={userInput}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={true}
      />,
      100,
    );
    const { unmount } = renderResult;
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('creates centered window around match when collapsed', async () => {
    const prefix = 'cd_/very/long/path/that/keeps/going/'.repeat(3);
    const core = 'search-here';
    const suffix = '/and/then/some/more/components/'.repeat(3);
    const label = prefix + core + suffix;
    const matchedIndex = prefix.length;
    const renderResult = await render(
      <ExpandableText
        label={label}
        userInput={core}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={false}
      />,
      100,
    );
    const { lastFrame, unmount } = renderResult;
    const out = lastFrame();
    const f = flat(out);
    expect(f.includes(core)).toBe(true);
    expect(f.startsWith('...')).toBe(true);
    expect(f.endsWith('...')).toBe(true);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('truncates match itself when match is very long', async () => {
    const prefix = 'find ';
    const core = 'x'.repeat(MAX_WIDTH + 25);
    const suffix = ' in this text';
    const label = prefix + core + suffix;
    const matchedIndex = prefix.length;
    const renderResult = await render(
      <ExpandableText
        label={label}
        userInput={core}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={false}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const out = lastFrame();
    const f = flat(out);
    expect(f.includes('...')).toBe(true);
    expect(f.startsWith('...')).toBe(false);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(MAX_WIDTH + 2);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('respects custom maxWidth', async () => {
    const customWidth = 50;
    const long = 'z'.repeat(100);
    const renderResult = await render(
      <ExpandableText
        label={long}
        userInput=""
        textColor={color}
        isExpanded={false}
        maxWidth={customWidth}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const out = lastFrame();
    const f = flat(out);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(customWidth + 3);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('keeps an emoji intact when the truncation boundary splits a surrogate pair', async () => {
    const renderResult = await render(
      <ExpandableText
        label="aaaa😀tail"
        userInput=""
        textColor={color}
        isExpanded={false}
        maxWidth={5}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const f = flat(lastFrame());
    // The cut lands between the surrogates of the emoji, so truncation must
    // stop before the pair and keep the whole emoji.
    expect(f).toBe('aaaa😀...');
    expect(containsLoneSurrogate(f)).toBe(false);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('keeps an emoji intact when maxLines truncation hits the boundary', async () => {
    const renderResult = await render(
      <ExpandableText
        label="aaaa😀tail"
        userInput=""
        textColor={color}
        isExpanded={false}
        maxWidth={5}
        maxLines={3}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const f = flat(lastFrame());
    expect(f).toBe('aaaa😀...');
    expect(containsLoneSurrogate(f)).toBe(false);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('does not truncate a label that fits when measured in code points', async () => {
    const renderResult = await render(
      <ExpandableText
        label="😀😀😀"
        userInput=""
        textColor={color}
        isExpanded={false}
        maxWidth={3}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const f = flat(lastFrame());
    expect(f).toBe('😀😀😀');
    expect(containsLoneSurrogate(f)).toBe(false);
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });

  it('does not split surrogate pairs at match-window edges', async () => {
    const renderResult = await render(
      <ExpandableText
        label="aaaa😀😀git😀😀tail"
        userInput="git"
        matchedIndex={8}
        textColor={color}
        isExpanded={false}
        maxWidth={12}
      />,
    );
    const { lastFrame, unmount } = renderResult;
    const f = flat(lastFrame());
    expect(f.includes('git')).toBe(true);
    expect(containsLoneSurrogate(f)).toBe(false);
    // The emojis adjacent to the window survive instead of being dropped.
    expect(f).toBe('...😀git😀😀...');
    await expect(renderResult).toMatchSvgSnapshot();
    unmount();
  });
});
