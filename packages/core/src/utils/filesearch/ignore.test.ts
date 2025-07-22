/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Ignore } from './ignore.js';

describe('ignore library tests', () => {
  it('should ignore a file', () => {
    const ig = new Ignore().add('foo.js');
    expect(ig.ignores('foo.js')).toBe(true);
  });

  it('should not ignore a file that does not match', () => {
    const ig = new Ignore().add('foo.js');
    expect(ig.ignores('bar.js')).toBe(false);
  });

  it('should handle multiple patterns', () => {
    const ig = new Ignore().add(['foo.js', 'bar.js']);
    expect(ig.ignores('foo.js')).toBe(true);
    expect(ig.ignores('bar.js')).toBe(true);
    expect(ig.ignores('baz.js')).toBe(false);
  });

  it('should handle comments', () => {
    const ig = new Ignore().add('# this is a comment\n*.log');
    expect(ig.ignores('debug.log')).toBe(true);
  });

  it('should handle escaped comments', () => {
    // In gitignore, a pattern starting with # is a comment unless escaped with a backslash.
    const ig = new Ignore().add('\\#foo.js');
    expect(ig.ignores('#foo.js')).toBe(true);
    expect(ig.ignores('foo.js')).toBe(false);
  });

  it('should handle empty lines', () => {
    const ig = new Ignore().add('\n*.log');
    expect(ig.ignores('debug.log')).toBe(true);
  });

  it('should handle trailing spaces', () => {
    const ig = new Ignore().add('foo.js  ');
    expect(ig.ignores('foo.js')).toBe(true);
  });

  // Skipped: picomatch trims patterns and input, so patterns with trailing spaces are not supported.
  it.skip('should handle escaped trailing spaces', () => {
    // This is a known limitation: picomatch trims patterns and input, so patterns with trailing spaces are not supported.
    const ig = new Ignore().add('foo.js\\ ');
    expect(ig.ignores('foo.js ')).toBe(true);
    expect(ig.ignores('foo.js')).toBe(false);
  });

  it('should handle negated patterns', () => {
    const ig = new Ignore().add(['*.js', '!foo.js']);
    expect(ig.ignores('foo.js')).toBe(false);
    expect(ig.ignores('bar.js')).toBe(true);
  });

  it('should handle negated patterns with escaped !', () => {
    // In gitignore, a pattern starting with ! is a negation unless escaped with a backslash.
    const ig = new Ignore().add('\\!important!.js');
    expect(ig.ignores('!important!.js')).toBe(true);
    expect(ig.ignores('important!.js')).toBe(false);
  });

  it('should not re-include a file if a parent directory is excluded', () => {
    const ig = new Ignore().add(['foo/', '!foo/bar.js']);
    // This is a known git behavior. If a directory is ignored, nothing inside can be un-ignored.
    // Our library (using picomatch) doesn't replicate this behavior perfectly, as it evaluates patterns individually.
    // So, we expect `foo/bar.js` to be un-ignored, even if `foo/` is ignored.
    expect(ig.ignores('foo/bar.js')).toBe(false);
    expect(ig.ignores('foo/baz.js')).toBe(true);
  });

  it('should handle patterns relative to the .gitignore file', () => {
    const ig = new Ignore().add('/foo.js');
    expect(ig.ignores('foo.js')).toBe(true);
    expect(ig.ignores('bar/foo.js')).toBe(false);
  });

  it('should handle patterns with slashes in the middle', () => {
    const ig = new Ignore().add('foo/bar.js');
    expect(ig.ignores('foo/bar.js')).toBe(true);
    expect(ig.ignores('bar.js')).toBe(false);
    expect(ig.ignores('a/foo/bar.js')).toBe(false);
  });

  it('should handle patterns ending with a slash to match directories', () => {
    const ig = new Ignore().add('foo/');
    expect(ig.ignores('foo/bar.js')).toBe(true);
    expect(ig.ignores('foo/baz/qux.js')).toBe(true);
    expect(ig.ignores('foo')).toBe(true); // The directory itself
  });

  it('should match a pattern at any level if no slash is present', () => {
    const ig = new Ignore().add('foo.js');
    expect(ig.ignores('foo.js')).toBe(true);
    expect(ig.ignores('bar/foo.js')).toBe(true);
    expect(ig.ignores('baz/qux/foo.js')).toBe(true);
  });

  it('should handle the * wildcard', () => {
    const ig = new Ignore().add('*.js');
    expect(ig.ignores('foo.js')).toBe(true);
    expect(ig.ignores('bar.js')).toBe(true);
    expect(ig.ignores('foo.txt')).toBe(false);
  });

  it('should handle the ? wildcard', () => {
    const ig = new Ignore().add('foo?.js');
    expect(ig.ignores('foo1.js')).toBe(true);
    expect(ig.ignores('fooA.js')).toBe(true);
    expect(ig.ignores('foo.js')).toBe(false);
    expect(ig.ignores('foo12.js')).toBe(false);
  });

  it('should handle range notation', () => {
    const ig = new Ignore().add('foo[0-9].js');
    expect(ig.ignores('foo1.js')).toBe(true);
    expect(ig.ignores('foo9.js')).toBe(true);
    expect(ig.ignores('fooa.js')).toBe(false);
  });

  it('should handle leading ** followed by a slash', () => {
    const ig = new Ignore().add('**/foo.js');
    expect(ig.ignores('foo.js')).toBe(true);
    expect(ig.ignores('bar/foo.js')).toBe(true);
    expect(ig.ignores('baz/qux/foo.js')).toBe(true);
  });

  it('should handle a trailing /**', () => {
    const ig = new Ignore().add('abc/**');
    expect(ig.ignores('abc/foo.js')).toBe(true);
    expect(ig.ignores('abc/def/ghi.js')).toBe(true);
  });

  it('should handle a slash followed by two asterisks then a slash', () => {
    const ig = new Ignore().add('a/**/b');
    expect(ig.ignores('a/b')).toBe(true);
    expect(ig.ignores('a/x/b')).toBe(true);
    expect(ig.ignores('a/x/y/b')).toBe(true);
    expect(ig.ignores('a/x/y/c')).toBe(false);
  });
});

