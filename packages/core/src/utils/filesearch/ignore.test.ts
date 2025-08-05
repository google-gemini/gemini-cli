/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Ignore } from './ignore.js';

describe('Ignore', () => {
  describe('getDirectoryFilter', () => {
    it('should ignore directories matching directory patterns', () => {
      const ig = new Ignore().add(['foo/', 'bar/']);
      const dirFilter = ig.getDirectoryFilter();
      expect(dirFilter('foo/')).toBe(true);
      expect(dirFilter('bar/')).toBe(true);
      expect(dirFilter('baz/')).toBe(false);
    });

    it('should not ignore directories with file patterns', () => {
      const ig = new Ignore().add(['foo.js', '*.log']);
      const dirFilter = ig.getDirectoryFilter();
      expect(dirFilter('foo.js')).toBe(false);
      expect(dirFilter('foo.log')).toBe(false);
    });
  });

  describe('getFileFilter', () => {
    it('should not ignore files with directory patterns', () => {
      const ig = new Ignore().add(['foo/', 'bar/']);
      const fileFilter = ig.getFileFilter();
      expect(fileFilter('foo')).toBe(false);
      expect(fileFilter('foo/file.txt')).toBe(false);
    });

    it('should ignore files matching file patterns', () => {
      const ig = new Ignore().add(['*.log', 'foo.js']);
      const fileFilter = ig.getFileFilter();
      expect(fileFilter('foo.log')).toBe(true);
      expect(fileFilter('foo.js')).toBe(true);
      expect(fileFilter('bar.txt')).toBe(false);
    });
  });

  it('should accumulate patterns across multiple add() calls', () => {
    const ig = new Ignore().add('foo.js');
    ig.add('bar.js');
    const fileFilter = ig.getFileFilter();
    expect(fileFilter('foo.js')).toBe(true);
    expect(fileFilter('bar.js')).toBe(true);
    expect(fileFilter('baz.js')).toBe(false);
  });

  it('should return a stable and consistent fingerprint', () => {
    const ig1 = new Ignore().add(['foo', '!bar']);
    const ig2 = new Ignore().add('foo\n!bar');

    // Fingerprints should be identical for the same rules.
    expect(ig1.getFingerprint()).toBe(ig2.getFingerprint());

    // Adding a new rule should change the fingerprint.
    ig2.add('baz');
    expect(ig1.getFingerprint()).not.toBe(ig2.getFingerprint());
  });
});
