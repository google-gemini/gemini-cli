/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { statsCommand } from './statsCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    UserAccountManager: vi.fn().mockImplementation(() => ({
      getCachedGoogleAccount: vi.fn().mockReturnValue('mock@example.com'),
    })),
    getG1CreditBalance: vi.fn().mockReturnValue(undefined),
  };
});

describe('statsCommand', () => {
  let mockContext: CommandContext;
  const startTime = new Date('2025-07-14T10:00:00.000Z');
  const endTime = new Date('2025-07-14T10:00:30.000Z');

  let tempProjectDir: string | undefined;

  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
    vi.useFakeTimers();
    vi.setSystemTime(endTime);

    // 1. Create the mock context with all default values
    mockContext = createMockCommandContext();

    // 2. Directly set the property on the created mock context
    mockContext.session.stats.sessionStartTime = startTime;
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    if (tempProjectDir) {
      await fs.rm(tempProjectDir, { recursive: true, force: true });
      tempProjectDir = undefined;
    }
  });

  it('should display general session stats when run with no subcommand', async () => {
    if (!statsCommand.action) throw new Error('Command has no action');

    mockContext.services.agentContext = {
      refreshUserQuota: vi.fn(),
      refreshAvailableCredits: vi.fn(),
      getUserTierName: vi.fn(),
      getUserPaidTier: vi.fn(),
      getModel: vi.fn(),
      get config() {
        return this;
      },
    } as unknown as Config;

    await statsCommand.action(mockContext, '');

    const expectedDuration = formatDuration(
      endTime.getTime() - startTime.getTime(),
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.STATS,
      duration: expectedDuration,
      selectedAuthType: '',
      tier: undefined,
      userEmail: 'mock@example.com',
      currentModel: undefined,
      creditBalance: undefined,
    });
  });

  it('should fetch and display quota if config is available', async () => {
    if (!statsCommand.action) throw new Error('Command has no action');

    const mockQuota = { buckets: [] };
    const mockRefreshUserQuota = vi.fn().mockResolvedValue(mockQuota);
    const mockGetUserTierName = vi.fn().mockReturnValue('Basic');
    const mockGetModel = vi.fn().mockReturnValue('gemini-pro');
    const mockGetQuotaRemaining = vi.fn().mockReturnValue(85);
    const mockGetQuotaLimit = vi.fn().mockReturnValue(100);
    const mockGetQuotaResetTime = vi
      .fn()
      .mockReturnValue('2025-01-01T12:00:00Z');

    mockContext.services.agentContext = {
      refreshUserQuota: mockRefreshUserQuota,
      getUserTierName: mockGetUserTierName,
      getModel: mockGetModel,
      getQuotaRemaining: mockGetQuotaRemaining,
      getQuotaLimit: mockGetQuotaLimit,
      getQuotaResetTime: mockGetQuotaResetTime,
      getUserPaidTier: vi.fn(),
      refreshAvailableCredits: vi.fn(),
      get config() {
        return this;
      },
    } as unknown as Config;

    await statsCommand.action(mockContext, '');

    expect(mockRefreshUserQuota).toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        quotas: mockQuota,
        tier: 'Basic',
        currentModel: 'gemini-pro',
        pooledRemaining: 85,
        pooledLimit: 100,
        pooledResetTime: '2025-01-01T12:00:00Z',
      }),
    );
  });

  it('should display model stats when using the "model" subcommand', () => {
    const modelSubCommand = statsCommand.subCommands?.find(
      (sc) => sc.name === 'model',
    );
    if (!modelSubCommand?.action) throw new Error('Subcommand has no action');

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    modelSubCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.MODEL_STATS,
      selectedAuthType: '',
      tier: undefined,
      userEmail: 'mock@example.com',
      currentModel: undefined,
      pooledRemaining: undefined,
      pooledLimit: undefined,
    });
  });

  it('should display tool stats when using the "tools" subcommand', () => {
    const toolsSubCommand = statsCommand.subCommands?.find(
      (sc) => sc.name === 'tools',
    );
    if (!toolsSubCommand?.action) throw new Error('Subcommand has no action');

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    toolsSubCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.TOOL_STATS,
    });
  });

  describe('heatmap subcommand', () => {
    it('aggregates local .jsonl chat recordings and supports empty, today, yesterday, and YYYY-MM-DD arguments', async () => {
      tempProjectDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gemini-stats-heatmap-'),
      );
      const chatsDir = path.join(tempProjectDir, 'chats');
      await fs.mkdir(chatsDir, { recursive: true });
      await fs.writeFile(
        path.join(chatsDir, 'session-1.jsonl'),
        [
          JSON.stringify({ sessionId: 'sess-1', projectHash: 'hash' }),
          JSON.stringify({
            id: 'turn-1',
            type: 'gemini',
            timestamp: '2025-07-13T18:00:00.000Z',
            tokens: { input: 200, output: 100, cached: 50, total: 300 },
            model: 'gemini-2.5-pro',
          }),
          JSON.stringify({
            id: 'turn-2',
            type: 'gemini',
            timestamp: '2025-07-14T09:00:00.000Z',
            tokens: { input: 400, output: 200, cached: 100, total: 600 },
            model: 'gemini-2.5-flash',
          }),
        ].join('\n') + '\n',
      );

      mockContext.services.agentContext = {
        storage: {
          getProjectTempDir: () => tempProjectDir,
        },
        get config() {
          return this;
        },
      } as unknown as Config;

      const heatmapSubCommand = statsCommand.subCommands?.find(
        (sc) => sc.name === 'heatmap',
      );
      expect(heatmapSubCommand?.action).toBeDefined();

      // Default (no date argument)
      await heatmapSubCommand!.action!(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: MessageType.HEATMAP_STATS,
          today: '2025-07-14',
          selectedDate: undefined,
          totalWindowTokens: 900,
          totalWindowSessions: 1,
          totalWindowTurns: 2,
          currentStreak: 2,
          longestStreak: 2,
          dailyUsage: expect.objectContaining({
            '2025-07-13': expect.objectContaining({ totalTokens: 300 }),
            '2025-07-14': expect.objectContaining({ totalTokens: 600 }),
          }),
        }),
      );

      // 'today' argument
      await heatmapSubCommand!.action!(mockContext, 'today');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: MessageType.HEATMAP_STATS,
          selectedDate: '2025-07-14',
        }),
      );

      // 'yesterday' argument via parent action dispatch
      await statsCommand.action!(mockContext, 'heatmap yesterday');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: MessageType.HEATMAP_STATS,
          selectedDate: '2025-07-13',
        }),
      );

      // Explicit YYYY-MM-DD argument
      await heatmapSubCommand!.action!(mockContext, '2025-07-10');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: MessageType.HEATMAP_STATS,
          selectedDate: '2025-07-10',
        }),
      );
    });

    it('emits an error message when given an invalid date format', async () => {
      const heatmapSubCommand = statsCommand.subCommands?.find(
        (sc) => sc.name === 'heatmap',
      );
      expect(heatmapSubCommand?.action).toBeDefined();

      await heatmapSubCommand!.action!(mockContext, '2025-02-31');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith({
        type: MessageType.ERROR,
        text: "Invalid date format. Expected YYYY-MM-DD, 'today', or 'yesterday'.",
      });

      await heatmapSubCommand!.action!(mockContext, '../chats/other');
      expect(mockContext.ui.addItem).toHaveBeenLastCalledWith({
        type: MessageType.ERROR,
        text: "Invalid date format. Expected YYYY-MM-DD, 'today', or 'yesterday'.",
      });
    });

    it('provides today and yesterday argument completions', async () => {
      const heatmapSubCommand = statsCommand.subCommands?.find(
        (sc) => sc.name === 'heatmap',
      );
      expect(heatmapSubCommand?.completion).toBeDefined();

      expect(await heatmapSubCommand!.completion!(mockContext, '')).toEqual([
        'today',
        'yesterday',
      ]);
      expect(await heatmapSubCommand!.completion!(mockContext, 'to')).toEqual([
        'today',
      ]);
      expect(await heatmapSubCommand!.completion!(mockContext, 'Y')).toEqual([
        'yesterday',
      ]);
    });
  });
});
