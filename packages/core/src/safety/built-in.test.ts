/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AllowedPathChecker } from './built-in.js';
import type { SafetyCheckInput } from './protocol.js';
import { SafetyCheckDecision } from './protocol.js';
import type { FunctionCall } from '@google/genai';

describe('AllowedPathChecker', () => {
  let checker: AllowedPathChecker;
  let testRootDir: string;
  let mockCwd: string;
  let mockWorkspaces: string[];

  beforeEach(async () => {
    checker = new AllowedPathChecker();
    testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safety-test-'));
    mockCwd = path.join(testRootDir, 'home', 'user', 'project');
    await fs.mkdir(mockCwd, { recursive: true });
    mockWorkspaces = [
      mockCwd,
      path.join(testRootDir, 'home', 'user', 'other-project'),
    ];
    await fs.mkdir(mockWorkspaces[1], { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  const createInput = (
    toolArgs: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): SafetyCheckInput => ({
    protocolVersion: '1.0.0',
    toolCall: {
      name: 'test_tool',
      args: toolArgs,
      config,
    } as unknown as FunctionCall,
    context: {
      environment: {
        cwd: mockCwd,
        workspaces: mockWorkspaces,
      },
    },
  });

  it('should allow paths within CWD', async () => {
    const filePath = path.join(mockCwd, 'file.txt');
    await fs.writeFile(filePath, 'test content');
    const input = createInput({
      path: filePath,
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should allow paths within workspace roots', async () => {
    const filePath = path.join(mockWorkspaces[1], 'data.json');
    await fs.writeFile(filePath, 'test content');
    const input = createInput({
      path: filePath,
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should deny paths outside allowed areas', async () => {
    const outsidePath = path.join(testRootDir, 'etc', 'passwd');
    await fs.mkdir(path.dirname(outsidePath), { recursive: true });
    await fs.writeFile(outsidePath, 'secret');
    const input = createInput({ path: outsidePath });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain('outside of the allowed workspace');
  });

  it('should deny paths using ../ to escape', async () => {
    const secretPath = path.join(testRootDir, 'home', 'user', 'secret.txt');
    await fs.writeFile(secretPath, 'secret');
    const input = createInput({
      path: path.join(mockCwd, '..', 'secret.txt'),
    });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
  });

  it('should allow additional paths from config', async () => {
    const safeDir = path.join(testRootDir, 'tmp', 'safe');
    await fs.mkdir(safeDir, { recursive: true });
    const filePath = path.join(safeDir, 'file.txt');
    await fs.writeFile(filePath, 'safe content');
    const input = createInput(
      { path: filePath },
      { additional_allowed_paths: [safeDir] },
    );
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should check multiple path arguments', async () => {
    const passwdPath = path.join(testRootDir, 'etc', 'passwd');
    await fs.mkdir(path.dirname(passwdPath), { recursive: true });
    await fs.writeFile(passwdPath, 'secret');
    const srcPath = path.join(mockCwd, 'src.txt');
    await fs.writeFile(srcPath, 'source content');

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
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, 'secret');

    // Create symlink: mockCwd/symlink -> targetPath
    await fs.symlink(targetPath, symlinkPath);

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
    await fs.writeFile(realFilePath, 'real content');

    // Create symlink: mockCwd/symlink-inside -> mockCwd/real-file
    await fs.symlink(realFilePath, symlinkPath);

    const input = createInput({ path: symlinkPath });
    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });
});
