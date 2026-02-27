/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dry-run mode for Gemini Cowork — Phase 4.
 *
 * When dry-run is active, every destructive tool call (write_file, shell_run)
 * is intercepted and visualised as a diff / command preview WITHOUT being
 * applied.  The agent still sees realistic ToolResult output so it can
 * continue reasoning, but no actual I/O takes place.
 *
 * Diff output format
 * ──────────────────
 *   FILE  packages/cowork/src/index.ts
 *   ────────────────────────────────────
 *   - old line A
 *   + new line B
 *     unchanged line C
 *
 * Colour coding:
 *   Red   (-)   Line was removed
 *   Green (+)   Line was added
 *   Dim         Unchanged context lines
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import type { ToolResult } from './executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

export interface FileDiff {
  path: string;
  isNewFile: boolean;
  hunks: DiffLine[][];
  addedLines: number;
  removedLines: number;
}

// ---------------------------------------------------------------------------
// Diff computation (no external dep — pure string comparison)
// ---------------------------------------------------------------------------

/**
 * Compute a unified-style diff between `oldText` and `newText`.
 *
 * Uses a simple LCS-based Myers diff algorithm for minimal diffs.
 * For production use, swap with the `diff` npm package for a battle-tested
 * implementation: `import { structuredPatch } from 'diff'`.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build an edit script using a greedy LCS walk.
  const result: DiffLine[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    const oldLine = oldLines[oi];
    const newLine = newLines[ni];

    if (oi >= oldLines.length) {
      result.push({ type: 'added', content: newLine ?? '', oldLineNo: null, newLineNo: ni + 1 });
      ni++;
    } else if (ni >= newLines.length) {
      result.push({ type: 'removed', content: oldLine ?? '', oldLineNo: oi + 1, newLineNo: null });
      oi++;
    } else if (oldLine === newLine) {
      result.push({ type: 'context', content: oldLine, oldLineNo: oi + 1, newLineNo: ni + 1 });
      oi++;
      ni++;
    } else {
      // Check if skipping old line helps (delete).
      const skipOld = newLines.slice(ni, ni + 3).includes(oldLine ?? '');
      // Check if skipping new line helps (insert).
      const skipNew = oldLines.slice(oi, oi + 3).includes(newLine ?? '');

      if (skipOld && !skipNew) {
        result.push({ type: 'added', content: newLine ?? '', oldLineNo: null, newLineNo: ni + 1 });
        ni++;
      } else {
        result.push({ type: 'removed', content: oldLine ?? '', oldLineNo: oi + 1, newLineNo: null });
        oi++;
      }
    }
  }

  return result;
}

/** Group diff lines into hunks (adjacent non-context regions + 3 context lines). */
function groupIntoHunks(lines: DiffLine[], contextSize = 3): DiffLine[][] {
  const changed = lines
    .map((l, i) => ({ i, changed: l.type !== 'context' }))
    .filter((x) => x.changed)
    .map((x) => x.i);

  if (changed.length === 0) return [];

  const hunks: DiffLine[][] = [];
  let hunkStart = Math.max(0, changed[0]! - contextSize);
  let hunkEnd = Math.min(lines.length - 1, changed[0]! + contextSize);

  for (let k = 1; k < changed.length; k++) {
    const nextStart = Math.max(0, changed[k]! - contextSize);
    if (nextStart <= hunkEnd + 1) {
      hunkEnd = Math.min(lines.length - 1, changed[k]! + contextSize);
    } else {
      hunks.push(lines.slice(hunkStart, hunkEnd + 1));
      hunkStart = nextStart;
      hunkEnd = Math.min(lines.length - 1, changed[k]! + contextSize);
    }
  }
  hunks.push(lines.slice(hunkStart, hunkEnd + 1));
  return hunks;
}

// ---------------------------------------------------------------------------
// File diff rendering
// ---------------------------------------------------------------------------

/** Compute the full `FileDiff` for a proposed write operation. */
export async function computeFileDiff(
  path: string,
  proposedContent: string,
): Promise<FileDiff> {
  const isNewFile = !existsSync(path);
  const oldText = isNewFile ? '' : await readFile(path, 'utf-8');
  const lines = computeDiff(oldText, proposedContent);
  const hunks = groupIntoHunks(lines);

  return {
    path,
    isNewFile,
    hunks,
    addedLines: lines.filter((l) => l.type === 'added').length,
    removedLines: lines.filter((l) => l.type === 'removed').length,
  };
}

/** Render a `FileDiff` as a coloured string for terminal output. */
export function renderFileDiff(diff: FileDiff): string {
  const lines: string[] = [];

  const fileLabel = diff.isNewFile
    ? chalk.green(`[NEW FILE] ${diff.path}`)
    : chalk.white(diff.path);

  lines.push(
    '',
    chalk.bold('FILE  ') + fileLabel,
    chalk.dim('─'.repeat(60)),
    chalk.dim(
      `  ${chalk.green(`+${diff.addedLines}`)}  ${chalk.red(`-${diff.removedLines}`)} lines`,
    ),
    chalk.dim('─'.repeat(60)),
  );

  for (const hunk of diff.hunks) {
    for (const dl of hunk) {
      if (dl.type === 'added') {
        lines.push(chalk.green(`+ ${dl.content}`));
      } else if (dl.type === 'removed') {
        lines.push(chalk.red(`- ${dl.content}`));
      } else {
        lines.push(chalk.dim(`  ${dl.content}`));
      }
    }
    lines.push(chalk.dim('  ⋯'));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dry-run interceptors
// ---------------------------------------------------------------------------

/**
 * Intercept a `write_file` call in dry-run mode.
 *
 * Reads the current file, computes the diff, prints it to the terminal, and
 * returns a synthetic `ToolResult` so the agent can keep reasoning.
 */
export async function dryRunWriteFile(
  path: string,
  content: string,
): Promise<ToolResult> {
  const diff = await computeFileDiff(path, content);
  const rendered = renderFileDiff(diff);

  console.log(chalk.yellow.bold('\n[DRY RUN] write_file — no changes applied'));
  console.log(rendered);
  console.log(
    chalk.yellow(
      `\n  Would write ${content.length.toLocaleString()} bytes to ${path}\n`,
    ),
  );

  return {
    output:
      `[DRY RUN] write_file: ${path} (${diff.isNewFile ? 'new file' : 'modified'}) ` +
      `+${diff.addedLines}/-${diff.removedLines} lines — not applied.`,
  };
}

/**
 * Intercept a `shell_run` call in dry-run mode.
 *
 * Prints a formatted preview of the command and returns a synthetic result.
 */
export function dryRunShellRun(command: string, cwd?: string): ToolResult {
  console.log(chalk.yellow.bold('\n[DRY RUN] shell_run — command NOT executed'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.white(`  $ ${command}`));
  if (cwd) console.log(chalk.dim(`  cwd: ${cwd}`));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(
    chalk.yellow(
      `\n  This command would run in the live environment. Pass --no-dry-run to execute.\n`,
    ),
  );

  return {
    output: `[DRY RUN] shell_run: "${command}" — not executed.`,
  };
}