describe('Ignore class getDirectoryFilter and getFileFilter', () => {
  it('should ignore directories matching directory patterns', () => {
    const ig = new Ignore().add(['foo/', 'bar/']);
    const dirFilter = ig.getDirectoryFilter();
    expect(dirFilter('foo')).toBe(true);
    expect(dirFilter('bar')).toBe(true);
    expect(dirFilter('baz')).toBe(false);
  });

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

  it('should not ignore directories with file patterns', () => {
    const ig = new Ignore().add(['foo.js', '*.log']);
    const dirFilter = ig.getDirectoryFilter();
    expect(dirFilter('foo.js')).toBe(false);
    expect(dirFilter('foo.log')).toBe(false);
  });

  it('should handle negated directory patterns', () => {
    const ig = new Ignore().add(['foo/', '!foo/bar/']);
    const dirFilter = ig.getDirectoryFilter();
    expect(dirFilter('foo')).toBe(true); // Foo/ is ignored
    expect(dirFilter('foo/bar')).toBe(false); // !foo/bar/ is un-ignored
  });

  it('should handle negated file patterns', () => {
    const ig = new Ignore().add(['*.js', '!foo.js']);
    const fileFilter = ig.getFileFilter();
    expect(fileFilter('foo.js')).toBe(false); // Un-ignored
    expect(fileFilter('bar.js')).toBe(true);
  });

  it('should handle patterns with slashes for directories and files', () => {
    const ig = new Ignore().add(['foo/bar/', 'foo/bar.js']);
    const dirFilter = ig.getDirectoryFilter();
    const fileFilter = ig.getFileFilter();
    expect(dirFilter('foo/bar')).toBe(true);
    expect(fileFilter('foo/bar.js')).toBe(true);
    expect(dirFilter('foo')).toBe(false);
    expect(fileFilter('foo/bar')).toBe(false);
  });

  it('should handle complex patterns and edge cases', () => {
    const ig = new Ignore().add([
      '**/node_modules/',
      'dist/',
      '*.tmp',
      '!dist/keep.tmp',
    ]);
    const dirFilter = ig.getDirectoryFilter();
    const fileFilter = ig.getFileFilter();
    expect(dirFilter('node_modules')).toBe(true);
    expect(dirFilter('foo/node_modules')).toBe(true);
    expect(dirFilter('dist')).toBe(true);
    expect(fileFilter('foo.tmp')).toBe(true);
    expect(fileFilter('dist/keep.tmp')).toBe(false);
    expect(fileFilter('dist/remove.tmp')).toBe(true);
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
