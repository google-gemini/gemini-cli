/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Integration tests for the signal forwarding fix (issue #25590).
 *
 * These tests spawn actual child processes and verify that signals are
 * correctly forwarded from parent to child, preventing orphaned processes.
 */
describe('signal forwarding integration', () => {
  let tempDir: string;
  const files: string[] = [];

  function writeTemp(name: string, content: string): string {
    const p = join(tempDir, name);
    writeFileSync(p, content, 'utf8');
    files.push(p);
    return p;
  }

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sigfwd-'));
  });

  afterAll(() => {
    for (const f of files) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  });

  it('should forward SIGTERM to child and child should exit', async () => {
    const childScript = writeTemp('child_term.mjs', [
      'process.on("SIGTERM", () => {',
      '  process.stdout.write("CHILD_GOT_SIGTERM\\n");',
      '  process.exit(42);',
      '});',
      'setInterval(() => {}, 1000);',
    ].join('\n'));

    const parentScript = writeTemp('parent_term.mjs', [
      'import { spawn } from "node:child_process";',
      `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], {`,
      '  stdio: ["inherit", "pipe", "inherit"]',
      '});',
      'const signals = ["SIGTERM", "SIGHUP", "SIGINT"];',
      'for (const sig of signals) {',
      '  process.on(sig, () => { try { child.kill(sig); } catch {} });',
      '}',
      'child.stdout.on("data", (d) => process.stdout.write(d));',
      'child.on("close", (code) => {',
      '  process.stdout.write("CHILD_EXIT_" + code + "\\n");',
      '  process.exit(0);',
      '});',
    ].join('\n'));

    const parent = spawn(process.execPath, [parentScript], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    let output = '';
    parent.stdout!.on('data', (d: Buffer) => { output += d.toString(); });

    await new Promise((r) => setTimeout(r, 500));
    parent.kill('SIGTERM');

    const [exitCode] = await once(parent, 'close');
    expect(output).toContain('CHILD_GOT_SIGTERM');
    expect(output).toContain('CHILD_EXIT_42');
    expect(exitCode).toBe(0);
  }, 10_000);

  it('should not orphan child when parent receives SIGHUP', async () => {
    const childScript = writeTemp('child_hup.mjs', [
      'process.on("SIGHUP", () => {',
      '  process.stdout.write("CHILD_GOT_SIGHUP\\n");',
      '  process.exit(0);',
      '});',
      'setInterval(() => {}, 1000);',
    ].join('\n'));

    const parentScript = writeTemp('parent_hup.mjs', [
      'import { spawn } from "node:child_process";',
      `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], {`,
      '  stdio: ["inherit", "pipe", "inherit"]',
      '});',
      'process.on("SIGHUP", () => { try { child.kill("SIGHUP"); } catch {} });',
      'child.stdout.on("data", (d) => process.stdout.write(d));',
      'child.on("close", (code) => {',
      '  process.stdout.write("CHILD_EXIT_" + code + "\\n");',
      '  process.exit(0);',
      '});',
    ].join('\n'));

    const parent = spawn(process.execPath, [parentScript], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    let output = '';
    parent.stdout!.on('data', (d: Buffer) => { output += d.toString(); });

    await new Promise((r) => setTimeout(r, 500));
    parent.kill('SIGHUP');

    const [exitCode] = await once(parent, 'close');
    expect(output).toContain('CHILD_GOT_SIGHUP');
    expect(output).toContain('CHILD_EXIT_0');
    expect(exitCode).toBe(0);
  }, 10_000);

  it.skip('should demonstrate the orphan bug WITHOUT signal forwarding (manual verification only)', async () => {
    const childScript = writeTemp('child_orphan.mjs', [
      'setInterval(() => {}, 1000);',
    ].join('\n'));

    const parentScript = writeTemp('parent_orphan.mjs', [
      'import { spawn } from "node:child_process";',
      `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], {`,
      '  stdio: "inherit"',
      '});',
      '// BUG: no signal forwarding',
      'process.stdout.write("CHILD_PID_" + child.pid + "\\n");',
      'setTimeout(() => {}, 60000);',
    ].join('\n'));

    const parent = spawn(process.execPath, [parentScript], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    let output = '';
    parent.stdout!.on('data', (d: Buffer) => { output += d.toString(); });

    await new Promise((r) => setTimeout(r, 500));
    const match = output.match(/CHILD_PID_(\d+)/);
    expect(match).toBeTruthy();
    const childPid = parseInt(match![1], 10);

    parent.kill('SIGTERM');
    await once(parent, 'close');
    await new Promise((r) => setTimeout(r, 200));

    let childStillAlive = false;
    try { process.kill(childPid, 0); childStillAlive = true; } catch { /* gone */ }

    expect(childStillAlive).toBe(true);
    try { process.kill(childPid, 'SIGKILL'); } catch { /* already gone */ }
  }, 10_000);

  it('should forward SIGUSR1 without escalation to SIGKILL', async () => {
    const childScript = writeTemp('child_usr1.mjs', [
      'let got = false;',
      'process.on("SIGUSR1", () => {',
      '  got = true;',
      '  process.stdout.write("CHILD_GOT_SIGUSR1\\n");',
      '});',
      'setTimeout(() => {',
      '  process.stdout.write("CHILD_EXIT_NORMAL\\n");',
      '  process.exit(got ? 0 : 1);',
      '}, 2000);',
    ].join('\n'));

    const parentScript = writeTemp('parent_usr1.mjs', [
      'import { spawn } from "node:child_process";',
      `const child = spawn(process.execPath, [${JSON.stringify(childScript)}], {`,
      '  stdio: ["inherit", "pipe", "inherit"]',
      '});',
      'process.on("SIGUSR1", () => { try { child.kill("SIGUSR1"); } catch {} });',
      'child.stdout.on("data", (d) => process.stdout.write(d));',
      'child.on("close", (code) => {',
      '  process.stdout.write("PARENT_DONE_" + code + "\\n");',
      '  process.exit(0);',
      '});',
    ].join('\n'));

    const parent = spawn(process.execPath, [parentScript], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    let output = '';
    parent.stdout!.on('data', (d: Buffer) => { output += d.toString(); });

    await new Promise((r) => setTimeout(r, 500));
    parent.kill('SIGUSR1');

    const [exitCode] = await once(parent, 'close');
    expect(output).toContain('CHILD_GOT_SIGUSR1');
    expect(output).toContain('CHILD_EXIT_NORMAL');
    expect(exitCode).toBe(0);
  }, 10_000);
});
