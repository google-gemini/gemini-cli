/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AllowedPathChecker } from './built-in.js';
import type { SafetyCheckInput } from './protocol.js';
import { SafetyCheckDecision } from './protocol.js';
import type { FunctionCall } from '@google/genai';

let actualFs: typeof import('node:fs');

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn(actual.realpathSync),
    existsSync: vi.fn(actual.existsSync),
  };
});

describe('AllowedPathChecker', () => {
  let checker: AllowedPathChecker;
  let testRootDir: string;
  let mockCwd: string;
  let mockWorkspaces: string[];

  beforeEach(async () => {
    actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    checker = new AllowedPathChecker();
    testRootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'safety-test-')),
    );
    mockCwd = path.join(testRootDir, 'home', 'user', 'project');
    fs.mkdirSync(mockCwd, { recursive: true });
    mockWorkspaces = [
      mockCwd,
      path.join(testRootDir, 'home', 'user', 'other-project'),
    ];
    fs.mkdirSync(mockWorkspaces[1], { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (actualFs.existsSync(testRootDir)) {
      actualFs.rmSync(testRootDir, { recursive: true, force: true });
    }
  });

  const createInput = (
    toolArgs: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): SafetyCheckInput => ({
    protocolVersion: '1.0.0',
    toolCall: {
      name: 'test_tool',
      args: toolArgs,
    } as unknown as FunctionCall,
    context: {
      environment: {
        cwd: mockCwd,
        workspaces: mockWorkspaces,
      },
    },
    config,
  });

  it('should allow paths within CWD', async () => {
    const filePath = path.join(mockCwd, 'file.txt');
    fs.writeFileSync(filePath, 'test content');
    const input = createInput({
      path: filePath,
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should allow paths within workspace roots', async () => {
    const filePath = path.join(mockWorkspaces[1], 'data.json');
    fs.writeFileSync(filePath, 'test content');
    const input = createInput({
      path: filePath,
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should deny paths outside allowed areas', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, 'secret');
    const input = createInput({ path: outsidePath });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain('outside of the allowed workspace');
  });

  it('should deny paths using ../ to escape', async () => {
    const secretPath = path.join(testRootDir, 'home', 'user', 'secret.txt');
    fs.writeFileSync(secretPath, 'secret');
    const input = createInput({
      path: path.join(mockCwd, '..', 'secret.txt'),
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
  });

  it('should check multiple path arguments', async () => {
    const passwdPath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(passwdPath), { recursive: true });
    fs.writeFileSync(passwdPath, 'secret');
    const srcPath = path.join(mockCwd, 'src.txt');
    fs.writeFileSync(srcPath, 'source content');

    const input = createInput({
      source: srcPath,
      destination: passwdPath,
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain(passwdPath);
  });

  it('should handle non-existent paths gracefully if they are inside allowed dir', async () => {
    const input = createInput({
      path: path.join(mockCwd, 'new-file.txt'),
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should deny access if path contains a symlink pointing outside allowed directories', async () => {
    const symlinkPath = path.join(mockCwd, 'symlink');
    const targetPath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'secret');

    // On Windows, symlink Sync often fails without admin rights.
    // We mock the filesystem behavior to simulate a malicious symlink.
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString() === symlinkPath) return true;
      return actualFs.existsSync(p);
    });
    vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString() === symlinkPath) return targetPath;
      return actualFs.realpathSync(p);
    });

    const input = createInput({ path: symlinkPath });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain(
      'outside of the allowed workspace directories',
    );
  });

  it('should allow access if path contains a symlink pointing INSIDE allowed directories', async () => {
    const symlinkPath = path.join(mockCwd, 'symlink-inside');
    const realFilePath = path.join(mockCwd, 'real-file');
    fs.writeFileSync(realFilePath, 'real content');

    // On Windows, symlink Sync often fails without admin rights.
    // We mock the filesystem behavior to simulate a valid symlink.
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString() === symlinkPath) return true;
      return actualFs.existsSync(p);
    });
    vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => {
      if (p.toString() === symlinkPath) return realFilePath;
      return actualFs.realpathSync(p);
    });

    const input = createInput({ path: symlinkPath });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should check explicitly included arguments', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, 'secret');
    const input = createInput(
      { custom_arg: outsidePath },
      { included_args: ['custom_arg'] },
    );
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain('outside of the allowed workspace');
  });

  it('should skip explicitly excluded arguments', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, 'secret');
    // Normally 'path' would be checked, but we exclude it
    const input = createInput(
      { path: outsidePath },
      { excluded_args: ['path'] },
    );
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should handle both included and excluded arguments', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, 'secret');
    const input = createInput(
      {
        path: outsidePath, // Excluded
        custom_arg: outsidePath, // Included
      },
      {
        excluded_args: ['path'],
        included_args: ['custom_arg'],
      },
    );
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    // Should be denied because of custom_arg, not path
    expect(result.reason).toContain(outsidePath);
  });

  it('should check nested path arguments', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, 'secret');
    const input = createInput({
      nested: {
        path: outsidePath,
      },
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain(outsidePath);
    expect(result.reason).toContain('nested.path');
  });

  it('should support dot notation for included_args', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, 'secret');
    const input = createInput(
      {
        nested: {
          custom: outsidePath,
        },
      },
      { included_args: ['nested.custom'] },
    );
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain(outsidePath);
    expect(result.reason).toContain('nested.custom');
  });

  it('should support dot notation for excluded_args', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true });
    fs.writeFileSync(outsidePath, 'secret');
    const input = createInput(
      {
        nested: {
          path: outsidePath,
        },
      },
      { excluded_args: ['nested.path'] },
    );
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });
});
