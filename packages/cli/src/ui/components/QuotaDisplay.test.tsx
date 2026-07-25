/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuotaDisplay } from './QuotaDisplay.js';

describe('QuotaDisplay', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T20:29:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it('should not render when remaining is undefined', async () => {
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={undefined} limit={100} />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should not render when limit is undefined', async () => {
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={100} limit={undefined} />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should not render when limit is 0', async () => {
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={100} limit={0} />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should not render when usage < 80%', async () => {
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={85} limit={100} />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should render warning when used >= 80%', async () => {
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={15} limit={100} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render critical when used >= 95%', async () => {
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={4} limit={100} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render with reset time when provided', async () => {
    const resetTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={15} limit={100} resetTime={resetTime} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should NOT render reset time when terse is true', async () => {
    const resetTime = new Date(Date.now() + 3600000).toISOString();
    const { lastFrame, unmount } = await render(
      <QuotaDisplay
        remaining={15}
        limit={100}
        resetTime={resetTime}
        terse={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render terse limit reached message', async () => {
    const { lastFrame, unmount } = await render(
      <QuotaDisplay remaining={0} limit={100} terse={true} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
