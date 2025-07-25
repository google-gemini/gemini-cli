/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBinary } from './textUtils';

describe('textUtils', () => {
  describe('isBinary', () => {
    it('should return true for a buffer containing a null byte', () => {
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x1a, 0x0a, 0x00,
      ]);
      expect(isBinary(buffer)).toBe(true);
    });

    it('should return false for a buffer containing only text', () => {
      const buffer = Buffer.from('This is a test string.');
      expect(isBinary(buffer)).toBe(false);
    });

    it('should return false for an empty buffer', () => {
      const buffer = Buffer.from([]);
      expect(isBinary(buffer)).toBe(false);
    });

    it('should return false for a null or undefined buffer', () => {
      expect(isBinary(null)).toBe(false);
      expect(isBinary(undefined)).toBe(false);
    });

    it('should only check the sample size', () => {
      const longBufferWithNullByteAtEnd = Buffer.concat([
        Buffer.from('a'.repeat(1024)),
        Buffer.from([0x00]),
      ]);
      expect(isBinary(longBufferWithNullByteAtEnd, 512)).toBe(false);
    });
  });
});
