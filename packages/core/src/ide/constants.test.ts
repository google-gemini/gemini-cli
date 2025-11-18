/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  GEMINI_CLI_COMPANION_EXTENSION_NAME,
  IDE_MAX_OPEN_FILES,
  IDE_MAX_SELECTED_TEXT_LENGTH,
  IDE_REQUEST_TIMEOUT_MS,
} from './constants.js';

describe('IDE constants', () => {
  describe('GEMINI_CLI_COMPANION_EXTENSION_NAME', () => {
    it('should be defined as "Gemini CLI Companion"', () => {
      expect(GEMINI_CLI_COMPANION_EXTENSION_NAME).toBe('Gemini CLI Companion');
    });

    it('should be a non-empty string', () => {
      expect(typeof GEMINI_CLI_COMPANION_EXTENSION_NAME).toBe('string');
      expect(GEMINI_CLI_COMPANION_EXTENSION_NAME.length).toBeGreaterThan(0);
    });
  });

  describe('IDE_MAX_OPEN_FILES', () => {
    it('should be defined as 10', () => {
      expect(IDE_MAX_OPEN_FILES).toBe(10);
    });

    it('should be a positive number', () => {
      expect(typeof IDE_MAX_OPEN_FILES).toBe('number');
      expect(IDE_MAX_OPEN_FILES).toBeGreaterThan(0);
    });
  });

  describe('IDE_MAX_SELECTED_TEXT_LENGTH', () => {
    it('should be defined as 16384 (16 KiB)', () => {
      expect(IDE_MAX_SELECTED_TEXT_LENGTH).toBe(16384);
    });

    it('should be a positive number', () => {
      expect(typeof IDE_MAX_SELECTED_TEXT_LENGTH).toBe('number');
      expect(IDE_MAX_SELECTED_TEXT_LENGTH).toBeGreaterThan(0);
    });

    it('should equal 16 * 1024 (16 KiB)', () => {
      expect(IDE_MAX_SELECTED_TEXT_LENGTH).toBe(16 * 1024);
    });
  });

  describe('IDE_REQUEST_TIMEOUT_MS', () => {
    it('should be defined as 600000 (10 minutes)', () => {
      expect(IDE_REQUEST_TIMEOUT_MS).toBe(10 * 60 * 1000);
    });

    it('should be a positive number', () => {
      expect(typeof IDE_REQUEST_TIMEOUT_MS).toBe('number');
      expect(IDE_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('should equal 10 minutes in milliseconds', () => {
      const tenMinutesInMs = 10 * 60 * 1000;
      expect(IDE_REQUEST_TIMEOUT_MS).toBe(tenMinutesInMs);
    });
  });

  describe('constant relationships', () => {
    it('should have reasonable timeout relative to file limits', () => {
      // Just verify timeout is substantial (> 1 minute)
      expect(IDE_REQUEST_TIMEOUT_MS).toBeGreaterThan(60 * 1000);
    });

    it('should have reasonable text length limit', () => {
      // Verify text limit is substantial but not excessive (between 1KB and 1MB)
      expect(IDE_MAX_SELECTED_TEXT_LENGTH).toBeGreaterThan(1024);
      expect(IDE_MAX_SELECTED_TEXT_LENGTH).toBeLessThan(1024 * 1024);
    });
  });
});
