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
  it('should render a single executing hook', () => {
    const props = {
      activeHooks: [{ name: 'test-hook', eventName: 'BeforeAgent' }],
    };
    const { lastFrame, unmount } = render(<HookStatusDisplay {...props} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render multiple executing hooks', () => {
    const props = {
      activeHooks: [
        { name: 'h1', eventName: 'BeforeAgent' },
        { name: 'h2', eventName: 'BeforeAgent' },
      ],
    };
    const { lastFrame, unmount } = render(<HookStatusDisplay {...props} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render sequential hook progress', () => {
    const props = {
      activeHooks: [
        { name: 'step', eventName: 'BeforeAgent', index: 1, total: 3 },
      ],
    };
    const { lastFrame, unmount } = render(<HookStatusDisplay {...props} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should return empty string if no active hooks', () => {
    const props = { activeHooks: [] };
    const { lastFrame, unmount } = render(<HookStatusDisplay {...props} />);
    expect(lastFrame()).toBe('');
    unmount();
  });
});
