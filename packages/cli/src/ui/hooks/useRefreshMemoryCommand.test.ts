/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { REFRESH_MEMORY_COMMAND_NAME } from './useRefreshMemoryCommand.js';

describe('useRefreshMemoryCommand', () => {
  describe('REFRESH_MEMORY_COMMAND_NAME', () => {
    it('should be defined as "/refreshmemory"', () => {
      expect(REFRESH_MEMORY_COMMAND_NAME).toBe('/refreshmemory');
    });

    it('should be a non-empty string', () => {
      expect(typeof REFRESH_MEMORY_COMMAND_NAME).toBe('string');
      expect(REFRESH_MEMORY_COMMAND_NAME.length).toBeGreaterThan(0);
    });

    it('should start with forward slash', () => {
      expect(REFRESH_MEMORY_COMMAND_NAME).toMatch(/^\//);
    });

    it('should be lowercase', () => {
      expect(REFRESH_MEMORY_COMMAND_NAME).toBe(
        REFRESH_MEMORY_COMMAND_NAME.toLowerCase(),
      );
    });

    it('should not contain spaces', () => {
      expect(REFRESH_MEMORY_COMMAND_NAME).not.toMatch(/\s/);
    });
  });
});
