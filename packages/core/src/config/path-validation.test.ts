/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Config } from './config.js';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({
      isDirectory: vi.fn().mockReturnValue(true),
    }),
    realpathSync: vi.fn((p) => p),
  };
});

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    resolveToRealPath: vi.fn((p) => p),
    isSubpath: (parent: string, child: string) => child.startsWith(parent),
  };
});

describe('Config Path Validation', () => {
  let config: Config;
  const targetDir = '/mock/workspace';
  const globalGeminiDir = path.join(os.homedir(), '.gemini');

  beforeEach(() => {
    config = new Config({
      targetDir,
      sessionId: 'test-session',
      debugMode: false,
      cwd: targetDir,
      model: 'test-model',
    });
  });

  it('should allow access to ~/.gemini if it is added to the workspace', () => {
    const geminiMdPath = path.join(globalGeminiDir, 'GEMINI.md');

    // Before adding, it should be denied
    expect(config.isPathAllowed(geminiMdPath)).toBe(false);

    // Add to workspace
    config.getWorkspaceContext().addDirectory(globalGeminiDir);

    // Now it should be allowed
    expect(config.isPathAllowed(geminiMdPath)).toBe(true);
    expect(config.validatePathAccess(geminiMdPath, 'read')).toBeNull();
    expect(config.validatePathAccess(geminiMdPath, 'write')).toBeNull();
  });

  it('should still allow project workspace paths', () => {
    const workspacePath = path.join(targetDir, 'src/index.ts');
    expect(config.isPathAllowed(workspacePath)).toBe(true);
    expect(config.validatePathAccess(workspacePath, 'read')).toBeNull();
  });
});
