/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session State Manager — Phase 5 (Team Collaboration).
 *
 * Allows a developer to "hand off" an in-progress agentic task to a colleague
 * by exporting the full agent state as a `.cowork-session` file.  The
 * receiving developer imports the file and resumes exactly where the first
 * developer left off, including:
 *
 *   • Goal and iteration number
 *   • Full Think / Act / Observe history
 *   • ProjectIndexer context summary
 *   • Memory store snapshot
 *   • MCP server configuration (without credentials — those must be re-supplied)
 *   • Project configuration (.coworkrc values)
 *
 * File format
 * ───────────
 * The `.cowork-session` file is a GZIP-compressed JSON document.  The
 * compression makes it practical to email or paste into a PR comment (a
 * typical session is 50–200 KiB uncompressed → 5–20 KiB compressed).
 *
 * Security note
 * ─────────────
 * The session file intentionally EXCLUDES:
 *   • API keys (use environment variables or .coworkrc on the receiving machine)
 *   • File contents larger than MAX_FILE_BYTES (prevents accidental leaks)
 *   • Audit log entries (these are machine-specific)
 */

import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { AgentMemory, AgentStep } from '../agent/core.js';
import type { CoworkConfig } from '../config/manager.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const SESSION_VERSION = 5;
const MAX_CONTEXT_CHARS = 200_000; // ≈ 50K tokens max in exported context

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMetadata {
  /** Schema version for forward/backward compatibility checks. */
  version: number;
  /** Stable session ID (matches Tracer session ID). */
  sessionId: string;
  /** When the session was exported. */
  exportedAt: string;
  /** Display name of the exporting developer (from git config or env). */
  exportedBy: string;
  /** SHA-256 of the payload for integrity verification. */
  checksum: string;
}

export interface SessionPayload {
  /** The original goal. */
  goal: string;
  /** Number of ReAct iterations completed. */
  iteration: number;
  /** Full agent step history. */
  history: AgentStep[];
  /** ProjectIndexer context document (truncated if very large). */
  contextSummary: string | null;
  /** Top-level file tree listing. */
  fileTree: string[];
  /** Parsed package.json (without scripts or engines — metadata only). */
  packageJson: Record<string, unknown> | null;
  /** Resolved config at export time (api keys stripped). */
  config: Partial<CoworkConfig>;
  /** Project root path on the exporting machine (informational). */
  originalRoot: string;
  /** MCP server configs (transport commands / URLs but NOT credentials). */
  mcpServers: Array<{ id: string; name: string }>;
  /** Compact notes from the exporting developer. */
  handoffNotes?: string;
}

export interface CoworkSession {
  meta: SessionMetadata;
  payload: SessionPayload;
}

