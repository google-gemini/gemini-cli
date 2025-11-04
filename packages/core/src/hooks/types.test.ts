/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { HookEventName, HookType } from './types.js';

describe('Hook Types', () => {
  describe('HookEventName', () => {
    it('should contain all required event names', () => {
      const expectedEvents = [
        'BeforeTool',
        'AfterTool',
        'BeforeAgent',
        'Notification',
        'AfterAgent',
        'SessionStart',
        'SessionEnd',
        'PreCompress',
        'BeforeModel',
        'AfterModel',
        'BeforeToolSelection',
      ];

      for (const event of expectedEvents) {
        expect(Object.values(HookEventName)).toContain(event);
      }
    });
  });

  describe('HookType', () => {
    it('should contain command type', () => {
      expect(HookType.Command).toBe('command');
    });
  });
});
