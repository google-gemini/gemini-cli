/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getBuddyState, resetBuddyState } from './BuddyState.js';
import { applyBuddyReaction } from './useBuddyReactions.js';

describe('applyBuddyReaction', () => {
  beforeEach(() => {
    resetBuddyState();
  });

  it('reacts to suppressed commands', () => {
    applyBuddyReaction({ type: 'command_suppressed', command: 'npm test' });

    expect(getBuddyState()).toMatchObject({
      mood: 'protective',
      message: 'Skipped npm test. Still on mission.',
    });
  });

  it('reacts to denied commands', () => {
    applyBuddyReaction({ type: 'command_denied', command: 'git push' });

    expect(getBuddyState()).toMatchObject({
      mood: 'blocked',
      message: 'Blocked git push. Nope rope cut.',
    });
  });

  it('reacts to dev-loop auto-build', () => {
    applyBuddyReaction({ type: 'dev_loop_auto_build' });

    expect(getBuddyState()).toMatchObject({
      mood: 'busy',
      message: 'Dev build is catching up. Coffee-sized pause.',
    });
  });
});
