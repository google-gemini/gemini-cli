/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '../../../test-utils/render.js';
import { resetBuddyState, setBuddyStatus, setBuddyVisible } from '../BuddyState.js';
import { BuddyPanel } from './BuddyPanel.js';

describe('BuddyPanel', () => {
  beforeEach(() => {
    resetBuddyState();
  });

  it('renders nothing while Pollux is hidden', async () => {
    const { lastFrame, unmount } = await render(<BuddyPanel />);

    expect(lastFrame({ allowEmpty: true })).not.toContain('Pollux');
    unmount();
  });

  it('renders Pollux mood and message when visible', async () => {
    setBuddyVisible(true);
    setBuddyStatus('blocked', 'Blocked git push.');

    const { lastFrame, unmount } = await render(<BuddyPanel />);

    expect(lastFrame()).toContain('Pollux');
    expect(lastFrame()).toContain('blocked');
    expect(lastFrame()).toContain('Blocked git push.');
    unmount();
  });
});
