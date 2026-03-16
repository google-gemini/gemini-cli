/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { extractCommandsFromAst } from './shell-ast-parser.js';

describe('shell-ast-parser', () => {
  it('extracts a simple command', () => {
    const cmds = extractCommandsFromAst('echo "hello"');
    expect(cmds).toEqual(['echo hello']);
  });

  it('extracts commands from a pipeline', () => {
    const cmds = extractCommandsFromAst('echo "hello" | grep h');
    expect(cmds).toEqual(['echo hello', 'grep h']);
  });

  it('extracts commands from lists', () => {
    const cmds = extractCommandsFromAst('mkdir foo && cd foo || echo "failed" ; ls');
    expect(cmds).toEqual(['mkdir foo', 'cd foo', 'echo failed', 'ls']);
  });

  it('extracts commands from subshells', () => {
    const cmds = extractCommandsFromAst('echo $(ls -la) && (cd /tmp && pwd)');
    // Depending on reconstruction, we should at least see the commands
    expect(cmds).toContain('ls -la');
    expect(cmds).toContain('cd /tmp');
    expect(cmds).toContain('pwd');
    expect(cmds).toContain('echo $(ls -la)'); 
  });

  it('returns empty array on syntax error', () => {
    const cmds = extractCommandsFromAst('echo "unterminated');
    expect(cmds).toEqual([]);
  });

  it('handles empty strings gracefully', () => {
    expect(extractCommandsFromAst('')).toEqual([]);
    expect(extractCommandsFromAst('   ')).toEqual([]);
  });
});
