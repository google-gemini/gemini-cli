/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HookStatusDisplay } from './HookStatusDisplay.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('<HookStatusDisplay />', () => {
  it('should render a single executing hook', async () => {
    const props = {
      activeHooks: [{ name: 'test-hook', eventName: 'BeforeAgent' }],
    };
    const { lastFrame, waitUntilReady, unmount } = render(
      <HookStatusDisplay {...props} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render multiple executing hooks', async () => {
    const props = {
      activeHooks: [
        { name: 'h1', eventName: 'BeforeAgent' },
        { name: 'h2', eventName: 'BeforeAgent' },
      ],
    };
    const { lastFrame, waitUntilReady, unmount } = render(
      <HookStatusDisplay {...props} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render sequential hook progress', async () => {
    const props = {
      activeHooks: [
        { name: 'step', eventName: 'BeforeAgent', index: 1, total: 3 },
      ],
    };
    const { lastFrame, waitUntilReady, unmount } = render(
      <HookStatusDisplay {...props} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should return empty string if no active hooks', async () => {
    const props = { activeHooks: [] };
    const { lastFrame, waitUntilReady, unmount } = render(
      <HookStatusDisplay {...props} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });
});
