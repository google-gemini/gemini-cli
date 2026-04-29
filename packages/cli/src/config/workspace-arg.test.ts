/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { getWorkspaceArg, loadCliConfig, type CliArgs } from './config.js';
import { FatalConfigError } from '@google/gemini-cli-core';
import { createTestMergedSettings } from './settings.js';

vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(() => ({ isTrusted: true, source: 'file' })),
}));

vi.mock('./sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn(async () => undefined),
}));

vi.mock('../commands/utils.js', () => ({
  exitCli: vi.fn(),
}));

// ---------------------------------------------------------------------------
// getWorkspaceArg
// ---------------------------------------------------------------------------
describe('getWorkspaceArg', () => {
  it('returns undefined when --workspace is not provided', () => {
    expect(getWorkspaceArg(['node', 'gemini'])).toBeUndefined();
    expect(
      getWorkspaceArg(['node', 'gemini', '--prompt', 'hello']),
    ).toBeUndefined();
  });

  it('returns the resolved absolute path when --workspace is provided', () => {
    const result = getWorkspaceArg([
      'node',
      'gemini',
      '--workspace',
      './my_dir',
    ]);
    expect(result).toBe(path.resolve('./my_dir'));
  });

  it('resolves relative paths to absolute', () => {
    const result = getWorkspaceArg([
      'node',
      'gemini',
      '--workspace',
      '../sibling',
    ]);
    expect(result).toBe(path.resolve('../sibling'));
  });

  it('handles an already-absolute path', () => {
    const absPath = path.resolve('/tmp/workspace');
    const result = getWorkspaceArg(['node', 'gemini', '--workspace', absPath]);
    expect(result).toBe(absPath);
  });

  it('trims whitespace from the path', () => {
    const result = getWorkspaceArg([
      'node',
      'gemini',
      '--workspace',
      '  ./my_dir  ',
    ]);
    expect(result).toBe(path.resolve('./my_dir'));
  });

  it('ignores unrelated flags', () => {
    const result = getWorkspaceArg([
      'node',
      'gemini',
      '--prompt',
      'hello',
      '--workspace',
      './ws',
      '--yolo',
    ]);
    expect(result).toBe(path.resolve('./ws'));
  });
});

// ---------------------------------------------------------------------------
// loadCliConfig: --workspace validation
// ---------------------------------------------------------------------------
describe('loadCliConfig --workspace validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(path.resolve('.'), 'workspace-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const baseArgv = (): CliArgs => ({
    query: undefined,
    model: undefined,
    sandbox: undefined,
    debug: false,
    prompt: undefined,
    promptInteractive: undefined,
    yolo: false,
    approvalMode: undefined,
    policy: undefined,
    adminPolicy: undefined,
    allowedMcpServerNames: undefined,
    allowedTools: undefined,
    extensions: undefined,
    listExtensions: undefined,
    resume: undefined,
    listSessions: undefined,
    deleteSession: undefined,
    includeDirectories: undefined,
    screenReader: undefined,
    useWriteTodos: undefined,
    outputFormat: undefined,
    fakeResponses: undefined,
    recordResponses: undefined,
    rawOutput: undefined,
    acceptRawOutputRisk: undefined,
    isCommand: undefined,
    workspace: undefined,
  });

  it('throws FatalConfigError when --workspace directory does not exist', async () => {
    const argv = {
      ...baseArgv(),
      workspace: path.join(tmpDir, 'does-not-exist'),
    };
    const settings = createTestMergedSettings();
    await expect(loadCliConfig(settings, 'session-id', argv)).rejects.toThrow(
      FatalConfigError,
    );
  });

  it('throws FatalConfigError when --workspace path is a file, not a directory', async () => {
    const filePath = path.join(tmpDir, 'notadir.txt');
    fs.writeFileSync(filePath, 'hello');
    const argv = { ...baseArgv(), workspace: filePath };
    const settings = createTestMergedSettings();
    await expect(loadCliConfig(settings, 'session-id', argv)).rejects.toThrow(
      FatalConfigError,
    );
  });

  it('does not throw when --workspace is a valid directory', async () => {
    const argv = { ...baseArgv(), workspace: tmpDir };
    const settings = createTestMergedSettings();
    // Should not throw — we just verify it reaches the point past validation.
    // It may fail later for unrelated reasons (missing auth etc.) in unit tests,
    // so we only assert no FatalConfigError from workspace validation.
    try {
      await loadCliConfig(settings, 'session-id', argv);
    } catch (err) {
      expect(err).not.toBeInstanceOf(FatalConfigError);
    }
  });
});
