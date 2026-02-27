/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * LogMonitor tool for Gemini Cowork.
 *
 * Starts a long-lived shell process (e.g. `npm run dev`, `tail -f error.log`),
 * streams its stdout/stderr into a line buffer, and resolves once ONE of:
 *
 *   1. `timeoutMs` elapses (default 10 s)
 *   2. The process exits naturally
 *   3. A line matches the `stopPattern` regex
 *
 * The collected log lines — optionally filtered by a `filter` regex — are
 * returned as a single ToolResult so the agent can reason over them.
 *
 * Design notes
 * ────────────
 * • The monitor never waits indefinitely; the default timeout prevents the
 *   agentic loop from blocking on long-running processes.
 * • `stopPattern` lets the agent detect specific events (e.g. "compiled
 *   successfully", "error TS2345") and terminate monitoring early.
 * • Live lines are echoed to the terminal in real time so the user can see
 *   what is happening — consistent with the human-in-the-loop philosophy.
 */

import { spawn } from 'node:child_process';
import chalk from 'chalk';
import type { LogMonitorInput } from './definitions.js';
import type { ToolResult } from './executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogLine {
  stream: 'stdout' | 'stderr';
  text: string;
  /** Milliseconds since monitor start. */
  offsetMs: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Execute the `log_monitor` tool.
 *
 * Spawns `input.command` and streams both stdout and stderr through line
 * buffers. The function resolves (never rejects) once a termination condition
 * is met.
 */
export async function executeLogMonitor(
  input: LogMonitorInput,
): Promise<ToolResult> {
  const {
    command,
    cwd = process.cwd(),
    timeoutMs = 10_000,
    filter,
    stopPattern,
  } = input;

  const filterRe = filter !== undefined ? new RegExp(filter) : null;
  const stopRe = stopPattern !== undefined ? new RegExp(stopPattern) : null;

  const lines: LogLine[] = [];
  const startMs = Date.now();

  return new Promise<ToolResult>((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;

    /** Stop the monitor, kill the child process, and resolve. */
    function finish(reason: string): void {
      if (settled) return;
      settled = true;

      clearTimeout(timer);
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore kill errors for already-exited processes */
      }

      const elapsed = Date.now() - startMs;
      const matched = filterRe ? lines.filter((l) => filterRe.test(l.text)) : lines;

      const header = [
        chalk.dim('─'.repeat(60)),
        `LogMonitor finished — ${reason}`,
        `Command  : ${command}`,
        `Duration : ${(elapsed / 1000).toFixed(2)} s`,
        `Lines    : ${lines.length} total · ${matched.length} matched`,
        chalk.dim('─'.repeat(60)),
      ].join('\n');

      const body = matched
        .map((l) => {
          const t = `+${(l.offsetMs / 1000).toFixed(2)}s`;
          const prefix =
            l.stream === 'stderr' ? chalk.red('[err] ') : chalk.dim('[out] ');
          return `${t} ${prefix}${l.text}`;
        })
        .join('\n');

      resolve({ output: `${header}\n${body}` });
    }

    /** Buffer raw chunk data into complete lines. */
    let stdoutBuf = '';
    let stderrBuf = '';

    function processChunk(
      stream: LogLine['stream'],
      raw: string,
      buf: string,
    ): string {
      const combined = buf + raw;
      const parts = combined.split('\n');
      // Last element is a partial line — hold it in the buffer.
      const partialLine = parts.pop() ?? '';

      for (const text of parts) {
        if (text === '') continue;
        const line: LogLine = {
          stream,
          text,
          offsetMs: Date.now() - startMs,
        };
        lines.push(line);

        // Echo live to the terminal.
        const livePrefix = stream === 'stderr' ? chalk.red('[ERR] ') : chalk.dim('[LOG] ');
        process.stdout.write(`  ${livePrefix}${text}\n`);

        // Check stop pattern.
        if (stopRe?.test(text)) {
          finish(`stop pattern matched: "${text.slice(0, 80)}"`);
        }
      }

      return partialLine;
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf = processChunk('stdout', chunk.toString(), stdoutBuf);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf = processChunk('stderr', chunk.toString(), stderrBuf);
    });

    child.on('close', () => finish('process exited'));

    child.on('error', (err) => {
      resolve({ output: '', error: `Failed to start process: ${err.message}` });
    });

    // Hard timeout — the agent loop must not block indefinitely.
    const timer = setTimeout(
      () => finish(`timeout after ${timeoutMs} ms`),
      timeoutMs,
    );
  });
}
