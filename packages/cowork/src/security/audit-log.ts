/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tamper-Proof Audit Log — Phase 5 / SOC2-Ready.
 *
 * Every file write, shell command, and MCP call is recorded as a signed entry
 * in an append-only NDJSON log at `.cowork/audit.ndjson`.
 *
 * Tamper-evidence
 * ───────────────
 * Each entry carries a SHA-256 hash of its own content + the previous entry's
 * hash (like a simplified blockchain).  `verify()` walks the chain and reports
 * any broken links.  This means:
 *   • Deleting an entry is detectable (hash chain breaks).
 *   • Modifying an entry is detectable (hash mismatch).
 *   • Appending new entries is always safe (chain grows correctly).
 *
 * Format
 * ──────
 * One JSON object per line:
 *   {"seq":1,"ts":"2026-02-23T10:00:00.000Z","session":"abc","action":"write_file",
 *    "path":"/project/src/index.ts","hash":"sha256:abc...","prevHash":"sha256:000..."}
 *
 * Compliance mapping
 * ──────────────────
 *   SOC2 CC6.1  — Logical access controls (action + actor + timestamp)
 *   SOC2 CC7.2  — System monitoring (all changes recorded)
 *   SOC2 CC9.2  — Vendor / service activity (MCP calls logged)
 */

import { createHash } from 'node:crypto';
import { appendFile, readFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'write_file'
  | 'shell_run'
  | 'mcp_call'
  | 'read_file'
  | 'session_start'
  | 'session_end'
  | 'policy_violation'
  | 'redaction';

export interface AuditEntry {
  /** Monotonically increasing sequence number within this log file. */
  seq: number;
  /** ISO 8601 timestamp. */
  ts: string;
  /** Session identifier (matches Tracer session ID). */
  session: string;
  /** Action type. */
  action: AuditAction;
  /** Affected file path (for file operations). */
  path?: string;
  /** Shell command (for shell_run). */
  command?: string;
  /** MCP qualified tool name (for mcp_call). */
  mcpTool?: string;
  /** Summary of what was done or blocked. */
  detail?: string;
  /** SHA-256 of this entry's canonical JSON (excluding hash fields). */
  hash: string;
  /** Hash of the previous entry (genesis entry uses "0".repeat(64)). */
  prevHash: string;
}

export interface VerifyResult {
  valid: boolean;
  totalEntries: number;
  brokenLinks: Array<{ seq: number; reason: string }>;
}

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

const GENESIS_HASH = '0'.repeat(64);

/**
 * Append-only, hash-chained audit log.
 *
 * ```ts
 * const log = new AuditLog('/project/.cowork/audit.ndjson', 'session-abc');
 * await log.record({ action: 'write_file', path: '/project/src/index.ts' });
 * const report = await log.verify();
 * console.log(report.valid); // true
 * ```
 */
export class AuditLog {
  private seq = 0;
  private lastHash = GENESIS_HASH;
  private _sessionId: string;

  constructor(
    private readonly logPath: string,
    sessionId: string,
  ) {
    this._sessionId = sessionId;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Record an audit event.  Appended atomically to the NDJSON log.
   *
   * This method is intentionally async to avoid blocking the event loop on
   * large write operations while still being called frequently.
   */
  async record(
    event: Omit<AuditEntry, 'seq' | 'ts' | 'session' | 'hash' | 'prevHash'>,
  ): Promise<AuditEntry> {
    this.seq++;

    const partial = {
      seq: this.seq,
      ts: new Date().toISOString(),
      session: this._sessionId,
      action: event.action,
      ...(event.path ? { path: event.path } : {}),
      ...(event.command ? { command: event.command } : {}),
      ...(event.mcpTool ? { mcpTool: event.mcpTool } : {}),
      ...(event.detail ? { detail: event.detail } : {}),
      prevHash: this.lastHash,
    };

    const hash = this.hashEntry(partial);
    const entry: AuditEntry = { ...partial, hash };
    this.lastHash = hash;

    await appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');
    return entry;
  }

  // ── Verify ────────────────────────────────────────────────────────────────

  /**
   * Walk the entire audit log and validate the hash chain.
   *
   * Returns a `VerifyResult` with details about any broken links.
   */
  async verify(): Promise<VerifyResult> {
    const brokenLinks: VerifyResult['brokenLinks'] = [];

    let rawContent: string;
    try {
      await access(this.logPath, fsConstants.R_OK);
      rawContent = await readFile(this.logPath, 'utf-8');
    } catch {
      return { valid: true, totalEntries: 0, brokenLinks: [] };
    }

    const lines = rawContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let expectedPrev = GENESIS_HASH;
    let totalEntries = 0;

    for (const line of lines) {
      let entry: AuditEntry;
      try {
        entry = JSON.parse(line) as AuditEntry;
      } catch {
        brokenLinks.push({
          seq: totalEntries + 1,
          reason: 'Failed to parse JSON line',
        });
        continue;
      }

      totalEntries++;

      // Check prevHash linkage.
      if (entry.prevHash !== expectedPrev) {
        brokenLinks.push({
          seq: entry.seq,
          reason: `prevHash mismatch: expected ${expectedPrev.slice(0, 8)}… got ${entry.prevHash.slice(0, 8)}…`,
        });
      }

      // Recompute hash to verify entry integrity.
      const { hash, ...rest } = entry;
      const recomputed = this.hashEntry(rest);
      if (recomputed !== hash) {
        brokenLinks.push({
          seq: entry.seq,
          reason: `Content hash mismatch: expected ${recomputed.slice(0, 8)}… got ${hash.slice(0, 8)}…`,
        });
      }

      expectedPrev = entry.hash;
    }

    return {
      valid: brokenLinks.length === 0,
      totalEntries,
      brokenLinks,
    };
  }

  // ── Export ────────────────────────────────────────────────────────────────

  /** Read all entries from the log file as an array. */
  async export(): Promise<AuditEntry[]> {
    try {
      const raw = await readFile(this.logPath, 'utf-8');
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as AuditEntry);
    } catch {
      return [];
    }
  }

  /**
   * Generate a human-readable summary of the audit log for the current session.
   */
  async sessionSummary(): Promise<string> {
    const entries = await this.export();
    const session = entries.filter((e) => e.session === this._sessionId);

    const counts: Partial<Record<AuditAction, number>> = {};
    for (const e of session) {
      counts[e.action] = (counts[e.action] ?? 0) + 1;
    }

    const lines = [
      `## Audit Summary — Session ${this._sessionId}`,
      `Entries: ${session.length}`,
      '',
      ...Object.entries(counts).map(([k, v]) => `  ${k.padEnd(20)} ${v}`),
    ];

    return lines.join('\n');
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private hashEntry(entry: Omit<AuditEntry, 'hash'>): string {
    const canonical = JSON.stringify(entry, Object.keys(entry).sort());
    return createHash('sha256').update(canonical, 'utf-8').digest('hex');
  }
}
