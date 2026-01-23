/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { couldBeSGRMouseSequence, SGR_MOUSE_REGEX, ESC } from './input.js';

describe('input utils', () => {
  describe('SGR_MOUSE_REGEX', () => {
    it('should match valid SGR mouse sequences', () => {
      // Press left button at 10, 20
      expect('\x1b[<0;10;20M').toMatch(SGR_MOUSE_REGEX);
      // Release left button at 10, 20
      expect('\x1b[<0;10;20m').toMatch(SGR_MOUSE_REGEX);
      // Move with left button held at 30, 40
      expect('\x1b[<32;30;40M').toMatch(SGR_MOUSE_REGEX);
      // Scroll up at 5, 5
      expect('\x1b[<64;5;5M').toMatch(SGR_MOUSE_REGEX);
    });

    it('should not match invalid sequences', () => {
      expect('hello').not.toMatch(SGR_MOUSE_REGEX);
      expect('\x1b[A').not.toMatch(SGR_MOUSE_REGEX); // Arrow up
      expect('\x1b[<0;10;20').not.toMatch(SGR_MOUSE_REGEX); // Incomplete
    });
  });

  describe('couldBeSGRMouseSequence', () => {
    it('should return true for empty string', () => {
      expect(couldBeSGRMouseSequence('')).toBe(true);
    });

    it('should return true for partial SGR prefixes', () => {
      expect(couldBeSGRMouseSequence(ESC)).toBe(true);
      expect(couldBeSGRMouseSequence(`${ESC}[`)).toBe(true);
      expect(couldBeSGRMouseSequence(`${ESC}[<`)).toBe(true);
    });

    it('should return true for full SGR sequence start', () => {
      expect(couldBeSGRMouseSequence(`${ESC}[<0;10;20M`)).toBe(true);
    });

    it('should return false for non-SGR sequences', () => {
      expect(couldBeSGRMouseSequence('a')).toBe(false);
      expect(couldBeSGRMouseSequence(`${ESC}a`)).toBe(false);
      expect(couldBeSGRMouseSequence(`${ESC}[A`)).toBe(false);
    });
  });
});
