/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  moveHome,
  moveEnd,
  moveWordLeft,
  moveWordRight,
  movementFunctions,
  MovementContext,
} from './movement-functions.js';

// Helper to create a basic movement context
const createContext = (
  overrides: Partial<MovementContext> = {},
): MovementContext => ({
  visualLines: ['line1', 'line2', 'line3'],
  visualCursor: [0, 0],
  preferredCol: null,
  lines: ['line1', 'line2', 'line3'],
  currentLineLen: (row: number) => overrides.lines?.[row]?.length ?? 0,
  visualToLogicalMap: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  logicalToVisualMap: [[[0, 0]], [[1, 0]], [[2, 0]]],
  ...overrides,
});

describe('Movement Functions', () => {
  describe('moveLeft', () => {
    it('should move left within a line', () => {
      const context = createContext({
        visualCursor: [0, 3],
      });

      const result = moveLeft(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 2,
        newPreferredCol: null,
      });
    });

    it('should move to end of previous line when at start of line', () => {
      const context = createContext({
        visualLines: ['abc', 'def'],
        visualCursor: [1, 0],
      });

      const result = moveLeft(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 3, // End of 'abc'
        newPreferredCol: null,
      });
    });

    it('should not move when at start of first line', () => {
      const context = createContext({
        visualCursor: [0, 0],
      });

      const result = moveLeft(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 0,
        newPreferredCol: null,
      });
    });

    it('should reset preferred column', () => {
      const context = createContext({
        visualCursor: [0, 3],
        preferredCol: 5,
      });

      const result = moveLeft(context);

      expect(result.newPreferredCol).toBe(null);
    });
  });

  describe('moveRight', () => {
    it('should move right within a line', () => {
      const context = createContext({
        visualLines: ['abcde'],
        visualCursor: [0, 2],
      });

      const result = moveRight(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 3,
        newPreferredCol: null,
      });
    });

    it('should move to start of next line when at end of line', () => {
      const context = createContext({
        visualLines: ['abc', 'def'],
        visualCursor: [0, 3], // End of 'abc'
      });

      const result = moveRight(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 0,
        newPreferredCol: null,
      });
    });

    it('should not move when at end of last line', () => {
      const context = createContext({
        visualLines: ['abc', 'def'],
        visualCursor: [1, 3], // End of 'def'
      });

      const result = moveRight(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 3,
        newPreferredCol: null,
      });
    });

    it('should reset preferred column', () => {
      const context = createContext({
        visualLines: ['abcde'],
        visualCursor: [0, 2],
        preferredCol: 5,
      });

      const result = moveRight(context);

      expect(result.newPreferredCol).toBe(null);
    });
  });

  describe('moveUp', () => {
    it('should move up and maintain column within line length', () => {
      const context = createContext({
        visualLines: ['abcde', 'fghij'],
        visualCursor: [1, 2],
      });

      const result = moveUp(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 2,
        newPreferredCol: 2,
      });
    });

    it('should clamp to line length when preferred column exceeds line', () => {
      const context = createContext({
        visualLines: ['ab', 'fghij'],
        visualCursor: [1, 4],
      });

      const result = moveUp(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 2, // Clamped to length of 'ab'
        newPreferredCol: 4,
      });
    });

    it('should use existing preferred column', () => {
      const context = createContext({
        visualLines: ['abc', 'fghij'],
        visualCursor: [1, 2],
        preferredCol: 4,
      });

      const result = moveUp(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 3, // Clamped to length of 'abc'
        newPreferredCol: 4,
      });
    });

    it('should not move when at first line', () => {
      const context = createContext({
        visualCursor: [0, 2],
      });

      const result = moveUp(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 2,
        newPreferredCol: null,
      });
    });
  });

  describe('moveDown', () => {
    it('should move down and maintain column within line length', () => {
      const context = createContext({
        visualLines: ['abcde', 'fghij'],
        visualCursor: [0, 2],
      });

      const result = moveDown(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 2,
        newPreferredCol: 2,
      });
    });

    it('should clamp to line length when preferred column exceeds line', () => {
      const context = createContext({
        visualLines: ['abcde', 'fg'],
        visualCursor: [0, 4],
      });

      const result = moveDown(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 2, // Clamped to length of 'fg'
        newPreferredCol: 4,
      });
    });

    it('should use existing preferred column', () => {
      const context = createContext({
        visualLines: ['abc', 'fghij'],
        visualCursor: [0, 2],
        preferredCol: 4,
      });

      const result = moveDown(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 4,
        newPreferredCol: 4,
      });
    });

    it('should not move when at last line', () => {
      const context = createContext({
        visualLines: ['line1', 'line2'],
        visualCursor: [1, 2],
      });

      const result = moveDown(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 2,
        newPreferredCol: null,
      });
    });
  });

  describe('moveHome', () => {
    it('should move to start of current line', () => {
      const context = createContext({
        visualCursor: [1, 3],
      });

      const result = moveHome(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 0,
        newPreferredCol: null,
      });
    });

    it('should reset preferred column', () => {
      const context = createContext({
        visualCursor: [1, 3],
        preferredCol: 5,
      });

      const result = moveHome(context);

      expect(result.newPreferredCol).toBe(null);
    });
  });

  describe('moveEnd', () => {
    it('should move to end of current line', () => {
      const context = createContext({
        visualLines: ['abc', 'defgh'],
        visualCursor: [1, 2],
      });

      const result = moveEnd(context);

      expect(result).toEqual({
        newVisualRow: 1,
        newVisualCol: 5, // Length of 'defgh'
        newPreferredCol: null,
      });
    });

    it('should reset preferred column', () => {
      const context = createContext({
        visualLines: ['abc', 'defgh'],
        visualCursor: [1, 2],
        preferredCol: 5,
      });

      const result = moveEnd(context);

      expect(result.newPreferredCol).toBe(null);
    });
  });

  describe('moveWordLeft', () => {
    it('should move to start of previous word', () => {
      const context = createContext({
        lines: ['hello world test'],
        visualLines: ['hello world test'],
        visualCursor: [0, 12], // At 't' in 'test'
        visualToLogicalMap: [[0, 0]],
        logicalToVisualMap: [[[0, 0]]],
        currentLineLen: () => 16,
      });

      const result = moveWordLeft(context);

      expect(result.newVisualRow).toBe(0);
      expect(result.newVisualCol).toBe(6); // Start of 'world'
      expect(result.newPreferredCol).toBe(null);
    });

    it('should handle empty mapping gracefully', () => {
      const context = createContext({
        visualToLogicalMap: [],
        logicalToVisualMap: [],
        visualCursor: [0, 5],
      });

      const result = moveWordLeft(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 5,
        newPreferredCol: null,
      });
    });

    it('should move to beginning when no word boundary found', () => {
      const context = createContext({
        lines: ['hello'],
        visualLines: ['hello'],
        visualCursor: [0, 2],
        visualToLogicalMap: [[0, 0]],
        logicalToVisualMap: [[[0, 0]]],
        currentLineLen: () => 5,
      });

      const result = moveWordLeft(context);

      expect(result.newVisualCol).toBe(0);
    });
  });

  describe('moveWordRight', () => {
    it('should move to start of next word', () => {
      const context = createContext({
        lines: ['hello world test'],
        visualLines: ['hello world test'],
        visualCursor: [0, 2], // At 'l' in 'hello'
        visualToLogicalMap: [[0, 0]],
        logicalToVisualMap: [[[0, 0]]],
        currentLineLen: () => 16,
      });

      const result = moveWordRight(context);

      expect(result.newVisualRow).toBe(0);
      expect(result.newVisualCol).toBe(5); // Start of space before 'world'
      expect(result.newPreferredCol).toBe(null);
    });

    it('should handle empty mapping gracefully', () => {
      const context = createContext({
        visualToLogicalMap: [],
        logicalToVisualMap: [],
        visualCursor: [0, 5],
      });

      const result = moveWordRight(context);

      expect(result).toEqual({
        newVisualRow: 0,
        newVisualCol: 5,
        newPreferredCol: null,
      });
    });

    it('should move to end when no word boundary found', () => {
      const context = createContext({
        lines: ['hello'],
        visualLines: ['hello'],
        visualCursor: [0, 2],
        visualToLogicalMap: [[0, 0]],
        logicalToVisualMap: [[[0, 0]]],
        currentLineLen: () => 5,
      });

      const result = moveWordRight(context);

      expect(result.newVisualCol).toBe(5); // End of line
    });
  });

  describe('movementFunctions registry', () => {
    it('should contain all expected movement functions', () => {
      expect(movementFunctions).toHaveProperty('left', moveLeft);
      expect(movementFunctions).toHaveProperty('right', moveRight);
      expect(movementFunctions).toHaveProperty('up', moveUp);
      expect(movementFunctions).toHaveProperty('down', moveDown);
      expect(movementFunctions).toHaveProperty('home', moveHome);
      expect(movementFunctions).toHaveProperty('end', moveEnd);
      expect(movementFunctions).toHaveProperty('wordLeft', moveWordLeft);
      expect(movementFunctions).toHaveProperty('wordRight', moveWordRight);
    });

    it('should dispatch correctly to movement functions', () => {
      const context = createContext({
        visualCursor: [0, 3],
      });

      Object.entries(movementFunctions).forEach(([_direction, func]) => {
        const result = func(context);
        expect(result).toHaveProperty('newVisualRow');
        expect(result).toHaveProperty('newVisualCol');
        expect(result).toHaveProperty('newPreferredCol');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty visual lines', () => {
      const context = createContext({
        visualLines: [''],
        visualCursor: [0, 0],
      });

      Object.values(movementFunctions).forEach((func) => {
        const result = func(context);
        expect(typeof result.newVisualRow).toBe('number');
        expect(typeof result.newVisualCol).toBe('number');
      });
    });

    it('should handle single character lines', () => {
      const context = createContext({
        visualLines: ['a'],
        visualCursor: [0, 0],
      });

      const leftResult = moveLeft(context);
      expect(leftResult.newVisualCol).toBe(0);

      const rightResult = moveRight(context);
      expect(rightResult.newVisualCol).toBe(1);
    });

    it('should handle Unicode characters correctly', () => {
      const context = createContext({
        visualLines: ['hello 🌟 world'],
        visualCursor: [0, 7], // At emoji
      });

      const leftResult = moveLeft(context);
      expect(leftResult.newVisualCol).toBe(6);

      const rightResult = moveRight(context);
      expect(rightResult.newVisualCol).toBe(8);
    });
  });
});
