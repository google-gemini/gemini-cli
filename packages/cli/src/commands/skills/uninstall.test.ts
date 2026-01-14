/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUninstallSkill = vi.hoisted(() => vi.fn());

vi.mock('../../utils/skillUtils.js', () => ({
  uninstallSkill: mockUninstallSkill,
}));

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: { log: vi.fn(), error: vi.fn() },
}));

import { debugLogger } from '@google/gemini-cli-core';
import { handleUninstall, uninstallCommand } from './uninstall.js';

describe('skill uninstall command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  describe('uninstallCommand', () => {
    it('should have correct command and describe', () => {
      expect(uninstallCommand.command).toBe('uninstall <name> [--scope]');
      expect(uninstallCommand.describe).toBe(
        'Uninstalls an agent skill by name.',
      );
    });
  });

  it('should call uninstallSkill with correct arguments for user scope', async () => {
    mockUninstallSkill.mockResolvedValue({
      location: '/mock/user/skills/test-skill',
    });

    await handleUninstall({
      name: 'test-skill',
      scope: 'user',
    });

    expect(mockUninstallSkill).toHaveBeenCalledWith('test-skill', 'user');
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Successfully uninstalled skill: test-skill'),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('location: /mock/user/skills/test-skill'),
    );
  });

  it('should call uninstallSkill with correct arguments for workspace scope', async () => {
    mockUninstallSkill.mockResolvedValue({
      location: '/mock/workspace/skills/test-skill',
    });

    await handleUninstall({
      name: 'test-skill',
      scope: 'workspace',
    });

    expect(mockUninstallSkill).toHaveBeenCalledWith('test-skill', 'workspace');
  });

  it('should log an error if skill is not found', async () => {
    mockUninstallSkill.mockResolvedValue(null);

    await handleUninstall({ name: 'test-skill' });

    expect(debugLogger.error).toHaveBeenCalledWith(
      'Skill "test-skill" is not installed in the user scope.',
    );
  });

  it('should handle errors gracefully', async () => {
    mockUninstallSkill.mockRejectedValue(new Error('Uninstall failed'));

    await handleUninstall({ name: 'test-skill' });

    expect(debugLogger.error).toHaveBeenCalledWith('Uninstall failed');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
