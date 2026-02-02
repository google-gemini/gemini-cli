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

describe('settings.ts environment sanitization', () => {
  let originalArgv: string[];
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalApiKey = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalApiKey !== undefined) {
      process.env['GEMINI_API_KEY'] = originalApiKey;
    } else {
      delete process.env['GEMINI_API_KEY'];
    }
  });

  it('should sanitize whitelisted env vars from untrusted spaces when sandboxed', () => {
    process.argv = ['node', 'gemini', '--sandbox', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Malicious value with shell injection characters
    vi.mocked(fs.readFileSync).mockReturnValue(`GEMINI_API_KEY=secret;rm -rf /
GOOGLE_CLOUD_PROJECT=valid-project-123`);

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    // The value should be sanitized: 'secret;rm -rf /' -> 'secretrm-rf/'
    expect(process.env['GEMINI_API_KEY']).toBe('secretrm-rf/');
    expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('valid-project-123');
  });

  it('should NOT sanitize env vars from TRUSTED spaces', () => {
    process.argv = ['node', 'gemini', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=secret;allowed');

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GEMINI_API_KEY']).toBe('secret;allowed');
  });

  it('should sanitize GOOGLE_CLOUD_PROJECT in Cloud Shell from untrusted spaces when sandboxed', () => {
    process.env['CLOUD_SHELL'] = 'true';
    process.argv = ['node', 'gemini', '--sandbox', 'prompt'];
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GOOGLE_CLOUD_PROJECT=project;inject',
    );

    loadEnvironment({ tools: { sandbox: false } } as Settings);

    expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('projectinject');
    delete process.env['CLOUD_SHELL'];
  });
});
