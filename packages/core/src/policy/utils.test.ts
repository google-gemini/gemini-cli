/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { escapeRegex, buildArgsPatterns } from './utils.js';

describe('policy/utils', () => {
  describe('escapeRegex', () => {
    it('should escape special regex characters', () => {
      const input = '.-*+?^${}()|[]\\ "';
      const escaped = escapeRegex(input);
      expect(escaped).toBe(
        '\\.\\-\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\\\ \\"',
      );
    });

    it('should return the same string if no special characters are present', () => {
      const input = 'abcABC123';
      expect(escapeRegex(input)).toBe(input);
    });
  });

  describe('buildArgsPatterns', () => {
    it('should return argsPattern if provided and no commandPrefix/regex', () => {
      const result = buildArgsPatterns('my-pattern', undefined, undefined);
      expect(result).toEqual(['my-pattern']);
    });

    it('should build pattern from a single commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'ls', undefined);
      expect(result).toEqual(['"command":"ls(?:[\\s"]|\\\\")']);
    });

    it('should build patterns from an array of commandPrefixes', () => {
      const result = buildArgsPatterns(undefined, ['ls', 'cd'], undefined);
      expect(result).toEqual([
        '"command":"ls(?:[\\s"]|\\\\")',
        '"command":"cd(?:[\\s"]|\\\\")',
      ]);
    });

    it('should build pattern from commandRegex', () => {
      const result = buildArgsPatterns(undefined, undefined, 'rm -rf .*');
      expect(result).toEqual(['"command":"rm -rf .*']);
    });

    it('should prioritize commandPrefix over commandRegex and argsPattern', () => {
      const result = buildArgsPatterns('raw', 'prefix', 'regex');
      expect(result).toEqual(['"command":"prefix(?:[\\s"]|\\\\")']);
    });

    it('should prioritize commandRegex over argsPattern if no commandPrefix', () => {
      const result = buildArgsPatterns('raw', undefined, 'regex');
      expect(result).toEqual(['"command":"regex']);
    });

    it('should escape characters in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git checkout -b', undefined);
      expect(result).toEqual([
        '"command":"git\\ checkout\\ \\-b(?:[\\s"]|\\\\")',
      ]);
    });

    it('should correctly escape quotes in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git "fix"', undefined);
      expect(result).toEqual([
        '"command":"git\\ \\\\\\"fix\\\\\\"(?:[\\s"]|\\\\")',
      ]);
    });

    it('should handle undefined correctly when no inputs are provided', () => {
      const result = buildArgsPatterns(undefined, undefined, undefined);
      expect(result).toEqual([undefined]);
    });

    it('should match prefixes followed by JSON escaped quotes', () => {
      // Testing the security fix logic: allowing "echo \"foo\""
      const prefix = 'echo ';
      const patterns = buildArgsPatterns(undefined, prefix, undefined);
      const regex = new RegExp(patterns[0]!);

      // Mimic JSON stringified args
      // echo "foo" -> {"command":"echo \"foo\""}
      const validJsonArgs = '{"command":"echo \\"foo\\""}';
      expect(regex.test(validJsonArgs)).toBe(true);
    });

    it('should NOT match prefixes followed by raw backslashes (security check)', () => {
      // Testing that we blocked the hole: "echo\foo"
      const prefix = 'echo ';
      const patterns = buildArgsPatterns(undefined, prefix, undefined);
      const regex = new RegExp(patterns[0]!);

      // echo\foo -> {"command":"echo\\foo"}
      // In regex matching: "echo " is followed by "\" which is NOT in [\s"] and is not \"
      const attackJsonArgs = '{"command":"echo\\\\foo"}';
      expect(regex.test(attackJsonArgs)).toBe(false);

      // Also validation for "git " matching "git\status"
      const gitPatterns = buildArgsPatterns(undefined, 'git ', undefined);
      const gitRegex = new RegExp(gitPatterns[0]!);
      // git\status -> {"command":"git\\status"}
      const gitAttack = '{"command":"git\\\\status"}';
      expect(gitRegex.test(gitAttack)).toBe(false);
    });
  });
});
