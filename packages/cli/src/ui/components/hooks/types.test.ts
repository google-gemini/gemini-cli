/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  validateCommand,
  validateMatcher,
  validateTimeout,
  validateName,
  HOOK_EVENTS,
  DEFAULT_HOOK_TIMEOUT,
} from './types.js';
import { HookEventName } from '@google/gemini-cli-core';

describe('Hook Configuration Types', () => {
  describe('HOOK_EVENTS', () => {
    it('should contain all HookEventName values', () => {
      const eventNames = HOOK_EVENTS.map((e) => e.event);
      expect(eventNames).toContain(HookEventName.BeforeTool);
      expect(eventNames).toContain(HookEventName.AfterTool);
      expect(eventNames).toContain(HookEventName.BeforeAgent);
      expect(eventNames).toContain(HookEventName.AfterAgent);
      expect(eventNames).toContain(HookEventName.Notification);
      expect(eventNames).toContain(HookEventName.SessionStart);
      expect(eventNames).toContain(HookEventName.SessionEnd);
      expect(eventNames).toContain(HookEventName.PreCompress);
      expect(eventNames).toContain(HookEventName.BeforeModel);
      expect(eventNames).toContain(HookEventName.AfterModel);
      expect(eventNames).toContain(HookEventName.BeforeToolSelection);
    });

    it('should have titles and descriptions for all events', () => {
      HOOK_EVENTS.forEach((event) => {
        expect(event.title).toBeDefined();
        expect(event.title.length).toBeGreaterThan(0);
        expect(event.description).toBeDefined();
        expect(event.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('DEFAULT_HOOK_TIMEOUT', () => {
    it('should be 60000ms', () => {
      expect(DEFAULT_HOOK_TIMEOUT).toBe(60000);
    });
  });

  describe('validateCommand', () => {
    it('should reject empty command', () => {
      expect(validateCommand('').valid).toBe(false);
      expect(validateCommand('   ').valid).toBe(false);
    });

    it('should accept valid command', () => {
      expect(validateCommand('/path/to/script.sh').valid).toBe(true);
      expect(validateCommand('echo hello').valid).toBe(true);
      expect(validateCommand('./relative/path').valid).toBe(true);
    });
  });

  describe('validateMatcher', () => {
    it('should accept empty matcher', () => {
      expect(validateMatcher('').valid).toBe(true);
    });

    it('should accept wildcard', () => {
      expect(validateMatcher('*').valid).toBe(true);
    });

    it('should accept exact string', () => {
      expect(validateMatcher('read_file').valid).toBe(true);
    });

    it('should accept valid regex', () => {
      expect(validateMatcher('/read_.*/').valid).toBe(true);
      expect(validateMatcher('/^test$/').valid).toBe(true);
    });

    it('should reject invalid regex', () => {
      const result = validateMatcher('/[invalid/');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid regex');
    });
  });

  describe('validateTimeout', () => {
    it('should accept undefined', () => {
      expect(validateTimeout(undefined).valid).toBe(true);
    });

    it('should accept valid positive number', () => {
      expect(validateTimeout(1000).valid).toBe(true);
      expect(validateTimeout(60000).valid).toBe(true);
      expect(validateTimeout(300000).valid).toBe(true);
    });

    it('should reject zero or negative', () => {
      expect(validateTimeout(0).valid).toBe(false);
      expect(validateTimeout(-1).valid).toBe(false);
    });

    it('should reject values exceeding 5 minutes', () => {
      const result = validateTimeout(300001);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('5 minutes');
    });

    it('should reject NaN', () => {
      expect(validateTimeout(NaN).valid).toBe(false);
    });
  });

  describe('validateName', () => {
    it('should accept undefined or empty', () => {
      expect(validateName(undefined).valid).toBe(true);
      expect(validateName('').valid).toBe(true);
    });

    it('should accept valid names', () => {
      expect(validateName('my-hook').valid).toBe(true);
      expect(validateName('my_hook').valid).toBe(true);
      expect(validateName('myHook123').valid).toBe(true);
    });

    it('should reject names with invalid characters', () => {
      expect(validateName('my hook').valid).toBe(false);
      expect(validateName('my.hook').valid).toBe(false);
      expect(validateName('my@hook').valid).toBe(false);
    });
  });
});