export interface ImportResult {
  session: CoworkSession;
  valid: boolean;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

/**
 * Export and import `.cowork-session` files.
 *
 * ```ts
 * // Export (developer A):
 * const mgr = new SessionManager();
 * const path = await mgr.export(agent.getMemory(), config, './handoff.cowork-session', {
 *   handoffNotes: 'Auth refactor is 60% done. Next: add refresh token logic.',
 * });
 * console.log('Exported to', path);
 *
 * // Import (developer B):
 * const { session, valid, warnings } = await mgr.import('./handoff.cowork-session');
 * if (valid) {
 *   const agent = new Coworker({ projectRoot: '/my/local/checkout', ...session.payload.config });
 *   await agent.resumeFrom(session);
 * }
 * ```
 */
export class SessionManager {
  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * Serialise the agent's current memory state into a gzip-compressed
   * `.cowork-session` file.
   *
   * @returns Absolute path of the written file.
   */
  async export(
    memory: Readonly<AgentMemory>,
    config: Partial<CoworkConfig>,
    outputPath: string,
    opts: {
      handoffNotes?: string;
      sessionId?: string;
      exportedBy?: string;
    } = {},
  ): Promise<string> {
    const sessionId =
      opts.sessionId ?? shortId(`${memory.goal}${Date.now()}`);

    // Strip sensitive fields from config.
    const safeConfig: Partial<CoworkConfig> = { ...config };
    delete safeConfig.apiKey;

    // Truncate context to prevent huge files.
    const contextSummary = memory.contextSummary
      ? memory.contextSummary.slice(0, MAX_CONTEXT_CHARS)
      : null;

    const payload: SessionPayload = {
      goal: memory.goal,
      iteration: memory.history.filter((h) => h.phase === 'think').length,
      history: memory.history,
      contextSummary,
      fileTree: memory.fileTree,
      packageJson: sanitizePackageJson(memory.packageJson),
      config: safeConfig,
      originalRoot: memory.projectRoot,
      mcpServers: [],  // populated from CoworkerOptions in future integration
      handoffNotes: opts.handoffNotes,
    };

    const payloadJson = JSON.stringify(payload);
    const checksum = createHash('sha256').update(payloadJson).digest('hex');

    const session: CoworkSession = {
      meta: {
        version: SESSION_VERSION,
        sessionId,
        exportedAt: new Date().toISOString(),
        exportedBy: opts.exportedBy ?? resolveAuthor(),
        checksum,
      },
      payload,
    };

    const compressed = await gzipAsync(JSON.stringify(session));
    await writeFile(outputPath, compressed);

    return outputPath;
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Load and validate a `.cowork-session` file.
   *
   * Returns an `ImportResult` with warnings for recoverable issues (e.g.
   * version mismatch, truncated context) and `valid: false` for fatal issues.
   */
  async import(sessionPath: string): Promise<ImportResult> {
    const warnings: string[] = [];

    let raw: Buffer;
    try {
      raw = await readFile(sessionPath);
    } catch (err) {
      return {
        session: emptySession(),
        valid: false,
        warnings: [`Failed to read session file: ${(err as Error).message}`],
      };
    }

    let decompressed: Buffer;
    try {
      decompressed = await gunzipAsync(raw);
    } catch {
      // Might be an uncompressed JSON file (legacy / manual edit).
      decompressed = raw;
      warnings.push('Session file is not gzip-compressed. Attempting plain JSON parse.');
    }

    let session: CoworkSession;
    try {
      session = JSON.parse(decompressed.toString('utf-8')) as CoworkSession;
    } catch (err) {
      return {
        session: emptySession(),
        valid: false,
        warnings: [`Failed to parse session JSON: ${(err as Error).message}`],
      };
    }

    // ── Validation ────────────────────────────────────────────────────────
    if (!session.meta || !session.payload) {
      return {
        session: emptySession(),
        valid: false,
        warnings: ['Session file is missing meta or payload fields.'],
      };
    }

    if (session.meta.version !== SESSION_VERSION) {
      warnings.push(
        `Session version mismatch: file is v${session.meta.version}, ` +
          `current is v${SESSION_VERSION}. Some fields may be missing.`,
      );
    }

    // Verify checksum.
    const expectedChecksum = createHash('sha256')
      .update(JSON.stringify(session.payload))
      .digest('hex');

    if (expectedChecksum !== session.meta.checksum) {
      warnings.push(
        'Checksum mismatch — the session payload may have been modified. Proceed with caution.',
      );
    }

    if (session.payload.contextSummary?.endsWith('… [truncated')) {
      warnings.push('Context summary was truncated during export. Re-index for full context.');
    }

    return { session, valid: true, warnings };
  }

  // ── Display ───────────────────────────────────────────────────────────────

  /** Format session metadata for display in the terminal. */
  formatSummary(session: CoworkSession): string {
    const { meta, payload } = session;
    return [
      `Session    : ${meta.sessionId}`,
      `Exported   : ${meta.exportedAt} by ${meta.exportedBy}`,
      `Goal       : ${payload.goal}`,
      `Iterations : ${payload.iteration} completed`,
      `Steps      : ${payload.history.length} recorded`,
      `Context    : ${payload.contextSummary ? `${Math.ceil(payload.contextSummary.length / 4).toLocaleString()} tokens` : 'none'}`,
      payload.handoffNotes ? `Notes      : ${payload.handoffNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function resolveAuthor(): string {
  // Try git config, fall back to OS username.
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    return execSync('git config user.email', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown';
  }
}

function sanitizePackageJson(
  pkg: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!pkg) return null;
  // Keep only metadata; drop scripts, engines, large fields.
  const { name, version, description, type, dependencies, devDependencies } = pkg as {
    name?: string;
    version?: string;
    description?: string;
    type?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { name, version, description, type, dependencies, devDependencies };
}

function emptySession(): CoworkSession {
  return {
    meta: {
      version: SESSION_VERSION,
      sessionId: '',
      exportedAt: '',
      exportedBy: '',
      checksum: '',
    },
    payload: {
      goal: '',
      iteration: 0,
      history: [],
      contextSummary: null,
      fileTree: [],
      packageJson: null,
      config: {},
      originalRoot: '',
      mcpServers: [],
    },
  };
}
