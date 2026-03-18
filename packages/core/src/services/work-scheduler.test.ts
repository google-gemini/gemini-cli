/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkScheduler } from './work-scheduler.js';
import type { SerializedScheduledItem } from './work-scheduler.js';

describe('WorkScheduler', () => {
  let scheduler: WorkScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new WorkScheduler();
  });

  afterEach(() => {
    scheduler.dispose();
    vi.useRealTimers();
  });

  describe('add', () => {
    it('should add an item and return it with pending status', () => {
      const fireAt = new Date(Date.now() + 60_000);
      const item = scheduler.add('do something', fireAt);

      expect(item.id).toBeDefined();
      expect(item.prompt).toBe('do something');
      expect(item.fireAt).toEqual(fireAt);
      expect(item.status).toBe('pending');
      expect(item.createdAt).toBeInstanceOf(Date);
    });

    it('should keep items sorted by fireAt', () => {
      const now = Date.now();
      scheduler.add('third', new Date(now + 300_000));
      scheduler.add('first', new Date(now + 60_000));
      scheduler.add('second', new Date(now + 120_000));

      const pending = scheduler.getPendingItems();
      expect(pending).toHaveLength(3);
      expect(pending[0].prompt).toBe('first');
      expect(pending[1].prompt).toBe('second');
      expect(pending[2].prompt).toBe('third');
    });

    it('should emit changed event on add', () => {
      const changedSpy = vi.fn();
      scheduler.on('changed', changedSpy);

      scheduler.add('test', new Date(Date.now() + 60_000));

      expect(changedSpy).toHaveBeenCalledTimes(1);
    });

    it('should fire past-due items immediately on add', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      const pastDate = new Date(Date.now() - 10_000);
      const item = scheduler.add('overdue task', pastDate);

      expect(fireSpy).toHaveBeenCalledWith('overdue task');
      expect(item.status).toBe('fired');
    });

    it('should rearm timer when adding an item sooner than the current next', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      scheduler.addRelative('ten min', 10);
      scheduler.addRelative('five min', 5);

      vi.advanceTimersByTime(5 * 60_000);
      expect(fireSpy).toHaveBeenCalledTimes(1);
      expect(fireSpy).toHaveBeenCalledWith('five min');

      vi.advanceTimersByTime(5 * 60_000);
      expect(fireSpy).toHaveBeenCalledTimes(2);
      expect(fireSpy).toHaveBeenCalledWith('ten min');
    });
  });

  describe('addRelative', () => {
    it('should add an item relative to current time', () => {
      const now = Date.now();
      const item = scheduler.addRelative('in 5 minutes', 5);

      expect(item.fireAt.getTime()).toBe(now + 5 * 60_000);
      expect(item.status).toBe('pending');
    });

    it('should appear in pending items', () => {
      scheduler.addRelative('relative item', 10);

      const pending = scheduler.getPendingItems();
      expect(pending).toHaveLength(1);
      expect(pending[0].prompt).toBe('relative item');
    });
  });

  describe('cancel', () => {
    it('should cancel a pending item and return true', () => {
      const item = scheduler.add('cancel me', new Date(Date.now() + 60_000));

      const result = scheduler.cancel(item.id);

      expect(result).toBe(true);
      expect(scheduler.getPendingItems()).toHaveLength(0);
    });

    it('should return false for a non-existent id', () => {
      const result = scheduler.cancel('non-existent-id');

      expect(result).toBe(false);
    });

    it('should return false for an already cancelled item', () => {
      const item = scheduler.add('cancel me', new Date(Date.now() + 60_000));
      scheduler.cancel(item.id);

      const result = scheduler.cancel(item.id);

      expect(result).toBe(false);
    });

    it('should emit changed event on successful cancel', () => {
      const item = scheduler.add('cancel me', new Date(Date.now() + 60_000));
      const changedSpy = vi.fn();
      scheduler.on('changed', changedSpy);

      scheduler.cancel(item.id);

      expect(changedSpy).toHaveBeenCalledTimes(1);
    });

    it('should not emit changed event on failed cancel', () => {
      const changedSpy = vi.fn();
      scheduler.on('changed', changedSpy);

      scheduler.cancel('non-existent-id');

      expect(changedSpy).not.toHaveBeenCalled();
    });

    it('should rearm timer to next item when cancelling the currently armed item', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      const first = scheduler.addRelative('five min', 5);
      scheduler.addRelative('ten min', 10);

      scheduler.cancel(first.id);

      vi.advanceTimersByTime(5 * 60_000);
      expect(fireSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5 * 60_000);
      expect(fireSpy).toHaveBeenCalledTimes(1);
      expect(fireSpy).toHaveBeenCalledWith('ten min');
    });
  });

  describe('getPendingItems', () => {
    it('should return empty array when no items', () => {
      expect(scheduler.getPendingItems()).toHaveLength(0);
    });

    it('should exclude cancelled and fired items', () => {
      const item1 = scheduler.add('keep', new Date(Date.now() + 60_000));
      scheduler.add('cancel', new Date(Date.now() + 120_000));
      scheduler.add('also keep', new Date(Date.now() + 180_000));

      scheduler.cancel(scheduler.getPendingItems()[1].id);

      const pending = scheduler.getPendingItems();
      expect(pending).toHaveLength(2);
      expect(pending[0].id).toBe(item1.id);
      expect(pending[1].prompt).toBe('also keep');
    });
  });

  describe('getNextPending', () => {
    it('should return undefined when no items', () => {
      expect(scheduler.getNextPending()).toBeUndefined();
    });

    it('should return the soonest pending item', () => {
      const now = Date.now();
      scheduler.add('later', new Date(now + 120_000));
      scheduler.add('sooner', new Date(now + 60_000));

      const next = scheduler.getNextPending();
      expect(next?.prompt).toBe('sooner');
    });
  });

  describe('fire event', () => {
    it('should emit fire event when timer expires', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      scheduler.addRelative('fire me', 5);

      expect(fireSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5 * 60_000);

      expect(fireSpy).toHaveBeenCalledWith('fire me');
    });

    it('should emit changed event when item fires via timer', () => {
      scheduler.addRelative('fire me', 5);
      const changedSpy = vi.fn();
      scheduler.on('changed', changedSpy);

      vi.advanceTimersByTime(5 * 60_000);

      expect(changedSpy).toHaveBeenCalled();
    });

    it('should fire multiple items in sequence as their timers expire', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      scheduler.addRelative('first', 1);
      scheduler.addRelative('second', 2);

      vi.advanceTimersByTime(60_000);
      expect(fireSpy).toHaveBeenCalledTimes(1);
      expect(fireSpy).toHaveBeenCalledWith('first');

      vi.advanceTimersByTime(60_000);
      expect(fireSpy).toHaveBeenCalledTimes(2);
      expect(fireSpy).toHaveBeenCalledWith('second');
    });

    it('should not fire cancelled items', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      const item = scheduler.addRelative('cancel me', 5);
      scheduler.cancel(item.id);

      vi.advanceTimersByTime(5 * 60_000);

      expect(fireSpy).not.toHaveBeenCalled();
    });
  });

  describe('serialize', () => {
    it('should serialize pending items to ISO string format', () => {
      const now = Date.now();
      scheduler.add('item 1', new Date(now + 60_000));
      scheduler.add('item 2', new Date(now + 120_000));

      const serialized = scheduler.serialize();

      expect(serialized).toHaveLength(2);
      expect(serialized[0].prompt).toBe('item 1');
      expect(serialized[0].fireAt).toBe(new Date(now + 60_000).toISOString());
      expect(serialized[0].id).toBeDefined();
      expect(serialized[0].createdAt).toBeDefined();
      expect(serialized[1].prompt).toBe('item 2');
    });

    it('should not include cancelled items', () => {
      const item = scheduler.add('cancel me', new Date(Date.now() + 60_000));
      scheduler.add('keep me', new Date(Date.now() + 120_000));
      scheduler.cancel(item.id);

      const serialized = scheduler.serialize();

      expect(serialized).toHaveLength(1);
      expect(serialized[0].prompt).toBe('keep me');
    });

    it('should return empty array when no pending items', () => {
      expect(scheduler.serialize()).toEqual([]);
    });

    it('should exclude fired items', () => {
      scheduler.addRelative('will fire', 5);

      vi.advanceTimersByTime(5 * 60_000);

      const serialized = scheduler.serialize();
      expect(serialized).toEqual([]);
    });
  });

  describe('restore', () => {
    it('should restore items from serialized data', () => {
      const now = Date.now();
      const serialized: SerializedScheduledItem[] = [
        {
          id: 'restored-1',
          prompt: 'restored item',
          fireAt: new Date(now + 60_000).toISOString(),
          createdAt: new Date(now - 10_000).toISOString(),
        },
      ];

      scheduler.restore(serialized);

      const pending = scheduler.getPendingItems();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('restored-1');
      expect(pending[0].prompt).toBe('restored item');
      expect(pending[0].status).toBe('pending');
    });

    it('should emit changed event on restore', () => {
      const changedSpy = vi.fn();
      scheduler.on('changed', changedSpy);

      scheduler.restore([
        {
          id: 'id-1',
          prompt: 'test',
          fireAt: new Date(Date.now() + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);

      expect(changedSpy).toHaveBeenCalledTimes(1);
    });

    it('should fire past-due items immediately on restore', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      const serialized: SerializedScheduledItem[] = [
        {
          id: 'past-due-1',
          prompt: 'overdue restored',
          fireAt: new Date(Date.now() - 30_000).toISOString(),
          createdAt: new Date(Date.now() - 120_000).toISOString(),
        },
      ];

      scheduler.restore(serialized);

      expect(fireSpy).toHaveBeenCalledWith('overdue restored');
    });

    it('should handle round-trip serialize and restore', () => {
      const now = Date.now();
      scheduler.add('round trip 1', new Date(now + 60_000));
      scheduler.add('round trip 2', new Date(now + 120_000));

      const serialized = scheduler.serialize();

      const newScheduler = new WorkScheduler();
      newScheduler.restore(serialized);

      const pending = newScheduler.getPendingItems();
      expect(pending).toHaveLength(2);
      expect(pending[0].prompt).toBe('round trip 1');
      expect(pending[1].prompt).toBe('round trip 2');

      newScheduler.dispose();
    });

    it('should sort restored items by fireAt', () => {
      const now = Date.now();
      const serialized: SerializedScheduledItem[] = [
        {
          id: 'later',
          prompt: 'later',
          fireAt: new Date(now + 120_000).toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: 'sooner',
          prompt: 'sooner',
          fireAt: new Date(now + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];

      scheduler.restore(serialized);

      const pending = scheduler.getPendingItems();
      expect(pending[0].prompt).toBe('sooner');
      expect(pending[1].prompt).toBe('later');
    });

    it('should handle mix of past-due and future items', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      const now = Date.now();
      const serialized: SerializedScheduledItem[] = [
        {
          id: 'past-due',
          prompt: 'overdue',
          fireAt: new Date(now - 30_000).toISOString(),
          createdAt: new Date(now - 120_000).toISOString(),
        },
        {
          id: 'future',
          prompt: 'upcoming',
          fireAt: new Date(now + 5 * 60_000).toISOString(),
          createdAt: new Date(now - 60_000).toISOString(),
        },
      ];

      scheduler.restore(serialized);

      expect(fireSpy).toHaveBeenCalledTimes(1);
      expect(fireSpy).toHaveBeenCalledWith('overdue');

      const pending = scheduler.getPendingItems();
      expect(pending).toHaveLength(1);
      expect(pending[0].prompt).toBe('upcoming');

      vi.advanceTimersByTime(5 * 60_000);
      expect(fireSpy).toHaveBeenCalledTimes(2);
      expect(fireSpy).toHaveBeenCalledWith('upcoming');
    });
  });

  describe('formatScheduleSummary', () => {
    it('should include current time and timezone', () => {
      const summary = scheduler.formatScheduleSummary();

      expect(summary).toContain('Current time:');
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      expect(summary).toContain(tz);
    });

    it('should show no scheduled items message when empty', () => {
      const summary = scheduler.formatScheduleSummary();

      expect(summary).toContain('No scheduled items.');
    });

    it('should list all pending items', () => {
      scheduler.add('first task', new Date(Date.now() + 60_000));
      scheduler.add('second task', new Date(Date.now() + 120_000));

      const summary = scheduler.formatScheduleSummary();

      expect(summary).toContain('Active schedule:');
      expect(summary).toContain('first task');
      expect(summary).toContain('second task');
      expect(summary).toContain('1.');
      expect(summary).toContain('2.');
    });

    it('should show truncated item IDs', () => {
      const item = scheduler.add('test', new Date(Date.now() + 60_000));

      const summary = scheduler.formatScheduleSummary();

      expect(summary).toContain(`[${item.id.slice(0, 8)}]`);
    });

    it('should not contain ISO UTC format (toISOString)', () => {
      scheduler.add('check format', new Date(Date.now() + 60_000));

      const summary = scheduler.formatScheduleSummary();

      expect(summary).not.toMatch(/\.\d{3}Z/);
    });
  });

  describe('dispose', () => {
    it('should prevent items from firing after dispose', () => {
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      scheduler.addRelative('should not fire', 5);
      scheduler.dispose();

      vi.advanceTimersByTime(5 * 60_000);

      expect(fireSpy).not.toHaveBeenCalled();
    });

    it('should be safe to call dispose multiple times', () => {
      scheduler.dispose();
      scheduler.dispose();
      // No error thrown
    });

    it('should not throw when adding items after dispose', () => {
      scheduler.dispose();

      expect(() => {
        scheduler.add('after dispose', new Date(Date.now() + 60_000));
      }).not.toThrow();
    });
  });
});
