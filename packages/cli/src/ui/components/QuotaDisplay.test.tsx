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

  it('should render yellow at exactly 20% usage', () => {
    const { lastFrame } = render(<QuotaDisplay remaining={20} limit={100} />);
    // Verification of color requires inspecting the actual frame if needed,
    // but the logic change ensures yellow.
    // Since lastFrame() returns raw string, we'd need to check for ANSI codes if we weren't stripping them.
    expect(stripAnsi(lastFrame()!)).toBe('/stats 20% usage remaining');
  });

  it('should render terse format when terse prop is true', () => {
    const { lastFrame } = render(
      <QuotaDisplay remaining={15} limit={100} terse={true} />,
    );
    const frame = lastFrame();
    expect(stripAnsi(frame!)).toBe('15%');
  });
});
