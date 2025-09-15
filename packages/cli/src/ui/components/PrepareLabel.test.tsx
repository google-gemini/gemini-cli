/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { PrepareLabel, MAX_WIDTH } from './PrepareLabel.js';

describe('PrepareLabel', () => {
  const color = 'white';
  const flat = (s: string | undefined) => (s ?? '').replace(/\n/g, '');

  it('renders plain label when no match (short label)', () => {
    const { lastFrame } = render(
      <PrepareLabel
        label="simple command"
        userInput=""
        matchedIndex={undefined}
        textColor={color}
        isExpanded={false}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('truncates long label when collapsed and no match', () => {
    const long = 'x'.repeat(MAX_WIDTH + 25);
    const { lastFrame } = render(
      <PrepareLabel
        label={long}
        userInput=""
        textColor={color}
        isExpanded={false}
      />,
    );
    const out = lastFrame();
    const f = flat(out);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(MAX_WIDTH + 3);
    expect(out).toMatchSnapshot();
  });

  it('shows full long label when expanded and no match', () => {
    const long = 'y'.repeat(MAX_WIDTH + 25);
    const { lastFrame } = render(
      <PrepareLabel
        label={long}
        userInput=""
        textColor={color}
        isExpanded={true}
      />,
    );
    const out = lastFrame();
    const f = flat(out);
    expect(f.length).toBe(long.length);
    expect(out).toMatchSnapshot();
  });

  it('highlights matched substring when expanded (text only visible)', () => {
    const label = 'run: git commit -m "feat: add search"';
    const userInput = 'commit';
    const matchedIndex = label.indexOf(userInput);
    const { lastFrame } = render(
      <PrepareLabel
        label={label}
        userInput={userInput}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('creates centered window around match when collapsed', () => {
    const prefix = 'cd /very/long/path/that/keeps/going/'.repeat(3);
    const core = 'search-here';
    const suffix = '/and/then/some/more/components/'.repeat(3);
    const label = prefix + core + suffix;
    const matchedIndex = prefix.length;
    const { lastFrame } = render(
      <PrepareLabel
        label={label}
        userInput={core}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={false}
      />,
    );
    const out = lastFrame();
    const f = flat(out);
    expect(f.includes(core)).toBe(true);
    expect(f.startsWith('...')).toBe(true);
    expect(f.endsWith('...')).toBe(true);
    expect(out).toMatchSnapshot();
  });

  it('truncates match itself when match is very long', () => {
    const prefix = 'find ';
    const core = 'x'.repeat(MAX_WIDTH + 25);
    const suffix = ' in this text';
    const label = prefix + core + suffix;
    const matchedIndex = prefix.length;
    const { lastFrame } = render(
      <PrepareLabel
        label={label}
        userInput={core}
        matchedIndex={matchedIndex}
        textColor={color}
        isExpanded={false}
      />,
    );
    const out = lastFrame();
    const f = flat(out);
    expect(f.includes('...')).toBe(true);
    expect(f.startsWith('...')).toBe(false);
    expect(f.endsWith('...')).toBe(true);
    expect(f.length).toBe(MAX_WIDTH + 2);
    expect(out).toMatchSnapshot();
  });
});
