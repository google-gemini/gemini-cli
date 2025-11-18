/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  SCREEN_READER_USER_PREFIX,
  SCREEN_READER_MODEL_PREFIX,
  SCREEN_READER_LOADING,
  SCREEN_READER_RESPONDING,
} from './textConstants.js';

describe('textConstants', () => {
  describe('SCREEN_READER_USER_PREFIX', () => {
    it('should be defined as "User: "', () => {
      expect(SCREEN_READER_USER_PREFIX).toBe('User: ');
    });

    it('should be a non-empty string', () => {
      expect(typeof SCREEN_READER_USER_PREFIX).toBe('string');
      expect(SCREEN_READER_USER_PREFIX.length).toBeGreaterThan(0);
    });

    it('should end with a space', () => {
      expect(SCREEN_READER_USER_PREFIX).toMatch(/\s$/);
    });
  });

  describe('SCREEN_READER_MODEL_PREFIX', () => {
    it('should be defined as "Model: "', () => {
      expect(SCREEN_READER_MODEL_PREFIX).toBe('Model: ');
    });

    it('should be a non-empty string', () => {
      expect(typeof SCREEN_READER_MODEL_PREFIX).toBe('string');
      expect(SCREEN_READER_MODEL_PREFIX.length).toBeGreaterThan(0);
    });

    it('should end with a space', () => {
      expect(SCREEN_READER_MODEL_PREFIX).toMatch(/\s$/);
    });
  });

  describe('SCREEN_READER_LOADING', () => {
    it('should be defined as "loading"', () => {
      expect(SCREEN_READER_LOADING).toBe('loading');
    });

    it('should be a non-empty string', () => {
      expect(typeof SCREEN_READER_LOADING).toBe('string');
      expect(SCREEN_READER_LOADING.length).toBeGreaterThan(0);
    });

    it('should be lowercase', () => {
      expect(SCREEN_READER_LOADING).toBe(SCREEN_READER_LOADING.toLowerCase());
    });
  });

  describe('SCREEN_READER_RESPONDING', () => {
    it('should be defined as "responding"', () => {
      expect(SCREEN_READER_RESPONDING).toBe('responding');
    });

    it('should be a non-empty string', () => {
      expect(typeof SCREEN_READER_RESPONDING).toBe('string');
      expect(SCREEN_READER_RESPONDING.length).toBeGreaterThan(0);
    });

    it('should be lowercase', () => {
      expect(SCREEN_READER_RESPONDING).toBe(
        SCREEN_READER_RESPONDING.toLowerCase(),
      );
    });
  });

  describe('constant relationships', () => {
    it('should have both prefixes end with the same separator', () => {
      const userSeparator = SCREEN_READER_USER_PREFIX.slice(-2);
      const modelSeparator = SCREEN_READER_MODEL_PREFIX.slice(-2);
      expect(userSeparator).toBe(modelSeparator);
    });

    it('should have different prefixes for user and model', () => {
      expect(SCREEN_READER_USER_PREFIX).not.toBe(SCREEN_READER_MODEL_PREFIX);
    });

    it('should have different state labels', () => {
      expect(SCREEN_READER_LOADING).not.toBe(SCREEN_READER_RESPONDING);
    });

    it('should have all constants defined', () => {
      expect(SCREEN_READER_USER_PREFIX).toBeDefined();
      expect(SCREEN_READER_MODEL_PREFIX).toBeDefined();
      expect(SCREEN_READER_LOADING).toBeDefined();
      expect(SCREEN_READER_RESPONDING).toBeDefined();
    });
  });
});
