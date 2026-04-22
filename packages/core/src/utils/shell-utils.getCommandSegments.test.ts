/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getCommandSegments,
  initializeShellParsers,
  isArgumentRestrictedCommand,
} from './shell-utils.js';

describe('getCommandSegments', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  it('should include first positional argument for restricted commands', () => {
    expect(getCommandSegments('git status')).toEqual([['git', 'status']]);
    expect(getCommandSegments('npm install')).toEqual([['npm', 'install']]);
    expect(getCommandSegments('rm -rf /tmp/foo')).toEqual([['rm', '/tmp/foo']]);
    expect(getCommandSegments('node script.js')).toEqual([
      ['node', 'script.js'],
    ]);
  });

  it('should only include the binary for unrestricted commands', () => {
    expect(getCommandSegments('grep pattern file.txt')).toEqual([['grep']]);
    expect(getCommandSegments('sed "s/a/b/g" file.txt')).toEqual([['sed']]);
    expect(getCommandSegments('ls -la /tmp')).toEqual([['ls']]);
    expect(getCommandSegments('cat file.txt')).toEqual([['cat']]);
    expect(getCommandSegments('head -n 10 file.txt')).toEqual([['head']]);
    expect(getCommandSegments('rg "search term" .')).toEqual([['rg']]);
  });

  it('should handle chained commands with mixed sensitivity', () => {
    expect(
      getCommandSegments('grep pattern file.txt && git add file.txt'),
    ).toEqual([['grep'], ['git', 'add']]);
  });

  it('should handle pipes', () => {
    expect(getCommandSegments('ls | grep pattern')).toEqual([['ls'], ['grep']]);
  });

  it('should handle subshells', () => {
    // Current behavior for subshells might vary depending on how they are parsed,
    // but we expect at least the outer commands to be captured.
    expect(getCommandSegments('(cd /tmp && ls)')).toEqual([['cd'], ['ls']]);
  });

  it('should ignore flags but keep positional arguments for restricted commands', () => {
    expect(getCommandSegments('git --no-pager log --oneline')).toEqual([
      ['git', 'log'],
    ]);
    expect(getCommandSegments('npm run test -- --grep="foo"')).toEqual([
      ['npm', 'run'],
    ]);
  });
});

describe('isArgumentRestrictedCommand', () => {
  it('should return true for naked restricted commands', () => {
    expect(isArgumentRestrictedCommand(['git'])).toBe(true);
    expect(isArgumentRestrictedCommand(['rm'])).toBe(true);
    expect(isArgumentRestrictedCommand(['node'])).toBe(true);
  });

  it('should return false for restricted commands with arguments', () => {
    expect(isArgumentRestrictedCommand(['git', 'status'])).toBe(false);
    expect(isArgumentRestrictedCommand(['rm', '/tmp'])).toBe(false);
  });

  it('should return false for unrestricted commands (naked or not)', () => {
    expect(isArgumentRestrictedCommand(['grep'])).toBe(false);
    expect(isArgumentRestrictedCommand(['ls'])).toBe(false);
    expect(isArgumentRestrictedCommand(['cd'])).toBe(false);
    expect(isArgumentRestrictedCommand(['grep', 'foo'])).toBe(false);
  });
});
