/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { loadEnvironment, type Settings, sanitizeEnvVar } from './settings.js';
import { isWorkspaceTrusted } from './trustedFolders.js';

vi.mock('node:fs');
vi.mock('./trustedFolders.js');

describe('settings.ts security', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };

    // Clear relevant env vars
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['FOO'];

    vi.resetAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  describe('sandbox detection', () => {
    it('should detect sandbox when -s is a real flag', () => {
      process.argv = ['node', 'gemini', '-s', 'some prompt'];
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        'FOO=bar\nGEMINI_API_KEY=secret',
      );

      loadEnvironment({ tools: { sandbox: false } } as Settings);

      // If sandboxed and untrusted, FOO should NOT be loaded, but GEMINI_API_KEY should be.
      expect(process.env['FOO']).toBeUndefined();
      expect(process.env['GEMINI_API_KEY']).toBe('secret');
    });

    it('should NOT detect sandbox when -s is after --', () => {
      process.argv = ['node', 'gemini', '--', 'how to use -s flag'];
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('FOO=bar');

      loadEnvironment({ tools: { sandbox: false } } as Settings);

      // If NOT sandboxed and untrusted, it should return early and load NOTHING.
      expect(process.env['FOO']).toBeUndefined();
    });

    it('should NOT detect sandbox when -s is a positional argument (naive check bypass)', () => {
      process.argv = ['node', 'gemini', 'tell me about -s flag'];
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('FOO=bar');

      loadEnvironment({ tools: { sandbox: false } } as Settings);

      // If NOT sandboxed and untrusted, it should return early.
      expect(process.env['FOO']).toBeUndefined();
    });
  });

  describe('env var sanitization', () => {
    it('should sanitize whitelisted variables from untrusted sources', () => {
      process.argv = ['node', 'gemini', '-s', 'prompt'];
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Malicious payload in whitelisted variable
      vi.mocked(fs.readFileSync).mockReturnValue(
        'GOOGLE_CLOUD_PROJECT=$(calc)\nGEMINI_API_KEY=AIza;rm -rf /',
      );

      loadEnvironment({ tools: { sandbox: false } } as Settings);

      // Should be sanitized: $(calc) -> calc, AIza;rm -rf / -> AIza-rf/
      // Wait, let's check the regex: [^a-zA-Z0-9\-_./]
      // $(calc) -> calc
      // AIza;rm -rf / -> AIza-rf/  (space and ; removed)

      expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('calc');
      expect(process.env['GEMINI_API_KEY']).toBe('AIzarm-rf/');
    });

    it('should NOT sanitize variables from trusted sources', () => {
      process.argv = ['node', 'gemini', 'prompt'];
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: true,
        source: 'file',
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue('FOO=$(bar)');

      loadEnvironment({ tools: { sandbox: false } } as Settings);

      // Trusted source, no sanitization
      expect(process.env['FOO']).toBe('$(bar)');
    });

    it('should sanitize value in sanitizeEnvVar helper', () => {
      expect(sanitizeEnvVar('$(calc)')).toBe('calc');
      expect(sanitizeEnvVar('`rm -rf /`')).toBe('rm-rf/');
      expect(sanitizeEnvVar('normal-project-123')).toBe('normal-project-123');
      expect(sanitizeEnvVar('us-central1')).toBe('us-central1');
    });
  });
});
