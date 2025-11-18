/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { server } from './msw.js';

describe('msw', () => {
  describe('server', () => {
    it('should be defined', () => {
      expect(server).toBeDefined();
    });

    it('should be an object', () => {
      expect(typeof server).toBe('object');
      expect(server).not.toBeNull();
    });

    it('should have listen method', () => {
      expect(server.listen).toBeDefined();
      expect(typeof server.listen).toBe('function');
    });

    it('should have close method', () => {
      expect(server.close).toBeDefined();
      expect(typeof server.close).toBe('function');
    });

    it('should have use method', () => {
      expect(server.use).toBeDefined();
      expect(typeof server.use).toBe('function');
    });

    it('should have resetHandlers method', () => {
      expect(server.resetHandlers).toBeDefined();
      expect(typeof server.resetHandlers).toBe('function');
    });

    it('should have restoreHandlers method', () => {
      expect(server.restoreHandlers).toBeDefined();
      expect(typeof server.restoreHandlers).toBe('function');
    });

    it('should have listHandlers method', () => {
      expect(server.listHandlers).toBeDefined();
      expect(typeof server.listHandlers).toBe('function');
    });
  });
});
