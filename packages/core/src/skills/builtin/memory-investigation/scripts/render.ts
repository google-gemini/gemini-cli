/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * render.ts — Terminal Table Renderer for Heap Diff Output
 *
 * Takes diff results (from diff.ts) and renders a formatted, color-coded
 * table in the terminal using ANSI escape codes.
 *
 * Zero external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DiffEntry, RenderMeta, RetainerResult } from './types.js';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

/**
 * Format bytes to human-readable string with consistent width.
 */
export function formatSize(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes >= 0 ? '+' : '-';
  if (abs === 0) return '     0 B';
  if (abs < 1024) return `${sign}${abs} B`.padStart(10);
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`.padStart(10);
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`.padStart(10);
}

/**
 * Format absolute size (no sign prefix).
 */
export function formatAbsSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format count with comma separators.
 */
export function formatCount(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return sign + n.toLocaleString('en-US');
}

/**
 * Get color code based on size delta magnitude.
 */
export function getColor(sizeDelta: number): string {
  if (sizeDelta > 1024 * 1024) return RED;      // > 1 MB growth = red
  if (sizeDelta > 100 * 1024) return YELLOW;     // > 100 KB growth = yellow
  if (sizeDelta < 0) return GREEN;               // shrinkage = green
  return WHITE;                                   // small growth = white
}

/**
 * Pad or truncate a string to a fixed width.
 */
export function pad(str: string, width: number): string {
  if (str.length > width) return str.substring(0, width - 2) + '..';
  return str.padEnd(width);
}

/**
 * Right-align a string to a fixed width.
 */
export function rpad(str: string, width: number): string {
  if (str.length > width) return str.substring(0, width);
  return str.padStart(width);
}

/**
 * Render diff results as a formatted terminal table.
 */
export function renderTable(diffs: DiffEntry[], meta: RenderMeta = {}): void {
  const {
    snapshot1 = 'snapshot_0',
    snapshot2 = 'snapshot_2',
    totalCaptures = 3,
    totalTimeMs = 0,
  } = meta;

  console.log('');
  console.log(`${BOLD}${CYAN}=== HEAP GROWTH ANALYSIS ===${RESET}`);

  const s1Name = snapshot1.split(/[/\\]/).pop();
  const s2Name = snapshot2.split(/[/\\]/).pop();
  const timeStr = totalTimeMs > 0 ? `, ${(totalTimeMs / 1000).toFixed(0)}s total` : '';
  console.log(`${DIM}Comparing: ${s1Name} -> ${s2Name} (${totalCaptures} captures${timeStr})${RESET}`);
  console.log('');

  if (diffs.length === 0) {
    console.log(`${GREEN}No significant memory growth detected.${RESET}`);
    console.log('');
    return;
  }

  // Column widths
  const W_RANK = 3;
  const W_NAME = 28;
  const W_COUNT = 12;
  const W_DELTA = 12;
  const W_CURRENT = 12;

  // Header
  const header =
    `${DIM} ${rpad('#', W_RANK)} | ${pad('Constructor', W_NAME)} | ${rpad('Count \u0394', W_COUNT)} | ${rpad('Size \u0394', W_DELTA)} | ${rpad('Current', W_CURRENT)}${RESET}`;
  const separator =
    `${DIM}${'-'.repeat(W_RANK + 1)}+${'-'.repeat(W_NAME + 2)}+${'-'.repeat(W_COUNT + 2)}+${'-'.repeat(W_DELTA + 2)}+${'-'.repeat(W_CURRENT + 1)}${RESET}`;

  console.log(header);
  console.log(separator);

  // Rows
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    const color = getColor(d.sizeDelta);
    const rank = rpad(String(i + 1), W_RANK);
    const name = pad(d.name, W_NAME);
    const countDelta = rpad(formatCount(d.countDelta), W_COUNT);
    const sizeDelta = rpad(formatSize(d.sizeDelta), W_DELTA);
    const currentSize = rpad(formatAbsSize(d.currentSize), W_CURRENT);

    console.log(`${color} ${rank} | ${name} | ${countDelta} | ${sizeDelta} | ${currentSize}${RESET}`);
  }

  console.log('');

  // Summary line
  const growing = diffs.filter(d => d.sizeDelta > 0);
  if (growing.length > 0) {
    const top = growing[0];
    const topSize = formatAbsSize(Math.abs(top.sizeDelta)).trim();
    const topCount = Math.abs(top.countDelta).toLocaleString('en-US');
    console.log(
      `${BOLD}${YELLOW}Top anomaly:${RESET} "${top.name}" grew ${RED}+${topSize}${RESET} ` +
      `(${topCount} new instances)`
    );
  }

  const shrinking = diffs.filter(d => d.sizeDelta < 0);
  if (shrinking.length > 0) {
    console.log(`${DIM}${shrinking.length} type(s) shrinking (GC reclaimed).${RESET}`);
  }

  console.log('');
}

/**
 * Render retainer chain paths as compact terminal output.
 */
export function renderRetainerPaths(retainerResults: RetainerResult[]): void {
  if (!retainerResults || retainerResults.length === 0) return;

  const hasAnyChains = retainerResults.some(r => r.chains && r.chains.length > 0);
  if (!hasAnyChains) {
    console.log(`${DIM}No bounded retainer path found within depth 5.${RESET}`);
    console.log('');
    return;
  }

  console.log(`${BOLD}${CYAN}=== TOP RETAINER PATHS ===${RESET}`);
  console.log('');

  const displayResults = retainerResults.filter(r => r.chains.length > 0).slice(0, 2);

  for (const result of displayResults) {
    console.log(`${BOLD}${YELLOW}${result.anomaly}${RESET}`);
    const displayChains = result.chains.slice(0, 2);

    for (const chain of displayChains) {
      const rootTag = chain.reachesRoot ? `${GREEN}[root]${RESET} ` : '';
      const scoreTag = `${DIM}(score: ${chain.score})${RESET}`;

      // Build compact path: A.ref -> B[0] -> C
      const pathParts = chain.nodes.map(step => {
        const edgeLabel = step.edgeType === 'element'
          ? `[${step.edgeName}]`
          : `.${step.edgeName}`;
        return `${step.from}${edgeLabel}`;
      });
      // Append the final target
      if (chain.nodes.length > 0) {
        pathParts.push(chain.nodes[chain.nodes.length - 1].to);
      }

      const pathStr = pathParts.join(' -> ');
      console.log(`  ${rootTag}${pathStr} ${scoreTag}`);
    }
    console.log('');
  }
}

/**
 * Run as standalone CLI: reads JSON diff from file.
 */
function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node render.js <diff.json>');
    process.exit(1);
  }

  const diffPath = args[0];
  const raw = JSON.parse(fs.readFileSync(diffPath, 'utf-8'));

  const diffs: DiffEntry[] = raw.anomalies || raw;
  const meta: RenderMeta = {
    snapshot1: raw.snapshot1 || 'snapshot_0',
    snapshot2: raw.snapshot2 || 'snapshot_2',
  };

  renderTable(diffs, meta);
}

const scriptPath = process.argv[1];
const modulePath = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
if (scriptPath && path.resolve(scriptPath) === path.resolve(modulePath)) {
  main();
}
