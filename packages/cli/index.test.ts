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
  findProjectGeminiEnvFile,
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

describe('findProjectGeminiEnvFile', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-find-env-')),
    );
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns the file when .gemini/.env exists in the start dir', () => {
    const geminiDir = path.join(tmpRoot, '.gemini');
    fs.mkdirSync(geminiDir);
    const envPath = path.join(geminiDir, '.env');
    fs.writeFileSync(envPath, 'FOO=bar\n');
    const found = findProjectGeminiEnvFile(tmpRoot, fs, path);
    expect(found).toBe(envPath);
  });

  it('walks up to parent directories to find .gemini/.env', () => {
    const parentGemini = path.join(tmpRoot, '.gemini');
    fs.mkdirSync(parentGemini);
    const envPath = path.join(parentGemini, '.env');
    fs.writeFileSync(envPath, '');
    const child = path.join(tmpRoot, 'a', 'b', 'c');
    fs.mkdirSync(child, { recursive: true });
    const found = findProjectGeminiEnvFile(child, fs, path);
    expect(found).toBe(envPath);
  });

  it('does not match anything inside tmpRoot when no .env is written', () => {
    const deep = path.join(tmpRoot, 'deep', 'empty');
    fs.mkdirSync(deep, { recursive: true });
    const found = findProjectGeminiEnvFile(deep, fs, path);
    // A parent dir *outside* tmpRoot may have its own .gemini/.env on this
    // host; we only assert that nothing inside tmpRoot was picked up.
    if (found !== null) {
      expect(found.startsWith(tmpRoot)).toBe(false);
    }
  });
});

describe('loadTlsEnvFromGemini', () => {
  let tmpRoot: string;
  let fakeHome: string;
  let fakeCwd: string;

  beforeEach(() => {
    tmpRoot = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-tls-env-')),
    );
    fakeHome = path.join(tmpRoot, 'home');
    fakeCwd = path.join(tmpRoot, 'project');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeCwd, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeEnv(dir: string, contents: string) {
    const geminiDir = path.join(dir, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });
    fs.writeFileSync(path.join(geminiDir, '.env'), contents);
  }

  it('reads NODE_EXTRA_CA_CERTS from $HOME/.gemini/.env', async () => {
    writeEnv(fakeHome, 'NODE_EXTRA_CA_CERTS=/corp/ca.pem\n');
    const injected = await loadTlsEnvFromGemini(
      {},
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    expect(injected).toEqual({ NODE_EXTRA_CA_CERTS: '/corp/ca.pem' });
  });

  it('prefers project .gemini/.env over home', async () => {
    writeEnv(fakeHome, 'NODE_EXTRA_CA_CERTS=/home/ca.pem\n');
    writeEnv(fakeCwd, 'NODE_EXTRA_CA_CERTS=/project/ca.pem\n');
    const injected = await loadTlsEnvFromGemini(
      {},
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    expect(injected.NODE_EXTRA_CA_CERTS).toBe('/project/ca.pem');
  });

  it('falls back to home for keys missing in project file', async () => {
    writeEnv(fakeHome, 'HTTPS_PROXY=http://home-proxy:8080\n');
    writeEnv(fakeCwd, 'NODE_EXTRA_CA_CERTS=/project/ca.pem\n');
    const injected = await loadTlsEnvFromGemini(
      {},
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    expect(injected.NODE_EXTRA_CA_CERTS).toBe('/project/ca.pem');
    expect(injected.HTTPS_PROXY).toBe('http://home-proxy:8080');
  });

  it('does NOT override keys already set in currentEnv (shell wins)', async () => {
    writeEnv(fakeHome, 'NODE_EXTRA_CA_CERTS=/home/ca.pem\n');
    const injected = await loadTlsEnvFromGemini(
      { NODE_EXTRA_CA_CERTS: '/shell/ca.pem' },
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    expect(injected).toEqual({});
  });

  it('skips non-allowlisted keys', async () => {
    writeEnv(
      fakeHome,
      [
        'NODE_EXTRA_CA_CERTS=/corp/ca.pem',
        'FOO=bar',
        'GEMINI_API_KEY=sekret',
        '',
      ].join('\n'),
    );
    const injected = await loadTlsEnvFromGemini(
      {},
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    expect(injected).toEqual({ NODE_EXTRA_CA_CERTS: '/corp/ca.pem' });
    expect(injected).not.toHaveProperty('FOO');
    expect(injected).not.toHaveProperty('GEMINI_API_KEY');
  });

  it('returns empty object when no .env files exist', async () => {
    const injected = await loadTlsEnvFromGemini(
      {},
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    expect(injected).toEqual({});
  });

  it('tolerates malformed .env content without throwing', async () => {
    writeEnv(
      fakeHome,
      'this is not valid dotenv content !@#$\nNODE_EXTRA_CA_CERTS=/corp/ca.pem\n',
    );
    const injected = await loadTlsEnvFromGemini(
      {},
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    expect(injected.NODE_EXTRA_CA_CERTS).toBe('/corp/ca.pem');
  });

  it('supports custom allowlist for injecting other keys', async () => {
    writeEnv(fakeHome, 'CUSTOM_KEY=custom_value\nFOO=bar\n');
    const injected = await loadTlsEnvFromGemini(
      {},
      {
        cwd: fakeCwd,
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
    writeEnv(fakeHome, lines.join('\n') + '\n');
    const injected = await loadTlsEnvFromGemini(
      {},
      { cwd: fakeCwd, homeDir: fakeHome },
    );
    for (const key of PARENT_PROCESS_TLS_ENV_ALLOWLIST) {
      expect(injected[key]).toBe(`value_for_${key}`);
    }
  });
});
