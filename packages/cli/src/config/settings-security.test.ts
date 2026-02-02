/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { loadEnvironment, type Settings } from './settings.js';
import { isWorkspaceTrusted } from './trustedFolders.js';

vi.mock('node:fs');
vi.mock('./trustedFolders.js');

describe('settings.ts security regression tests', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    // Clear relevant env vars
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_LOCATION'];
    delete process.env['CLOUD_SHELL'];
    delete process.env['MALICIOUS_VAR'];
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  it('should strictly enforce whitelist in untrusted/sandboxed mode', () => {
    process.argv = ['node', 'gemini', '-s', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().endsWith('.env'),
    );
    vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=secret-key
MALICIOUS_VAR=should-be-ignored
GOOGLE_API_KEY=another-secret
    `);

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GEMINI_API_KEY']).toBe('secret-key');
    expect(process.env['GOOGLE_API_KEY']).toBe('another-secret');
    expect(process.env['MALICIOUS_VAR']).toBeUndefined();
  });

  it('should sanitize shell injection characters in whitelisted env vars in untrusted mode', () => {
    process.argv = ['node', 'gemini', '--sandbox', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().endsWith('.env'),
    );

    // Testing various shell injection vectors
    const maliciousPayload = 'key-$(whoami)-`id`-&|;><*?[]{}';
    vi.mocked(fs.readFileSync).mockReturnValue(
      `GEMINI_API_KEY=${maliciousPayload}`,
    );

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    // sanitizeEnvVar: value.replace(/[^a-zA-Z0-9\-_./]/g, '')
    // Results: key-whoami-id- (only - alphanumeric are allowed from this payload)
    expect(process.env['GEMINI_API_KEY']).toBe('key-whoami-id-');
  });

  it('should allow . and / in whitelisted env vars but sanitize other characters in untrusted mode', () => {
    process.argv = ['node', 'gemini', '--sandbox', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().endsWith('.env'),
    );

    const complexPayload = 'secret-123/path.to/somewhere;rm -rf /';
    vi.mocked(fs.readFileSync).mockReturnValue(
      `GEMINI_API_KEY=${complexPayload}`,
    );

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GEMINI_API_KEY']).toBe(
      'secret-123/path.to/somewhererm-rf/',
    );
  });

  it('should ignore sandbox flags if they appear after --', () => {
    // If -s is after --, it should NOT trigger sandboxed mode if we are untrusted.
    // If not sandboxed and untrusted, loadEnvironment returns early and loads NOTHING.
    process.argv = ['node', 'gemini', '--', '-s', 'some prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().endsWith('.env'),
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=secret');

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GEMINI_API_KEY']).toBeUndefined();
  });

  it('should NOT be tricked by positional arguments that look like flags', () => {
    process.argv = ['node', 'gemini', 'my -s prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().endsWith('.env'),
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=secret');

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    // 'my -s prompt' is not '-s'.
    expect(process.env['GEMINI_API_KEY']).toBeUndefined();
  });

  it('should handle Cloud Shell special defaults securely when untrusted', () => {
    process.env['CLOUD_SHELL'] = 'true';
    process.argv = ['node', 'gemini', '-s', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });

    // No .env file
    vi.mocked(fs.existsSync).mockReturnValue(false);

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('cloudshell-gca');
  });

  it('should sanitize GOOGLE_CLOUD_PROJECT in Cloud Shell when loaded from .env in untrusted mode', () => {
    process.env['CLOUD_SHELL'] = 'true';
    process.argv = ['node', 'gemini', '-s', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GOOGLE_CLOUD_PROJECT=attacker-project;inject',
    );

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('attacker-projectinject');
  });

  it('should load environment variables normally when workspace is TRUSTED even if "sandboxed"', () => {
    process.argv = ['node', 'gemini', '-s', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      path.toString().endsWith('.env'),
    );
    vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=un-sanitized;key!
MALICIOUS_VAR=allowed-because-trusted
    `);

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GEMINI_API_KEY']).toBe('un-sanitized;key!');
    expect(process.env['MALICIOUS_VAR']).toBe('allowed-because-trusted');
  });
});
