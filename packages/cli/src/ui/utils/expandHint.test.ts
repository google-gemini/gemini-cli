/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldAutoTriggerExpandHint } from './expandHint.js';

describe('shouldAutoTriggerExpandHint', () => {
  it('returns true when constrained content gains a new overflowing region', () => {
    expect(
      shouldAutoTriggerExpandHint({
        constrainHeight: true,
        overflowingIdsSize: 2,
        previousOverflowingIdsSize: 1,
      }),
    ).toBe(true);
  });

  it('returns false when overflowingIdsSize decreases', () => {
    expect(
      shouldAutoTriggerExpandHint({
        constrainHeight: true,
        overflowingIdsSize: 1,
        previousOverflowingIdsSize: 2,
      }),
    ).toBe(false);
  });

  it('returns false when overflowingIdsSize is unchanged', () => {
    expect(
      shouldAutoTriggerExpandHint({
        constrainHeight: true,
        overflowingIdsSize: 1,
        previousOverflowingIdsSize: 1,
      }),
    ).toBe(false);
  });

  it('returns false while content is already expanded', () => {
    expect(
      shouldAutoTriggerExpandHint({
        constrainHeight: false,
        overflowingIdsSize: 2,
        previousOverflowingIdsSize: 1,
      }),
    ).toBe(false);
  });
});
