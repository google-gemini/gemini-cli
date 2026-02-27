/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tracer — structured telemetry for the Gemini Cowork agentic loop.
 *
 * When trace mode is active every Think / Act / Observe step is recorded with
 * full context, timing, and I/O.  At the end of a session the Tracer writes
 * two artefacts to `.cowork/traces/`:
 *
 *   <sessionId>.json  — machine-readable trace (for tooling / dashboards)
 *   <sessionId>.md    — human-readable Markdown post-mortem
 *
 * Usage
 * ─────
 *   const tracer = new Tracer('/my/project');
 *   tracer.startSession('Fix the auth module', '/my/project');
 *   tracer.record({ phase: 'think', content: '…' });
 *   tracer.record({ phase: 'act',   tool: 'read_file', input: { path: '…' } });
 *   tracer.record({ phase: 'observe', content: '…', output: '…', durationMs: 120 });
 *   const tracePath = await tracer.endSession('success');
 *   console.log('Trace saved to', tracePath);
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TracePhase =
  | 'session_start'
  | 'env_scan'
  | 'think'
  | 'act'
  | 'observe'
  | 'self_heal'
  | 'mcp_call'
  | 'session_end';

export interface TraceEvent {
  /** Sequential event index within the session, starting at 1. */
  seq: number;
  phase: TracePhase;
  /** ReAct loop iteration number (undefined for session lifecycle events). */
  iteration?: number;
  /** Tool name when phase is 'act' or 'mcp_call'. */
  tool?: string;
  /** Human-readable description / reasoning text. */
  content: string;
  /** Serialisable tool input. */
  input?: unknown;
  /** Serialisable tool output / observation. */
  output?: unknown;
  /** Wall-clock duration of the Act step in milliseconds. */
  durationMs?: number;
  /** ISO 8601 timestamp when this event was recorded. */
  timestamp: string;
}

export interface TraceSession {
  sessionId: string;
  goal: string;
  projectRoot: string;
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  outcome?: 'success' | 'error' | 'max_iterations';
  events: TraceEvent[];
}

// ---------------------------------------------------------------------------
// Tracer
// ---------------------------------------------------------------------------

/**
 * Records every agent step and exports them as JSON + Markdown artefacts.
 *
 * The Tracer is intentionally synchronous for `record()` and only performs
 * I/O in `endSession()`, so it never adds observable latency to the loop.
 */
export class Tracer {
  private session: TraceSession | null = null;
  private seq = 0;
  private readonly tracesDir: string;

  constructor(private readonly projectRoot: string) {
    this.tracesDir = join(projectRoot, '.cowork', 'traces');
  }

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /** Open a new trace session.  Must be called before `record()`. */
  startSession(goal: string): void {
    const now = new Date();
    const sessionId = `${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}`;
    this.seq = 0;
    this.session = {
      sessionId,
      goal,
      projectRoot: this.projectRoot,
      startTime: now.toISOString(),
      events: [],
    };
  }

  /**
   * Record a single trace event.
   * No-op if no session is active (safe to call unconditionally).
   */
  record(event: Omit<TraceEvent, 'seq' | 'timestamp'>): void {
    if (!this.session) return;
    this.session.events.push({
      seq: ++this.seq,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  /**
   * Close the session and write `<sessionId>.json` and `<sessionId>.md`
   * to `.cowork/traces/`.
   *
   * @returns Path to the JSON trace file.
   */
  async endSession(outcome: TraceSession['outcome'] = 'success'): Promise<string> {
    if (!this.session) throw new Error('No active trace session.');

    const endTime = new Date();
    this.session.endTime = endTime.toISOString();
    this.session.totalDurationMs =
      endTime.getTime() - new Date(this.session.startTime).getTime();
    this.session.outcome = outcome;

    this.record({ phase: 'session_end', content: `Session ended: ${outcome}` });

    await mkdir(this.tracesDir, { recursive: true });

    const base = join(this.tracesDir, this.session.sessionId);

    // ── JSON ──────────────────────────────────────────────────────────────────
    const jsonPath = `${base}.json`;
    await writeFile(jsonPath, JSON.stringify(this.session, null, 2), 'utf-8');

    // ── Markdown ──────────────────────────────────────────────────────────────
    const mdPath = `${base}.md`;
    await writeFile(mdPath, this.buildMarkdown(this.session), 'utf-8');

    this.session = null;
    return jsonPath;
  }

  /** True if a session is currently open. */
  get active(): boolean {
    return this.session !== null;
  }

  // -------------------------------------------------------------------------
  // Markdown renderer
  // -------------------------------------------------------------------------

  private buildMarkdown(session: TraceSession): string {
    const durationSec = ((session.totalDurationMs ?? 0) / 1000).toFixed(2);

    const header = [
      `# Gemini Cowork Trace  —  Post-mortem`,
      ``,
      `| Field        | Value |`,
      `|---|---|`,
      `| Session ID   | \`${session.sessionId}\` |`,
      `| Goal         | ${session.goal} |`,
      `| Project Root | \`${session.projectRoot}\` |`,
      `| Start        | ${session.startTime} |`,
      `| End          | ${session.endTime ?? '—'} |`,
      `| Duration     | ${durationSec} s |`,
      `| Outcome      | **${session.outcome ?? 'unknown'}** |`,
      `| Steps        | ${session.events.length} |`,
      ``,
      `---`,
      ``,
      `## Event Log`,
      ``,
    ].join('\n');

    const PHASE_EMOJI: Record<TracePhase, string> = {
      session_start: '🚀',
      env_scan: '🔍',
      think: '🧠',
      act: '⚡',
      observe: '👁️',
      self_heal: '🩺',
      mcp_call: '🔌',
      session_end: '🏁',
    };

    const events = session.events
      .map((e) => {
        const emoji = PHASE_EMOJI[e.phase] ?? '•';
        const title = `### ${e.seq}. ${emoji} \`${e.phase}\`` +
          (e.iteration !== undefined ? `  ·  iteration ${e.iteration}` : '') +
          (e.tool ? `  ·  tool: \`${e.tool}\`` : '') +
          `  ·  ${e.timestamp}`;

        const body: string[] = [title, ''];
        body.push(e.content, '');

        if (e.input !== undefined) {
          body.push(
            '**Input:**',
            '```json',
            JSON.stringify(e.input, null, 2).slice(0, 1000),
            '```',
            '',
          );
        }
        if (e.output !== undefined) {
          const out =
            typeof e.output === 'string'
              ? e.output.slice(0, 800)
              : JSON.stringify(e.output, null, 2).slice(0, 800);
          body.push('**Output:**', '```', out, '```', '');
        }
        if (e.durationMs !== undefined) {
          body.push(`_Duration: ${e.durationMs} ms_`, '');
        }

        return body.join('\n');
      })
      .join('\n---\n\n');

    return header + events;
  }
}
