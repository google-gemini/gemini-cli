/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { QuotaDisplay } from './QuotaDisplay.js';

describe('QuotaDisplay', () => {
  it('should not render when remaining is undefined', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={undefined} limit={100} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should not render when limit is undefined', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={100} limit={undefined} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should not render when limit is 0', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={100} limit={0} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should not render when usage > 20%', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={85} limit={100} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should render yellow when usage < 20%', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={15} limit={100} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render red when usage < 5%', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={4} limit={100} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render with reset time when provided', async () => {
    const resetTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={15} limit={100} resetTime={resetTime} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should NOT render reset time when terse is true', async () => {
    const resetTime = new Date(Date.now() + 3600000).toISOString();
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay
        remaining={15}
        limit={100}
        resetTime={resetTime}
        terse={true}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render terse limit reached message', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QuotaDisplay remaining={0} limit={100} terse={true} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
