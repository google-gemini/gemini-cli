/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseSGRMouseEvent,
  parseX11MouseEvent,
  isIncompleteMouseSequence,
  parseMouseEvent,
} from './mouse.js';
import { ESC } from './input.js';

describe('mouse utils', () => {
  describe('parseSGRMouseEvent', () => {
    it('parses a valid SGR mouse press', () => {
      // Button 0 (left), col 37, row 25, press (M)
      const input = `${ESC}[<0;37;25M`;
      const result = parseSGRMouseEvent(input);
      expect(result).not.toBeNull();
      expect(result!.event).toEqual({
        name: 'left-press',
        col: 37,
        row: 25,
        shift: false,
        meta: false,
        ctrl: false,
      });
      expect(result!.length).toBe(input.length);
    });

    it('parses a valid SGR mouse release', () => {
      // Button 0 (left), col 37, row 25, release (m)
      const input = `${ESC}[<0;37;25m`;
      const result = parseSGRMouseEvent(input);
      expect(result).not.toBeNull();
      expect(result!.event).toEqual({
        name: 'left-release',
        col: 37,
        row: 25,
        shift: false,
        meta: false,
        ctrl: false,
      });
    });

    it('parses SGR with modifiers', () => {
      // Button 0 + Shift(4) + Meta(8) + Ctrl(16) = 0 + 4 + 8 + 16 = 28
      const input = `${ESC}[<28;10;20M`;
      const result = parseSGRMouseEvent(input);
      expect(result).not.toBeNull();
      expect(result!.event).toEqual({
        name: 'left-press',
        col: 10,
        row: 20,
        shift: true,
        meta: true,
        ctrl: true,
      });
    });

    it('parses SGR move event', () => {
      // Button 0 + Move(32) = 32
      const input = `${ESC}[<32;10;20M`;
      const result = parseSGRMouseEvent(input);
      expect(result).not.toBeNull();
      expect(result!.event.name).toBe('move');
    });

    it('parses SGR scroll events', () => {
      expect(parseSGRMouseEvent(`${ESC}[<64;1;1M`)!.event.name).toBe(
        'scroll-up',
      );
      expect(parseSGRMouseEvent(`${ESC}[<65;1;1M`)!.event.name).toBe(
        'scroll-down',
      );
    });

    it('returns null for invalid SGR', () => {
      expect(parseSGRMouseEvent(`${ESC}[<;1;1M`)).toBeNull();
      expect(parseSGRMouseEvent(`${ESC}[<0;1;M`)).toBeNull();
      expect(parseSGRMouseEvent(`not sgr`)).toBeNull();
    });
  });

  describe('parseX11MouseEvent', () => {
    it('parses a valid X11 mouse press', () => {
      // Button 0 (left) + 32 = ' ' (space)
      // Col 1 + 32 = '!'
      // Row 1 + 32 = '!'
      const input = `${ESC}[M !!`;
      const result = parseX11MouseEvent(input);
      expect(result).not.toBeNull();
      expect(result!.event).toEqual({
        name: 'left-press',
        col: 1,
        row: 1,
        shift: false,
        meta: false,
        ctrl: false,
      });
      expect(result!.length).toBe(6);
    });

    it('returns null for incomplete X11', () => {
      expect(parseX11MouseEvent(`${ESC}[M !`)).toBeNull();
    });
  });

  describe('isIncompleteMouseSequence', () => {
    it('returns true for prefixes', () => {
      expect(isIncompleteMouseSequence(ESC)).toBe(true);
      expect(isIncompleteMouseSequence(`${ESC}[`)).toBe(true);
      expect(isIncompleteMouseSequence(`${ESC}[<`)).toBe(true);
      expect(isIncompleteMouseSequence(`${ESC}[M`)).toBe(true);
    });

    it('returns true for partial SGR', () => {
      expect(isIncompleteMouseSequence(`${ESC}[<0;10;20`)).toBe(true);
    });

    it('returns true for partial X11', () => {
      expect(isIncompleteMouseSequence(`${ESC}[M `)).toBe(true);
      expect(isIncompleteMouseSequence(`${ESC}[M !`)).toBe(true);
    });

    it('returns false for complete SGR', () => {
      expect(isIncompleteMouseSequence(`${ESC}[<0;10;20M`)).toBe(false);
    });

    it('returns false for complete X11', () => {
      expect(isIncompleteMouseSequence(`${ESC}[M !!!`)).toBe(false);
    });

    it('returns false for non-mouse sequences', () => {
      expect(isIncompleteMouseSequence('a')).toBe(false);
      expect(isIncompleteMouseSequence(`${ESC}[A`)).toBe(false); // Arrow up
    });

    it('returns false for garbage that started like a mouse sequence but got too long (SGR)', () => {
      const longGarbage = `${ESC}[<` + '0'.repeat(100);
      expect(isIncompleteMouseSequence(longGarbage)).toBe(false);
    });
  });

  describe('parseMouseEvent', () => {
    it('parses SGR', () => {
      expect(parseMouseEvent(`${ESC}[<0;1;1M`)).not.toBeNull();
    });
    it('parses X11', () => {
      expect(parseMouseEvent(`${ESC}[M !!!`)).not.toBeNull();
    });
  });
});
