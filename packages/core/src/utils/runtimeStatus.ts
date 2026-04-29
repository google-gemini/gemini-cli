/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runtime status sidecar for an active interactive Gemini CLI session.
 *
 * Writes a small JSON file at `<sessionDir>/runtime.json` while a session
 * is alive so that **external** tools (terminal multiplexers, tab
 * managers, IDE integrations, observability daemons) can answer:
 *
 *     "Which Gemini CLI session is the running PID X serving?"
 *
 * Gemini CLI does not embed the session id in `argv` for fresh
 * (non-resumed) sessions, so a side-channel file recording the explicit
 * `(pid, sessionId, workDir, ...)` tuple is the most reliable
 * cross-platform signal.
 *
 * Lifecycle:
 *
 * - Written on session start (clean launch or `--resume`); the resume
 *   case atomically overwrites whatever the previous PID wrote.
 * - **Not** deleted on clean exit or crash. From an external observer's
 *   standpoint the recorded PID no longer exists in either case, so a
 *   liveness check is sufficient and an explicit cleanup adds nothing.
 * - Removed naturally when the surrounding session directory itself is
 *   deleted, which gives a natural bound on accumulation.
 *
 * The file is written atomically via tmp-file + `fsync` + rename and
 * contains a small, stable schema. External consumers should treat
 * unknown fields as forward-compatible additions.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getVersion } from './version.js';

export const RUNTIME_STATUS_FILENAME = 'runtime.json';
export const RUNTIME_STATUS_SCHEMA_VERSION = 1;

/** Snapshot of a live Gemini CLI session process for external observers. */
export interface RuntimeStatus {
  schemaVersion: number;
  pid: number;
  sessionId: string;
  workDir: string;
  hostname: string;
  /** Seconds since Unix epoch (float, matches the kimi-cli on-disk format). */
  startedAt: number;
  geminiCliVersion: string | null;
}

/** On-disk JSON layout (snake_case for cross-tool compatibility). */
interface RuntimeStatusJson {
  schema_version: number;
  pid: number;
  session_id: string;
  work_dir: string;
  hostname: string;
  started_at: number;
  gemini_cli_version: string | null;
}

function runtimeStatusPath(sessionDir: string): string {
  return path.join(sessionDir, RUNTIME_STATUS_FILENAME);
}

async function safeGeminiVersion(): Promise<string | null> {
  try {
    const v = await getVersion();
    return v && v !== 'unknown' ? v : null;
  } catch {
    return null;
  }
}

export interface WriteRuntimeStatusOptions {
  sessionId: string;
  workDir: string;
  /** Defaults to `process.pid`; overridable for tests. */
  pid?: number;
}

/**
 * Atomically write the runtime status file for this session.
 *
 * Writes `<sessionDir>/runtime.json` via tmp-file + `fsync` + `rename` so
 * an external observer never sees a partially written file: it sees
 * either the previous contents or the fully committed new contents.
 *
 * Creates `sessionDir` (recursive) if it does not exist. Exceptions from
 * the underlying I/O propagate to the caller; this function does not log
 * or swallow them. Callers that want best-effort semantics should wrap
 * the call in `try/catch`. On failure no leftover `.tmp` file is kept.
 *
 * Returns the path of the file that was written.
 */
export async function writeRuntimeStatus(
  sessionDir: string,
  options: WriteRuntimeStatusOptions,
): Promise<string> {
  const status: RuntimeStatusJson = {
    schema_version: RUNTIME_STATUS_SCHEMA_VERSION,
    pid: options.pid ?? process.pid,
    session_id: options.sessionId,
    work_dir: options.workDir,
    hostname: os.hostname(),
    started_at: Date.now() / 1000,
    gemini_cli_version: await safeGeminiVersion(),
  };

  fs.mkdirSync(sessionDir, { recursive: true });

  const target = runtimeStatusPath(sessionDir);
  const tempPath = `${target}.tmp.${crypto.randomUUID()}`;
  // `ensureAscii=false` equivalent: JSON.stringify already keeps non-ASCII
  // characters as their literal UTF-8 code points when written via utf-8.
  const content = JSON.stringify(status, null, 2);

  let fd: number | undefined;
  try {
    // 'wx' = O_CREAT | O_EXCL — fail if `tempPath` already exists. The
    // random suffix already makes collision astronomically unlikely; the
    // exclusive open adds defense-in-depth against a pre-placed file or
    // symlink at the temp path (which 'w' would silently follow).
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, target);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close errors during cleanup.
      }
    }
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore unlink errors; tmp file may not have been created.
    }
    throw err;
  }

  return target;
}

/**
 * Remove `<sessionDir>/runtime.json` if present.
 *
 * Called only when the same PID switches to serving a *different* session
 * id mid-flight (gemini-cli's `/clear` and session-browser-resume flows).
 * Without this, the previous session's `runtime.json` would still claim
 * this PID, and an external observer running a PID-liveness check would
 * see the same PID mapped to two different sessions and treat both as
 * live. All other exit paths (clean quit, crash) leave the file alone —
 * the recorded PID is gone in both cases, so a liveness check by the
 * external observer is sufficient and explicit cleanup adds nothing.
 *
 * Safe to call multiple times and on directories that no longer exist;
 * I/O errors are swallowed so cleanup cannot disrupt the surrounding
 * control flow.
 */
export function clearRuntimeStatus(sessionDir: string): void {
  const target = runtimeStatusPath(sessionDir);
  try {
    fs.unlinkSync(target);
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      ((err as NodeJS.ErrnoException).code === 'ENOENT' ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (err as NodeJS.ErrnoException).code === 'ENOTDIR')
    ) {
      return;
    }
    // Any other I/O error is best-effort: never disrupt control flow.
  }
}

/**
 * Read the runtime status file from a session directory, if present.
 *
 * Returns `null` if the file is missing, malformed, or written by a
 * schema version this code does not understand. "Malformed" includes
 * truncated UTF-8, syntactically invalid JSON, a non-object payload,
 * and any field whose JSON type does not match the interface — the
 * function never coerces `null` / array / object into a string just to
 * satisfy the type.
 *
 * Note: a returned record only proves that *some* Gemini CLI process
 * once claimed this session. The PID may already be dead (clean exit
 * or crash). Consumers must verify liveness themselves before treating
 * the record as a currently-running session.
 */
export function readRuntimeStatus(sessionDir: string): RuntimeStatus | null {
  const target = runtimeStatusPath(sessionDir);

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(target);
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null;
    }
    return null;
  }

  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const obj = parsed as Record<string, unknown>;

  const schemaVersion = obj['schema_version'];
  if (
    typeof schemaVersion !== 'number' ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion !== RUNTIME_STATUS_SCHEMA_VERSION
  ) {
    return null;
  }

  const pid = obj['pid'];
  if (typeof pid !== 'number' || !Number.isInteger(pid)) {
    return null;
  }

  const sessionId = obj['session_id'];
  if (typeof sessionId !== 'string') {
    return null;
  }

  const workDir = obj['work_dir'];
  if (typeof workDir !== 'string') {
    return null;
  }

  const hostname = obj['hostname'];
  if (typeof hostname !== 'string') {
    return null;
  }

  const startedAt = obj['started_at'];
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) {
    return null;
  }

  const geminiCliVersion = obj['gemini_cli_version'];
  if (geminiCliVersion !== null && typeof geminiCliVersion !== 'string') {
    return null;
  }

  return {
    schemaVersion,
    pid,
    sessionId,
    workDir,
    hostname,
    startedAt,
    geminiCliVersion,
  };
}
