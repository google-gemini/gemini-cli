/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tryRealpath } from './fsUtils.js';

describe('fsUtils', () => {
  describe('tryRealpath', () => {
    it('should throw error for paths with null bytes', () => {
      expect(() => tryRealpath('/etc/passwd\0/foo')).toThrow('Invalid path');
    });

    it('should resolve existing paths', () => {
      // /etc should exist on linux
      const resolved = tryRealpath('/etc');
      expect(resolved).toBe('/etc');
    });

    it('should handle non-existent paths by resolving parent', () => {
      const resolved = tryRealpath('/etc/non-existent-file-12345');
      expect(resolved).toBe('/etc/non-existent-file-12345');
    });
  });
});
