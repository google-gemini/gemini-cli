/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInstallSkill = vi.hoisted(() => vi.fn());
const mockRequestConsentNonInteractive = vi.hoisted(() => vi.fn());
const mockSkillsConsentString = vi.hoisted(() => vi.fn());

vi.mock('../../utils/skillUtils.js', () => ({
  installSkill: mockInstallSkill,
}));

vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: mockRequestConsentNonInteractive,
  skillsConsentString: mockSkillsConsentString,
}));

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: { log: vi.fn(), error: vi.fn() },
}));

import { debugLogger } from '@google/gemini-cli-core';
import { handleInstall, installCommand } from './install.js';

describe('skill install command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockSkillsConsentString.mockResolvedValue('Mock Consent String');
    mockRequestConsentNonInteractive.mockResolvedValue(true);
  });

  describe('installCommand', () => {
    it('should have correct command and describe', () => {
      expect(installCommand.command).toBe(
        'install <source> [--scope] [--path]',
      );
      expect(installCommand.describe).toBe(
        'Installs an agent skill from a git repository URL or a local path.',
      );
    });
  });

  it('should call installSkill with correct arguments for user scope', async () => {
    mockInstallSkill.mockImplementation(async (_s, _sc, _p, _ol, rc) => {
      await rc([]);
      return [{ name: 'test-skill', location: '/mock/user/skills/test-skill' }];
    });

    await handleInstall({
      source: 'https://example.com/repo.git',
      scope: 'user',
    });

    expect(mockInstallSkill).toHaveBeenCalledWith(
      'https://example.com/repo.git',
      'user',
      undefined,
      expect.any(Function),
      expect.any(Function),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Successfully installed skill: test-skill'),
    );
    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('location: /mock/user/skills/test-skill'),
    );
    expect(mockRequestConsentNonInteractive).toHaveBeenCalledWith(
      'Mock Consent String',
    );
  });

  it('should skip prompt and log consent when --consent is provided', async () => {
    mockInstallSkill.mockImplementation(async (_s, _sc, _p, _ol, rc) => {
      await rc([]);
      return [{ name: 'test-skill', location: '/mock/user/skills/test-skill' }];
    });

    await handleInstall({
      source: 'https://example.com/repo.git',
      consent: true,
    });

    expect(mockRequestConsentNonInteractive).not.toHaveBeenCalled();
    expect(debugLogger.log).toHaveBeenCalledWith(
      'You have consented to the following:',
    );
    expect(debugLogger.log).toHaveBeenCalledWith('Mock Consent String');
    expect(mockInstallSkill).toHaveBeenCalled();
  });

  it('should abort installation if consent is denied', async () => {
    mockRequestConsentNonInteractive.mockResolvedValue(false);
    mockInstallSkill.mockImplementation(async (_s, _sc, _p, _ol, rc) => {
      if (!(await rc([]))) {
        throw new Error('Skill installation cancelled by user.');
      }
      return [];
    });

    await handleInstall({
      source: 'https://example.com/repo.git',
    });

    expect(debugLogger.error).toHaveBeenCalledWith(
      'Skill installation cancelled by user.',
    );
    expect(process.exit).toHaveBeenCalledWith(1);
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
