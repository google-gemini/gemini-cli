/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PARENT_PROCESS_TLS_ENV_ALLOWLIST,
  parseSimpleEnv,
  loadTlsEnvFromGemini,
} from './index.js';

describe('parseSimpleEnv', () => {
  it('parses simple KEY=VALUE lines', () => {
    const parsed = parseSimpleEnv('FOO=bar\nBAZ=qux\n');
    expect(parsed).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('strips matching double and single quotes', () => {
    const parsed = parseSimpleEnv(
      ['FOO="hello world"', "BAR='spaced value'", 'BAZ=raw'].join('\n'),
    );
    expect(parsed).toEqual({
      FOO: 'hello world',
      BAR: 'spaced value',
      BAZ: 'raw',
    });
  });

  it('ignores blank lines and # comments', () => {
    const parsed = parseSimpleEnv(
      ['# top comment', '', 'FOO=bar', 'BAZ=qux'].join('\n'),
    );
    expect(parsed.FOO).toBe('bar');
    expect(parsed.BAZ).toBe('qux');
  });

  it('supports the optional `export` prefix', () => {
    const parsed = parseSimpleEnv(
      'export NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem',
    );
    expect(parsed).toEqual({
      NODE_EXTRA_CA_CERTS: '/etc/ssl/cert.pem',
    });
  });

  it('strips inline `#` comments on unquoted values only', () => {
    const parsed = parseSimpleEnv(
      ['FOO=bar # trailing', 'BAZ="quoted # stays"'].join('\n'),
    );
    expect(parsed.FOO).toBe('bar');
    expect(parsed.BAZ).toBe('quoted # stays');
  });

  it('silently drops malformed lines', () => {
    const parsed = parseSimpleEnv(
      ['=novalue', 'no equals sign', '9BAD_KEY=nope', 'GOOD=yes'].join('\n'),
    );
    expect(parsed).toEqual({ GOOD: 'yes' });
  });

  it('handles CRLF line endings', () => {
    const parsed = parseSimpleEnv('FOO=bar\r\nBAZ=qux\r\n');
    expect(parsed).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('preserves `=` inside values', () => {
    const parsed = parseSimpleEnv('URL=https://example.com/?a=1&b=2');
    expect(parsed.URL).toBe('https://example.com/?a=1&b=2');
  });
});

describe('loadTlsEnvFromGemini', () => {
  let tmpRoot: string;
  let fakeHome: string;

  beforeEach(() => {
    tmpRoot = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-tls-env-')),
    );
    fakeHome = path.join(tmpRoot, 'home');
    fs.mkdirSync(fakeHome, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeHomeEnv(contents: string) {
    const geminiDir = path.join(fakeHome, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });
    fs.writeFileSync(path.join(geminiDir, '.env'), contents);
  }

  it('reads NODE_EXTRA_CA_CERTS from $HOME/.gemini/.env', async () => {
    writeHomeEnv('NODE_EXTRA_CA_CERTS=/corp/ca.pem\n');
    const injected = await loadTlsEnvFromGemini({}, { homeDir: fakeHome });
    expect(injected).toEqual({ NODE_EXTRA_CA_CERTS: '/corp/ca.pem' });
  });

  it('reads multiple allowlisted vars from the same file', async () => {
    writeHomeEnv(
      [
        'NODE_EXTRA_CA_CERTS=/corp/ca.pem',
        'HTTPS_PROXY=http://proxy.example:8080',
        '',
      ].join('\n'),
    );
    const injected = await loadTlsEnvFromGemini({}, { homeDir: fakeHome });
    expect(injected.NODE_EXTRA_CA_CERTS).toBe('/corp/ca.pem');
    expect(injected.HTTPS_PROXY).toBe('http://proxy.example:8080');
  });

  it('does NOT override keys already set in currentEnv (shell wins)', async () => {
    writeHomeEnv('NODE_EXTRA_CA_CERTS=/home/ca.pem\n');
    const injected = await loadTlsEnvFromGemini(
      { NODE_EXTRA_CA_CERTS: '/shell/ca.pem' },
      { homeDir: fakeHome },
    );
    expect(injected).toEqual({});
  });

  it('skips non-allowlisted keys (e.g. GEMINI_API_KEY, FOO)', async () => {
    writeHomeEnv(
      [
        'NODE_EXTRA_CA_CERTS=/corp/ca.pem',
        'FOO=bar',
        'GEMINI_API_KEY=sekret',
        '',
      ].join('\n'),
    );
    const injected = await loadTlsEnvFromGemini({}, { homeDir: fakeHome });
    expect(injected).toEqual({ NODE_EXTRA_CA_CERTS: '/corp/ca.pem' });
    expect(injected).not.toHaveProperty('FOO');
    expect(injected).not.toHaveProperty('GEMINI_API_KEY');
  });

  it('returns empty object when no home .env file exists', async () => {
    const injected = await loadTlsEnvFromGemini({}, { homeDir: fakeHome });
    expect(injected).toEqual({});
  });

  it('does NOT read project-local .gemini/.env (trust-gated; child handles it)', async () => {
    // Create a project .gemini/.env with a TLS var; the parent must NOT
    // load it (because the parent cannot cheaply verify workspace trust).
    // The child's loadEnvironment() picks up project files under its full
    // trust model — we only assert the parent helper stays HOME-only.
    const fakeCwd = path.join(tmpRoot, 'project');
    fs.mkdirSync(path.join(fakeCwd, '.gemini'), { recursive: true });
    fs.writeFileSync(
      path.join(fakeCwd, '.gemini', '.env'),
      'NODE_EXTRA_CA_CERTS=/project/ca.pem\n',
    );
    const previousCwd = process.cwd();
    try {
      process.chdir(fakeCwd);
      const injected = await loadTlsEnvFromGemini({}, { homeDir: fakeHome });
      expect(injected).toEqual({});
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('tolerates malformed .env content without throwing', async () => {
    writeHomeEnv(
      'this is not valid dotenv content !@#$\nNODE_EXTRA_CA_CERTS=/corp/ca.pem\n',
    );
    const injected = await loadTlsEnvFromGemini({}, { homeDir: fakeHome });
    expect(injected.NODE_EXTRA_CA_CERTS).toBe('/corp/ca.pem');
  });

  it('supports custom allowlist', async () => {
    writeHomeEnv('CUSTOM_KEY=custom_value\nFOO=bar\n');
    const injected = await loadTlsEnvFromGemini(
      {},
      {
        homeDir: fakeHome,
        allowlist: ['CUSTOM_KEY'],
      },
    );
    expect(injected).toEqual({ CUSTOM_KEY: 'custom_value' });
  });

  it('respects the entire PARENT_PROCESS_TLS_ENV_ALLOWLIST', async () => {
    const lines = PARENT_PROCESS_TLS_ENV_ALLOWLIST.map(
      (k) => `${k}=value_for_${k}`,
    );
    writeHomeEnv(lines.join('\n') + '\n');
    const injected = await loadTlsEnvFromGemini({}, { homeDir: fakeHome });
    for (const key of PARENT_PROCESS_TLS_ENV_ALLOWLIST) {
      expect(injected[key]).toBe(`value_for_${key}`);
    }
  });
});
