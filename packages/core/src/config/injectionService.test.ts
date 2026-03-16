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
    service.addInjection('this hint should be ignored', 'user_steering');
    expect(service.getUserHints()).toEqual([]);
    expect(service.getLatestHintIndex()).toBe(-1);
  });

  it('stores trimmed injections and exposes them via indexing when enabled', () => {
    const service = new InjectionService(() => true);

    service.addInjection('  first hint  ', 'user_steering');
    service.addInjection('second hint', 'user_steering');
    service.addInjection('   ', 'user_steering');

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
    service.addInjection('hint', 'user_steering');

    const timestamp = service.getLastUserHintAt();
    expect(timestamp).not.toBeNull();
    expect(typeof timestamp).toBe('number');
  });

  it('notifies listeners when an injection is added', () => {
    const service = new InjectionService(() => true);
    const listener = vi.fn();
    service.onInjection(listener);

    service.addInjection('new hint', 'user_steering');

    expect(listener).toHaveBeenCalledWith('new hint', 'user_steering');
  });

  it('does NOT notify listeners after they are unregistered', () => {
    const service = new InjectionService(() => true);
    const listener = vi.fn();
    service.onInjection(listener);
    service.offInjection(listener);

    service.addInjection('ignored hint', 'user_steering');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should clear all injections', () => {
    const service = new InjectionService(() => true);
    service.addInjection('hint 1', 'user_steering');
    service.addInjection('hint 2', 'user_steering');
    expect(service.getUserHints()).toHaveLength(2);

    service.clear();
    expect(service.getUserHints()).toHaveLength(0);
    expect(service.getLatestHintIndex()).toBe(-1);
  });

  describe('source-specific behavior', () => {
    it('notifies listeners with source for user_steering', () => {
      const service = new InjectionService(() => true);
      const listener = vi.fn();
      service.onInjection(listener);

      service.addInjection('steering hint', 'user_steering');

      expect(listener).toHaveBeenCalledWith('steering hint', 'user_steering');
    });

    it('notifies listeners with source for background_completion', () => {
      const service = new InjectionService(() => true);
      const listener = vi.fn();
      service.onInjection(listener);

      service.addInjection('bg output', 'background_completion');

      expect(listener).toHaveBeenCalledWith(
        'bg output',
        'background_completion',
      );
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
  });
});
