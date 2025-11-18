/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  BOX_PADDING_X,
  UI_WIDTH,
  STREAM_DEBOUNCE_MS,
  SHELL_COMMAND_NAME,
  SHELL_NAME,
  TOOL_STATUS,
} from './constants.js';

describe('UI constants', () => {
  describe('BOX_PADDING_X', () => {
    it('should be defined as 1', () => {
      expect(BOX_PADDING_X).toBe(1);
    });

    it('should be a positive number', () => {
      expect(BOX_PADDING_X).toBeGreaterThan(0);
    });
  });

  describe('UI_WIDTH', () => {
    it('should be approximately 63', () => {
      expect(UI_WIDTH).toBe(63);
    });

    it('should be a positive number', () => {
      expect(UI_WIDTH).toBeGreaterThan(0);
    });

    it('should include padding and border calculations', () => {
      // UI_WIDTH = 59 (art) + 1*2 (padding) + 1*2 (border) = 63
      expect(UI_WIDTH).toBe(59 + BOX_PADDING_X * 2 + 1 * 2);
    });
  });

  describe('STREAM_DEBOUNCE_MS', () => {
    it('should be defined as 100', () => {
      expect(STREAM_DEBOUNCE_MS).toBe(100);
    });

    it('should be a positive number', () => {
      expect(STREAM_DEBOUNCE_MS).toBeGreaterThan(0);
    });

    it('should be in milliseconds', () => {
      expect(STREAM_DEBOUNCE_MS).toBeLessThan(1000);
    });
  });

  describe('SHELL_COMMAND_NAME', () => {
    it('should be defined as "Shell Command"', () => {
      expect(SHELL_COMMAND_NAME).toBe('Shell Command');
    });

    it('should be a non-empty string', () => {
      expect(typeof SHELL_COMMAND_NAME).toBe('string');
      expect(SHELL_COMMAND_NAME.length).toBeGreaterThan(0);
    });

    it('should contain the word "Shell"', () => {
      expect(SHELL_COMMAND_NAME).toContain('Shell');
    });
  });

  describe('SHELL_NAME', () => {
    it('should be defined as "Shell"', () => {
      expect(SHELL_NAME).toBe('Shell');
    });

    it('should be a non-empty string', () => {
      expect(typeof SHELL_NAME).toBe('string');
      expect(SHELL_NAME.length).toBeGreaterThan(0);
    });

    it('should be different from SHELL_COMMAND_NAME', () => {
      expect(SHELL_NAME).not.toBe(SHELL_COMMAND_NAME);
    });
  });

  describe('TOOL_STATUS', () => {
    it('should have SUCCESS status', () => {
      expect(TOOL_STATUS.SUCCESS).toBe('✓');
    });

    it('should have PENDING status', () => {
      expect(TOOL_STATUS.PENDING).toBe('o');
    });

    it('should have EXECUTING status', () => {
      expect(TOOL_STATUS.EXECUTING).toBe('⊷');
    });

    it('should have CONFIRMING status', () => {
      expect(TOOL_STATUS.CONFIRMING).toBe('?');
    });

    it('should have CANCELED status', () => {
      expect(TOOL_STATUS.CANCELED).toBe('-');
    });

    it('should have ERROR status', () => {
      expect(TOOL_STATUS.ERROR).toBe('x');
    });

    it('should have exactly 6 status symbols', () => {
      const statusKeys = Object.keys(TOOL_STATUS);
      expect(statusKeys).toHaveLength(6);
    });

    it('should use single character symbols', () => {
      const statusValues = Object.values(TOOL_STATUS);
      statusValues.forEach((value) => {
        expect(value.length).toBeGreaterThanOrEqual(1);
        expect(value.length).toBeLessThanOrEqual(2);
      });
    });

    it('should have unique symbols', () => {
      const statusValues = Object.values(TOOL_STATUS);
      const uniqueValues = new Set(statusValues);
      expect(uniqueValues.size).toBe(statusValues.length);
    });

    it('should be readonly object', () => {
      expect(() => {
        (TOOL_STATUS as { SUCCESS: string }).SUCCESS = 'changed';
      }).toThrow();
    });
  });

  describe('constant relationships', () => {
    it('should have UI_WIDTH greater than BOX_PADDING_X', () => {
      expect(UI_WIDTH).toBeGreaterThan(BOX_PADDING_X);
    });

    it('should have reasonable debounce time', () => {
      expect(STREAM_DEBOUNCE_MS).toBeGreaterThan(0);
      expect(STREAM_DEBOUNCE_MS).toBeLessThan(1000);
    });
  });
});
