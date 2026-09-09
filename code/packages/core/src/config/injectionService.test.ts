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
    expect(service.getInjections()).toEqual([]);
    expect(service.getLatestInjectionIndex()).toBe(-1);
  });

  it('stores trimmed injections and exposes them via indexing when enabled', () => {
    const service = new InjectionService(() => true);

    service.addInjection('  first hint  ', 'user_steering');
    service.addInjection('second hint', 'user_steering');
    service.addInjection('   ', 'user_steering');

    expect(service.getInjections()).toEqual(['first hint', 'second hint']);
    expect(service.getLatestInjectionIndex()).toBe(1);
    expect(service.getInjectionsAfter(-1)).toEqual([
      'first hint',
      'second hint',
    ]);
    expect(service.getInjectionsAfter(0)).toEqual(['second hint']);
    expect(service.getInjectionsAfter(1)).toEqual([]);
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
    expect(service.getInjections()).toHaveLength(2);

    service.clear();
    expect(service.getInjections()).toHaveLength(0);
    expect(service.getLatestInjectionIndex()).toBe(-1);
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
      expect(service.getInjections()).toEqual(['bg output']);
    });

    it('filters injections by source when requested', () => {
      const service = new InjectionService(() => true);
      service.addInjection('hint', 'user_steering');
      service.addInjection('bg output', 'background_completion');
      service.addInjection('hint 2', 'user_steering');

      expect(service.getInjections('user_steering')).toEqual([
        'hint',
        'hint 2',
      ]);
      expect(service.getInjections('background_completion')).toEqual([
        'bg output',
      ]);
      expect(service.getInjections()).toEqual(['hint', 'bg output', 'hint 2']);

      expect(service.getInjectionsAfter(0, 'user_steering')).toEqual([
        'hint 2',
      ]);
      expect(service.getInjectionsAfter(0, 'background_completion')).toEqual([
        'bg output',
      ]);
    });

    it('rejects user_steering when model steering is disabled', () => {
      const service = new InjectionService(() => false);
      const listener = vi.fn();
      service.onInjection(listener);

      service.addInjection('steering hint', 'user_steering');

      expect(listener).not.toHaveBeenCalled();
      expect(service.getInjections()).toEqual([]);
    });
  });
});
