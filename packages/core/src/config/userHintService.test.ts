/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { UserHintService } from './userHintService.js';

describe('UserHintService', () => {
  it('is disabled by default and ignores hints', () => {
    const service = new UserHintService(() => false);
    service.addUserHint('this hint should be ignored');
    expect(service.getUserHints()).toEqual([]);
    expect(service.getLatestHintIndex()).toBe(-1);
  });

  it('stores trimmed hints and exposes them via indexing when enabled', () => {
    const service = new UserHintService(() => true);

    service.addUserHint('  first hint  ');
    service.addUserHint('second hint');
    service.addUserHint('   ');

    expect(service.getUserHints()).toEqual(['first hint', 'second hint']);
    expect(service.getLatestHintIndex()).toBe(1);
    expect(service.getUserHintsAfter(-1)).toEqual([
      'first hint',
      'second hint',
    ]);
    expect(service.getUserHintsAfter(0)).toEqual(['second hint']);
    expect(service.getUserHintsAfter(1)).toEqual([]);
  });

  it('tracks the last hint timestamp', () => {
    const service = new UserHintService(() => true);

    expect(service.getLastUserHintAt()).toBeNull();
    service.addUserHint('hint');

    const timestamp = service.getLastUserHintAt();
    expect(timestamp).not.toBeNull();
    expect(typeof timestamp).toBe('number');
  });

  it('notifies listeners when a hint is added', () => {
    const service = new UserHintService(() => true);
    const listener = vi.fn();
    service.onUserHint(listener);

    service.addUserHint('new hint');

    expect(listener).toHaveBeenCalledWith('new hint');
  });

  it('does NOT notify listeners after they are unregistered', () => {
    const service = new UserHintService(() => true);
    const listener = vi.fn();
    service.onUserHint(listener);
    service.offUserHint(listener);

    service.addUserHint('ignored hint');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should clear all hints', () => {
    const service = new UserHintService(() => true);
    service.addUserHint('hint 1');
    service.addUserHint('hint 2');
    expect(service.getUserHints()).toHaveLength(2);

    service.clear();
    expect(service.getUserHints()).toHaveLength(0);
    expect(service.getLatestHintIndex()).toBe(-1);
  });
});
