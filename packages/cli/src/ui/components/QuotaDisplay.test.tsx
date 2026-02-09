/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { QuotaDisplay } from './QuotaDisplay.js';
import stripAnsi from 'strip-ansi';

describe('QuotaDisplay', () => {
  it('should not render when remaining is undefined', () => {
    const { lastFrame } = render(
      <QuotaDisplay remaining={undefined} limit={100} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should not render when limit is undefined', () => {
    const { lastFrame } = render(
      <QuotaDisplay remaining={100} limit={undefined} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should not render when limit is 0', () => {
    const { lastFrame } = render(<QuotaDisplay remaining={100} limit={0} />);
    expect(lastFrame()).toBe('');
  });

  it('should not render when usage > 20%', () => {
    const { lastFrame } = render(<QuotaDisplay remaining={85} limit={100} />);
    expect(lastFrame()).toBe('');
  });

  it('should render yellow when usage < 20%', () => {
    const { lastFrame } = render(<QuotaDisplay remaining={15} limit={100} />);
    const frame = lastFrame();
    expect(stripAnsi(frame!)).toBe('/stats 15% usage remaining');
  });

  it('should render red when usage < 5%', () => {
    const { lastFrame } = render(<QuotaDisplay remaining={4} limit={100} />);
    const frame = lastFrame();
    expect(stripAnsi(frame!)).toBe('/stats 4% usage remaining');
  });

  it('should render with reset time when provided', () => {
    const resetTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const { lastFrame } = render(
      <QuotaDisplay remaining={15} limit={100} resetTime={resetTime} />,
    );
    const frame = lastFrame();
    expect(stripAnsi(frame!)).toMatch(/\/stats 15% usage remaining, resets in/);
  });

  it('should NOT render reset time when terse is true', () => {
    const resetTime = new Date(Date.now() + 3600000).toISOString();
    const { lastFrame } = render(
      <QuotaDisplay
        remaining={15}
        limit={100}
        resetTime={resetTime}
        terse={true}
      />,
    );
    const frame = lastFrame();
    expect(stripAnsi(frame!)).toBe('15%');
  });

  it('should render terse limit reached message', () => {
    const { lastFrame } = render(
      <QuotaDisplay remaining={0} limit={100} terse={true} />,
    );
    const frame = lastFrame();
    expect(stripAnsi(frame!)).toBe('Limit reached');
  });
});
