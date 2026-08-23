/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fromLog } from '../utils/eval-from-log.js';

// ─── JSONL fixture helpers ────────────────────────────────────────────────────

/** Serialises session records to a JSONL string. */
function toJsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

/**
 * Writes a minimal session JSONL fixture to a temp file and returns the path.
 */
function writeFixture(tmpDir: string, records: unknown[]): string {
  const filePath = path.join(
    tmpDir,
    'session-2026-08-01T10-00-testfixtur.jsonl',
  );
  fs.writeFileSync(filePath, toJsonl(records), 'utf8');
  return filePath;
}

/** A minimal but complete session fixture. */
function makeMinimalSession(workspaceDir: string) {
  return [
    // metadata line
    {
      sessionId: 'test-session-fixture',
      projectHash: 'abc123',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      kind: 'main',
    },
    // user message
    {
      id: 'msg-user-1',
      timestamp: new Date().toISOString(),
      type: 'user',
      content: [{ text: 'Fix the subtract bug in app.ts' }],
    },
    // gemini message with tool calls
    {
      id: 'msg-gemini-1',
      timestamp: new Date().toISOString(),
      type: 'gemini',
      content: [{ text: 'I will read and fix the file.' }],
      toolCalls: [
        {
          id: 'tc-read-1',
          name: 'read_file',
          args: { path: path.join(workspaceDir, 'app.ts') },
          result: [{ text: 'const add = (a, b) => a - b;' }],
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'tc-write-1',
          name: 'write_file',
          args: {
            path: path.join(workspaceDir, 'app.ts'),
            content: 'const add = (a, b) => a + b;',
          },
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fromLog (integration)', () => {
  let tmpDir: string;
  let evalsDir: string;
  let repoRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-from-log-test-'));
    // Create a fake evals/ directory so the pipeline has somewhere to write
    evalsDir = path.join(tmpDir, 'evals');
    fs.mkdirSync(evalsDir, { recursive: true });
    // We use tmpDir as a fake repoRoot; point the output to our evalsDir
    repoRoot = tmpDir;
    // Create the evals subdir structure the inventory scanner expects
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces a skeleton from a valid session JSONL', async () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const sessionPath = writeFixture(tmpDir, makeMinimalSession(workspaceDir));

    const result = await fromLog(sessionPath, {
      outputDir: evalsDir,
      validate: false, // skip validation (no full evals/ tree in tmpDir)
      repoRoot,
    });

    expect(result.skeleton).toBeTruthy();
    expect(result.skeleton).toContain('USUALLY_PASSES');
    expect(result.skeleton).toContain('behavioral');
    expect(result.skeleton).toContain('Fix the subtract bug in app.ts');
    expect(result.prompt).toContain('Fix the subtract bug in app.ts');
  });

  it('writes the output file to evalsDir', async () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const sessionPath = writeFixture(tmpDir, makeMinimalSession(workspaceDir));

    const result = await fromLog(sessionPath, {
      outputDir: evalsDir,
      validate: false,
      repoRoot,
    });

    expect(result.outputPath).toBeDefined();
    expect(fs.existsSync(result.outputPath!)).toBe(true);
    const written = fs.readFileSync(result.outputPath!, 'utf8');
    expect(written).toContain('USUALLY_PASSES');
  });

  it('returns skeleton in stdoutMode without writing a file', async () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const sessionPath = writeFixture(tmpDir, makeMinimalSession(workspaceDir));

    const result = await fromLog(sessionPath, {
      stdoutMode: true,
      validate: false,
      repoRoot,
    });

    expect(result.skeleton).toBeTruthy();
    expect(result.outputPath).toBeUndefined();
    // No files written to evalsDir
    const files = fs.readdirSync(evalsDir);
    expect(files).toHaveLength(0);
  });

  it('sanitizes absolute paths in the generated skeleton', async () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const sessionPath = writeFixture(tmpDir, makeMinimalSession(workspaceDir));

    const result = await fromLog(sessionPath, {
      stdoutMode: true,
      validate: false,
      repoRoot,
    });

    // The absolute workspaceDir path should not appear in the skeleton
    expect(result.skeleton).not.toContain(workspaceDir);
  });

  it('uses a custom eval name when provided', async () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const sessionPath = writeFixture(tmpDir, makeMinimalSession(workspaceDir));

    const result = await fromLog(sessionPath, {
      name: 'should not subtract when adding',
      stdoutMode: true,
      validate: false,
      repoRoot,
    });

    expect(result.skeleton).toContain('should not subtract when adding');
  });

  it('warns when no user prompt is found', async () => {
    // Session with only a gemini message, no user message
    const records = [
      {
        sessionId: 'no-prompt-session',
        projectHash: 'def456',
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'msg-gemini-1',
        timestamp: new Date().toISOString(),
        type: 'gemini',
        content: [{ text: 'I did something.' }],
        toolCalls: [],
      },
    ];

    const sessionPath = writeFixture(tmpDir, records);

    const result = await fromLog(sessionPath, {
      stdoutMode: true,
      validate: false,
      repoRoot,
    });

    const hasPromptWarning = result.warnings.some((w) =>
      w.toLowerCase().includes('prompt'),
    );
    expect(hasPromptWarning).toBe(true);
  });

  it('throws for a non-existent session file', async () => {
    await expect(
      fromLog('/nonexistent/session.jsonl', {
        stdoutMode: true,
        validate: false,
        repoRoot,
      }),
    ).rejects.toThrow('not found');
  });

  it('throws for an empty/corrupt session file', async () => {
    const emptyPath = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(emptyPath, '', 'utf8');

    await expect(
      fromLog(emptyPath, {
        stdoutMode: true,
        validate: false,
        repoRoot,
      }),
    ).rejects.toThrow();
  });

  it('avoids filename collisions by appending a numeric suffix', async () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const sessionPath = writeFixture(tmpDir, makeMinimalSession(workspaceDir));

    // Run the pipeline twice with the same input — should produce different filenames
    const result1 = await fromLog(sessionPath, {
      outputDir: evalsDir,
      validate: false,
      repoRoot,
    });
    const result2 = await fromLog(sessionPath, {
      outputDir: evalsDir,
      validate: false,
      repoRoot,
    });

    expect(result1.outputPath).not.toBe(result2.outputPath);
    expect(fs.existsSync(result1.outputPath!)).toBe(true);
    expect(fs.existsSync(result2.outputPath!)).toBe(true);
  });

  it('includes observed tool names in the result', async () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const sessionPath = writeFixture(tmpDir, makeMinimalSession(workspaceDir));

    const result = await fromLog(sessionPath, {
      stdoutMode: true,
      validate: false,
      repoRoot,
    });

    expect(result.observedTools).toContain('read_file');
    expect(result.observedTools).toContain('write_file');
  });
});
