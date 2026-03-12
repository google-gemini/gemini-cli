/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { InjectionService } from './injectionService.js';

describe('InjectionService', () => {
  it('is disabled by default and ignores user_steering injections', () => {
    const service = new InjectionService(() => false);
    service.addUserHint('this hint should be ignored');
    expect(service.getUserHints()).toEqual([]);
    expect(service.getLatestHintIndex()).toBe(-1);
  });

  it('stores trimmed injections and exposes them via indexing when enabled', () => {
    const service = new InjectionService(() => true);

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

  it('tracks the last injection timestamp', () => {
    const service = new InjectionService(() => true);

    expect(service.getLastUserHintAt()).toBeNull();
    service.addUserHint('hint');

    const timestamp = service.getLastUserHintAt();
    expect(timestamp).not.toBeNull();
    expect(typeof timestamp).toBe('number');
  });

  it('notifies user hint listeners when a user_steering injection is added', () => {
    const service = new InjectionService(() => true);
    const listener = vi.fn();
    service.onUserHint(listener);

    service.addUserHint('new hint');

    expect(listener).toHaveBeenCalledWith('new hint');
  });

  it('does NOT notify user hint listeners after they are unregistered', () => {
    const service = new InjectionService(() => true);
    const listener = vi.fn();
    service.onUserHint(listener);
    service.offUserHint(listener);

    service.addUserHint('ignored hint');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should clear all injections', () => {
    const service = new InjectionService(() => true);
    service.addUserHint('hint 1');
    service.addUserHint('hint 2');
    expect(service.getUserHints()).toHaveLength(2);

    service.clear();
    expect(service.getUserHints()).toHaveLength(0);
    expect(service.getLatestHintIndex()).toBe(-1);
  });

  describe('typed injection API', () => {
    it('notifies typed listeners with source for user_steering', () => {
      const service = new InjectionService(() => true);
      const listener = vi.fn();
      service.onInjection(listener);

      service.addUserHint('steering hint');

      expect(listener).toHaveBeenCalledWith('steering hint', 'user_steering');
    });

    it('notifies typed listeners with source for background_completion', () => {
      const service = new InjectionService(() => true);
      const listener = vi.fn();
      service.onInjection(listener);

      service.addInjection('bg output', 'background_completion');

      expect(listener).toHaveBeenCalledWith(
        'bg output',
        'background_completion',
      );
    });

    it('does NOT notify user hint listeners for background_completion', () => {
      const service = new InjectionService(() => true);
      const userListener = vi.fn();
      const typedListener = vi.fn();
      service.onUserHint(userListener);
      service.onInjection(typedListener);

      service.addInjection('bg output', 'background_completion');

      expect(typedListener).toHaveBeenCalledWith(
        'bg output',
        'background_completion',
      );
      expect(userListener).not.toHaveBeenCalled();
    });

    it('accepts background_completion even when model steering is disabled', () => {
      const service = new InjectionService(() => false);
      const listener = vi.fn();
      service.onInjection(listener);

      service.addInjection('bg output', 'background_completion');

      expect(listener).toHaveBeenCalledWith(
        'bg output',
        'background_completion',
      );
      expect(service.getUserHints()).toEqual(['bg output']);
    });

    it('rejects user_steering when model steering is disabled', () => {
      const service = new InjectionService(() => false);
      const listener = vi.fn();
      service.onInjection(listener);

      service.addInjection('steering hint', 'user_steering');

      expect(listener).not.toHaveBeenCalled();
      expect(service.getUserHints()).toEqual([]);
    });

    it('unregisters typed listeners correctly', () => {
      const service = new InjectionService(() => true);
      const listener = vi.fn();
      service.onInjection(listener);
      service.offInjection(listener);

      service.addInjection('bg output', 'background_completion');

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
