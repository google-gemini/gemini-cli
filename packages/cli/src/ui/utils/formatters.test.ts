/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDuration,
  formatMemoryUsage,
  formatTimeAgo,
} from './formatters.js';

describe('formatters', () => {
  describe('formatMemoryUsage', () => {
    it('should format bytes into KB', () => {
      expect(formatMemoryUsage(12345)).toBe('12.1 KB');
    });

    it('should format bytes into MB', () => {
      expect(formatMemoryUsage(12345678)).toBe('11.8 MB');
    });

    it('should format bytes into GB', () => {
      expect(formatMemoryUsage(12345678901)).toBe('11.50 GB');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds less than a second', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format a duration of 0', () => {
      expect(formatDuration(0)).toBe('0s');
    });

    it('should format an exact number of seconds', () => {
      expect(formatDuration(5000)).toBe('5.0s');
    });

    it('should format a duration in seconds with one decimal place', () => {
      expect(formatDuration(12345)).toBe('12.3s');
    });

    it('should format an exact number of minutes', () => {
      expect(formatDuration(120000)).toBe('2m');
    });

    it('should format a duration in minutes and seconds', () => {
      expect(formatDuration(123000)).toBe('2m 3s');
    });

    it('should format an exact number of hours', () => {
      expect(formatDuration(3600000)).toBe('1h');
    });

    it('should format a duration in hours and seconds', () => {
      expect(formatDuration(3605000)).toBe('1h 5s');
    });

    it('should format a duration in hours, minutes, and seconds', () => {
      expect(formatDuration(3723000)).toBe('1h 2m 3s');
    });

    it('should handle large durations', () => {
      expect(formatDuration(86400000 + 3600000 + 120000 + 1000)).toBe(
        '25h 2m 1s',
      );
    });

    it('should handle negative durations', () => {
      expect(formatDuration(-100)).toBe('0s');
    });
  });

  describe('formatTimeAgo', () => {
    const NOW = new Date('2025-01-01T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "just now" for dates less than a minute ago', () => {
      const past = new Date(NOW.getTime() - 30 * 1000);
      expect(formatTimeAgo(past)).toBe('just now');
    });

    it('should return minutes ago', () => {
      const past = new Date(NOW.getTime() - 5 * 60 * 1000);
      expect(formatTimeAgo(past)).toBe('5m ago');
    });

    it('should return hours ago', () => {
      const past = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
      expect(formatTimeAgo(past)).toBe('3h ago');
    });

    it('should return days ago', () => {
      const past = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatTimeAgo(past)).toBe('2d ago');
    });

    it('should handle string dates', () => {
      const past = '2025-01-01T11:00:00Z'; // 1 hour ago
      expect(formatTimeAgo(past)).toBe('1h ago');
    });

    it('should handle number timestamps', () => {
      const past = NOW.getTime() - 10 * 60 * 1000; // 10 minutes ago
      expect(formatTimeAgo(past)).toBe('10m ago');
    });
  });
});
