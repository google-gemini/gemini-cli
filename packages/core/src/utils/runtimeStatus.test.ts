/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  RUNTIME_STATUS_FILENAME,
  RUNTIME_STATUS_SCHEMA_VERSION,
  readRuntimeStatus,
  writeRuntimeStatus,
} from './runtimeStatus.js';
import { resetVersionCache } from './version.js';

describe('runtimeStatus', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'gemini-runtime-status-'),
    );
    resetVersionCache();
    vi.stubEnv('CLI_VERSION', '0.0.0-test');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    resetVersionCache();
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it('writes expected fields to runtime.json', async () => {
    const target = await writeRuntimeStatus(tmp, {
      sessionId: '11111111-2222-3333-4444-555555555555',
      workDir: '/work/dir',
      pid: 4242,
    });

    expect(target).toBe(path.join(tmp, RUNTIME_STATUS_FILENAME));
    expect(fs.existsSync(target)).toBe(true);

    const data = JSON.parse(fs.readFileSync(target, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(data['pid']).toBe(4242);
    expect(data['session_id']).toBe('11111111-2222-3333-4444-555555555555');
    expect(data['work_dir']).toBe('/work/dir');
    expect(data['schema_version']).toBe(RUNTIME_STATUS_SCHEMA_VERSION);
    expect(data['hostname']).toBeTypeOf('string');
    expect(data['hostname']).not.toBe('');
    expect(data['started_at']).toBeTypeOf('number');
    expect('gemini_cli_version' in data).toBe(true);
  });

  it('leaves no .tmp leftover on a successful write', async () => {
    await writeRuntimeStatus(tmp, {
      sessionId: 'abc',
      workDir: '/w',
      pid: 1,
    });
    const leftovers = fs.readdirSync(tmp).filter((f) => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('creates the session dir if it does not exist', async () => {
    const nested = path.join(tmp, 'does', 'not', 'exist', 'yet');
    await writeRuntimeStatus(nested, {
      sessionId: 'abc',
      workDir: '/w',
      pid: 1,
    });
    expect(fs.existsSync(path.join(nested, RUNTIME_STATUS_FILENAME))).toBe(
      true,
    );
  });

  it('round-trips fields via read', async () => {
    await writeRuntimeStatus(tmp, {
      sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      workDir: '/some/where',
      pid: 99,
    });
    const status = readRuntimeStatus(tmp);
    expect(status).not.toBeNull();
    expect(status!.pid).toBe(99);
    expect(status!.sessionId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(status!.workDir).toBe('/some/where');
    expect(status!.schemaVersion).toBe(RUNTIME_STATUS_SCHEMA_VERSION);
  });

  it('returns null when the file is missing', () => {
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('returns null on syntactically invalid JSON', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      'not-json',
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('returns null when the schema version is unknown', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      JSON.stringify({
        schema_version: RUNTIME_STATUS_SCHEMA_VERSION + 99,
        pid: 1,
        session_id: 'x',
        work_dir: '/w',
        hostname: 'h',
        started_at: 0.0,
        gemini_cli_version: null,
      }),
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('preserves non-ASCII (Chinese) chars round-trip and on disk', async () => {
    await writeRuntimeStatus(tmp, {
      sessionId: '\u4e2d\u6587-uuid-aaa',
      workDir: 'D:/\u9879\u76ee/\u6211\u7684-app',
      pid: 7777,
    });
    const status = readRuntimeStatus(tmp);
    expect(status).not.toBeNull();
    expect(status!.sessionId).toBe('\u4e2d\u6587-uuid-aaa');
    expect(status!.workDir).toBe('D:/\u9879\u76ee/\u6211\u7684-app');
    const rawBytes = fs.readFileSync(path.join(tmp, RUNTIME_STATUS_FILENAME));
    const literalUtf8 = Buffer.from('\u4e2d\u6587', 'utf8');
    expect(rawBytes.includes(literalUtf8)).toBe(true);
  });

  it('returns null on invalid UTF-8 bytes', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      Buffer.from([0xff, 0xfe, 0x20, 0x67, 0x61, 0x72, 0x62]),
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('rejects null session_id (no coercion to "null")', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      JSON.stringify({
        schema_version: RUNTIME_STATUS_SCHEMA_VERSION,
        pid: 1,
        session_id: null,
        work_dir: '/w',
        hostname: 'h',
        started_at: 0.0,
        gemini_cli_version: null,
      }),
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('rejects a string-typed pid', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      JSON.stringify({
        schema_version: RUNTIME_STATUS_SCHEMA_VERSION,
        pid: '1234',
        session_id: 'abc',
        work_dir: '/w',
        hostname: 'h',
        started_at: 0.0,
        gemini_cli_version: null,
      }),
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('rejects a non-integer pid (e.g. 1.5)', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      JSON.stringify({
        schema_version: RUNTIME_STATUS_SCHEMA_VERSION,
        pid: 1.5,
        session_id: 'abc',
        work_dir: '/w',
        hostname: 'h',
        started_at: 0.0,
        gemini_cli_version: null,
      }),
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('rejects array work_dir', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      JSON.stringify({
        schema_version: RUNTIME_STATUS_SCHEMA_VERSION,
        pid: 1,
        session_id: 'abc',
        work_dir: ['/', 'w'],
        hostname: 'h',
        started_at: 0.0,
        gemini_cli_version: null,
      }),
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('rejects bool pid (true is not an integer in our contract)', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      JSON.stringify({
        schema_version: RUNTIME_STATUS_SCHEMA_VERSION,
        pid: true,
        session_id: 'abc',
        work_dir: '/w',
        hostname: 'h',
        started_at: 0.0,
        gemini_cli_version: null,
      }),
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('rejects a top-level array payload', () => {
    fs.writeFileSync(
      path.join(tmp, RUNTIME_STATUS_FILENAME),
      JSON.stringify(['not', 'an', 'object']),
      'utf8',
    );
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('rejects a top-level null payload', () => {
    fs.writeFileSync(path.join(tmp, RUNTIME_STATUS_FILENAME), 'null', 'utf8');
    expect(readRuntimeStatus(tmp)).toBeNull();
  });

  it('atomically overwrites the previous PID on resume', async () => {
    await writeRuntimeStatus(tmp, {
      sessionId: 'abc',
      workDir: '/w',
      pid: 1000,
    });
    const first = readRuntimeStatus(tmp);
    expect(first).not.toBeNull();
    expect(first!.pid).toBe(1000);

    await writeRuntimeStatus(tmp, {
      sessionId: 'abc',
      workDir: '/w',
      pid: 2000,
    });
    const second = readRuntimeStatus(tmp);
    expect(second).not.toBeNull();
    expect(second!.pid).toBe(2000);
  });

  it('sets the gemini_cli_version field from CLI_VERSION env', async () => {
    await writeRuntimeStatus(tmp, {
      sessionId: 'abc',
      workDir: '/w',
      pid: 1,
    });
    const data = JSON.parse(
      fs.readFileSync(path.join(tmp, RUNTIME_STATUS_FILENAME), 'utf8'),
    ) as Record<string, unknown>;
    expect(data['gemini_cli_version']).toBe('0.0.0-test');
  });
});
