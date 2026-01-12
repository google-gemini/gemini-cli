/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInstallSkill = vi.hoisted(() => vi.fn());

vi.mock('../../utils/skillUtils.js', () => ({
  installSkill: mockInstallSkill,
}));

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: { log: vi.fn(), error: vi.fn() },
}));

import { debugLogger } from '@google/gemini-cli-core';
import { handleInstall } from './install.js';

describe('skill install command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('should call installSkill with correct arguments for user scope', async () => {
    mockInstallSkill.mockResolvedValue([
      { name: 'test-skill', location: '/mock/user/skills/test-skill' },
    ]);

    await handleInstall({
      source: 'https://example.com/repo.git',
      scope: 'user',
    });

    expect(mockInstallSkill).toHaveBeenCalledWith(
      'https://example.com/repo.git',
      'user',
      undefined,
      expect.any(Function),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Successfully installed skill: test-skill'),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('location: /mock/user/skills/test-skill'),
    );
  });

  it('should call installSkill with correct arguments for workspace scope and subpath', async () => {
    mockInstallSkill.mockResolvedValue([
      { name: 'test-skill', location: '/mock/workspace/skills/test-skill' },
    ]);

    await handleInstall({
      source: 'https://example.com/repo.git',
      scope: 'workspace',
      path: 'my-skills-dir',
    });

    expect(mockInstallSkill).toHaveBeenCalledWith(
      'https://example.com/repo.git',
      'workspace',
      'my-skills-dir',
      expect.any(Function),
    );
  });

  it('should handle errors gracefully', async () => {
    mockInstallSkill.mockRejectedValue(new Error('Install failed'));

    await handleInstall({ source: '/local/path' });

    expect(debugLogger.error).toHaveBeenCalledWith('Install failed');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
