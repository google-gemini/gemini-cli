/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Config, type ConfigParameters } from './config.js';
import { createTmpDir, cleanupTmpDir } from '@google/gemini-cli-test-utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    setTools: vi.fn().mockResolvedValue(undefined),
    updateSystemInstruction: vi.fn(),
  })),
}));

vi.mock('../core/contentGenerator.js');
vi.mock('../telemetry/index.js');
vi.mock('../core/tokenLimits.js');
vi.mock('../services/fileDiscoveryService.js');
vi.mock('../services/gitService.js');
vi.mock('../services/trackerService.js');

describe('Config includeDirectories initialization', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTmpDir({});
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
    vi.clearAllMocks();
  });

  it('skips missing pending include directories during initialize', async () => {
    const missingIncludeDir = '.kilocode/rules';
    const existingIncludeDir = '.cursor/rules';
    const existingIncludeDirPath = path.join(tmpDir, existingIncludeDir);
    const missingIncludeDirPath = path.join(tmpDir, missingIncludeDir);
    await fs.mkdir(existingIncludeDirPath, { recursive: true });
    const realExistingIncludeDirPath = await fs.realpath(
      existingIncludeDirPath,
    );
    const warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    const params: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: tmpDir,
      model: 'test-model',
      cwd: tmpDir,
      debugMode: false,
      checkpointing: false,
      includeDirectories: [missingIncludeDir, existingIncludeDir],
    };

    const config = new Config(params);
    await config.initialize();

    expect(config.getWorkspaceContext().getDirectories()).toEqual([
      await fs.realpath(tmpDir),
      realExistingIncludeDirPath,
    ]);
    expect(config.sandboxManager.getOptions()?.includeDirectories).toContain(
      realExistingIncludeDirPath,
    );
    expect(
      config.sandboxManager.getOptions()?.includeDirectories,
    ).not.toContain(missingIncludeDir);
    expect(
      config.sandboxManager.getOptions()?.includeDirectories,
    ).not.toContain(missingIncludeDirPath);
    expect(warnSpy).toHaveBeenCalledWith(
      `[WARN] Skipping unreadable directory: ${missingIncludeDir} (Directory does not exist: ${missingIncludeDirPath})`,
    );
  });
});
