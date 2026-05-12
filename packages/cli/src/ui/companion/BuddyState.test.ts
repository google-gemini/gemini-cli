/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getBuddyState,
  resetBuddyState,
  setBuddyStatus,
  setBuddyVisible,
  toggleBuddy,
} from './BuddyState.js';

describe('BuddyState', () => {
  beforeEach(() => {
    resetBuddyState();
  });

  it('starts hidden with a steady message', () => {
    expect(getBuddyState()).toEqual({
      visible: false,
      mood: 'steady',
      message: 'Standing by.',
    });
  });

  it('toggles Pollux visibility', () => {
    expect(toggleBuddy()).toBe(true);
    expect(getBuddyState().visible).toBe(true);
    expect(toggleBuddy()).toBe(false);
    expect(getBuddyState().visible).toBe(false);
  });

  it('updates mood and message', () => {
    setBuddyVisible(true);
    setBuddyStatus('protective', 'Skipped a broad command.');

    expect(getBuddyState()).toMatchObject({
      visible: true,
      mood: 'protective',
      message: 'Skipped a broad command.',
    });
  });
});
