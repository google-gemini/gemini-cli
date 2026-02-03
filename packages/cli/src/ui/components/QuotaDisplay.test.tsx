/**
 * @license
 * Copyright 2025 Google LLC
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
});
