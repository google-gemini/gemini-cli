/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCliConfig, parseArguments } from './config.js';
import * as trustedFolders from './trustedFolders.js';
import { loadServerHierarchicalMemory } from '@google/gemini-cli-core';
import { type Settings, createTestMergedSettings } from './settings.js';

vi.mock('./trustedFolders.js');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    loadServerHierarchicalMemory: vi.fn(),
    getPty: vi.fn().mockResolvedValue({ name: 'test-pty' }),
    getVersion: vi.fn().mockResolvedValue('0.0.0-test'),
  };
});

describe('Agent Skills Backward Compatibility', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trustedFolders.isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
    } as unknown as trustedFolders.TrustResult);
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe('loadCliConfig', () => {
    it('should default skillsSupport to true when no settings are present', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        memoryContent: '',
        fileCount: 0,
        filePaths: [],
      });

      process.argv = ['node', 'gemini'];
      const settings = createTestMergedSettings({});
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(
        (
          config as unknown as { isSkillsSupportEnabled: () => boolean }
        ).isSkillsSupportEnabled(),
      ).toBe(true);
    });

    it('should prioritize skills.enabled=false from settings', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        memoryContent: '',
        fileCount: 0,
        filePaths: [],
      });

      const settings = createTestMergedSettings({
        skills: { enabled: false },
      } as unknown as Settings);

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(
        (
          config as unknown as { isSkillsSupportEnabled: () => boolean }
        ).isSkillsSupportEnabled(),
      ).toBe(false);
    });

    it('should support legacy experimental.skills=true from settings', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        memoryContent: '',
        fileCount: 0,
        filePaths: [],
      });

      const settings = createTestMergedSettings({
        experimental: { skills: true },
      } as unknown as Settings);

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(
        (
          config as unknown as { isSkillsSupportEnabled: () => boolean }
        ).isSkillsSupportEnabled(),
      ).toBe(true);
    });

    it('should prioritize legacy experimental.skills=true over new skills.enabled=false', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        memoryContent: '',
        fileCount: 0,
        filePaths: [],
      });

      const settings = createTestMergedSettings({
        skills: { enabled: false },
        experimental: { skills: true },
      } as unknown as Settings);

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(
        (
          config as unknown as { isSkillsSupportEnabled: () => boolean }
        ).isSkillsSupportEnabled(),
      ).toBe(true);
    });

    it('should still be enabled by default if legacy experimental.skills is false (since new default is true)', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        memoryContent: '',
        fileCount: 0,
        filePaths: [],
      });

      const settings = createTestMergedSettings({
        experimental: { skills: false },
      } as unknown as Settings);

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(
        (
          config as unknown as { isSkillsSupportEnabled: () => boolean }
        ).isSkillsSupportEnabled(),
      ).toBe(true);
    });
  });
});
