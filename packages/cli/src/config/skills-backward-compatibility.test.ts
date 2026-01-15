/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCliConfig, parseArguments } from './config.js';
import * as trustedFolders from './trustedFolders.js';
import { loadServerHierarchicalMemory } from '@google/gemini-cli-core';

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
    vi.mocked(trustedFolders.isWorkspaceTrusted).mockResolvedValue({
      isTrusted: true,
      reason: 'test',
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe('loadCliConfig', () => {
    it('should default skillsSupport to true when no settings are present', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        settings: {},
        configFiles: [],
      });

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        {},
        'test-session',
        await parseArguments({}),
      );
      expect(config.skillsSupport).toBe(true);
    });

    it('should prioritize skills.enabled=false from settings', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        settings: {},
        configFiles: [],
      });

      const settings = {
        skills: { enabled: false },
      };

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(config.skillsSupport).toBe(false);
    });

    it('should support legacy experimental.skills=true from settings', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        settings: {},
        configFiles: [],
      });

      const settings = {
        experimental: { skills: true },
      };

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(config.skillsSupport).toBe(true);
    });

    it('should support legacy experimental.skills=false from settings', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        settings: {},
        configFiles: [],
      });

      const settings = {
        experimental: { skills: false },
      };

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(config.skillsSupport).toBe(false);
    });

    it('should prioritize new skills.enabled over legacy experimental.skills in settings', async () => {
      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue({
        settings: {},
        configFiles: [],
      });

      const settings = {
        skills: { enabled: true },
        experimental: { skills: false },
      };

      process.argv = ['node', 'gemini'];
      const config = await loadCliConfig(
        settings,
        'test-session',
        await parseArguments(settings),
      );
      expect(config.skillsSupport).toBe(true);
    });
  });
});
