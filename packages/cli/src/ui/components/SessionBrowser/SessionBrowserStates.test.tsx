/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { SessionBrowserLoading } from './SessionBrowserLoading.js';
import { SessionBrowserError } from './SessionBrowserError.js';
import { SessionBrowserEmpty } from './SessionBrowserEmpty.js';
import type { SessionBrowserState } from '../SessionBrowser.js';

describe('SessionBrowser UI States', () => {
  it('SessionBrowserLoading renders correctly', async () => {
    const { lastFrame } = await render(<SessionBrowserLoading />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('SessionBrowserError renders correctly', async () => {
    const mockState = { error: 'Test error message' } as SessionBrowserState;
    const { lastFrame } = await render(
      <SessionBrowserError state={mockState} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('SessionBrowserEmpty renders correctly', async () => {
    const { lastFrame } = await render(<SessionBrowserEmpty />);
    expect(lastFrame()).toMatchSnapshot();
  });
});
