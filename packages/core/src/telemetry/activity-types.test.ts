/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ActivityType } from './activity-types.js';

describe('ActivityType', () => {
  describe('enum values', () => {
    it('should have USER_INPUT_START activity', () => {
      expect(ActivityType.USER_INPUT_START).toBe('user_input_start');
    });

    it('should have USER_INPUT_END activity', () => {
      expect(ActivityType.USER_INPUT_END).toBe('user_input_end');
    });

    it('should have MESSAGE_ADDED activity', () => {
      expect(ActivityType.MESSAGE_ADDED).toBe('message_added');
    });

    it('should have TOOL_CALL_SCHEDULED activity', () => {
      expect(ActivityType.TOOL_CALL_SCHEDULED).toBe('tool_call_scheduled');
    });

    it('should have TOOL_CALL_COMPLETED activity', () => {
      expect(ActivityType.TOOL_CALL_COMPLETED).toBe('tool_call_completed');
    });

    it('should have STREAM_START activity', () => {
      expect(ActivityType.STREAM_START).toBe('stream_start');
    });

    it('should have STREAM_END activity', () => {
      expect(ActivityType.STREAM_END).toBe('stream_end');
    });

    it('should have HISTORY_UPDATED activity', () => {
      expect(ActivityType.HISTORY_UPDATED).toBe('history_updated');
    });

    it('should have MANUAL_TRIGGER activity', () => {
      expect(ActivityType.MANUAL_TRIGGER).toBe('manual_trigger');
    });
  });

  describe('enum structure', () => {
    it('should have exactly 9 activity types', () => {
      const activityKeys = Object.keys(ActivityType);
      expect(activityKeys).toHaveLength(9);
    });

    it('should use snake_case for all values', () => {
      const activityValues = Object.values(ActivityType);
      activityValues.forEach((value) => {
        expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
      });
    });

    it('should use UPPER_SNAKE_CASE for all keys', () => {
      const activityKeys = Object.keys(ActivityType);
      activityKeys.forEach((key) => {
        expect(key).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
      });
    });
  });

  describe('activity pairs', () => {
    it('should have matching start/end pairs for user input', () => {
      expect(ActivityType.USER_INPUT_START).toBeDefined();
      expect(ActivityType.USER_INPUT_END).toBeDefined();
      expect(ActivityType.USER_INPUT_START).not.toBe(
        ActivityType.USER_INPUT_END,
      );
    });

    it('should have matching start/end pairs for streaming', () => {
      expect(ActivityType.STREAM_START).toBeDefined();
      expect(ActivityType.STREAM_END).toBeDefined();
      expect(ActivityType.STREAM_START).not.toBe(ActivityType.STREAM_END);
    });
  });

  describe('activity categories', () => {
    it('should have user input related activities', () => {
      expect(ActivityType.USER_INPUT_START).toContain('user_input');
      expect(ActivityType.USER_INPUT_END).toContain('user_input');
    });

    it('should have tool call related activities', () => {
      expect(ActivityType.TOOL_CALL_SCHEDULED).toContain('tool_call');
      expect(ActivityType.TOOL_CALL_COMPLETED).toContain('tool_call');
    });

    it('should have stream related activities', () => {
      expect(ActivityType.STREAM_START).toContain('stream');
      expect(ActivityType.STREAM_END).toContain('stream');
    });
  });

  describe('uniqueness', () => {
    it('should have unique values for all activity types', () => {
      const activityValues = Object.values(ActivityType);
      const uniqueValues = new Set(activityValues);
      expect(uniqueValues.size).toBe(activityValues.length);
    });
  });
});
