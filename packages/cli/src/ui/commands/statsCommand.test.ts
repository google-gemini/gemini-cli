/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { statsCommand } from './statsCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import { startupProfiler, type Config } from '@google/gemini-cli-core';

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

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(endTime);

    // 1. Create the mock context with all default values
    mockContext = createMockCommandContext();

    // 2. Directly set the property on the created mock context
    mockContext.session.stats.sessionStartTime = startTime;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should display general session stats when run with no subcommand', async () => {
    if (!statsCommand.action) throw new Error('Command has no action');

    mockContext.services.config = {
      refreshUserQuota: vi.fn(),
      refreshAvailableCredits: vi.fn(),
      getUserTierName: vi.fn(),
      getUserPaidTier: vi.fn(),
      getModel: vi.fn(),
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

    mockContext.services.config = {
      refreshUserQuota: mockRefreshUserQuota,
      getUserTierName: mockGetUserTierName,
      getModel: mockGetModel,
      getQuotaRemaining: mockGetQuotaRemaining,
      getQuotaLimit: mockGetQuotaLimit,
      getQuotaResetTime: mockGetQuotaResetTime,
      getUserPaidTier: vi.fn(),
      refreshAvailableCredits: vi.fn(),
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

  it('should display perf stats when using the "perf" subcommand', () => {
    const perfSubCommand = statsCommand.subCommands?.find(
      (sc) => sc.name === 'perf',
    );
    if (!perfSubCommand?.action) throw new Error('Subcommand has no action');

    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100 * 1024 * 1024,
      heapUsed: 50 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      external: 5 * 1024 * 1024,
      arrayBuffers: 0,
    });
    vi.spyOn(startupProfiler, 'getLastFlushResults').mockReturnValue([
      {
        name: 'load_settings',
        duration_ms: 42,
        cpu_usage_user_usec: 100,
        cpu_usage_system_usec: 50,
        start_time_usec: 1000,
        end_time_usec: 43000,
      },
    ]);

    mockContext.session.stats.metrics = {
      models: {
        'gemini-2.5-pro': {
          api: {
            totalRequests: 1,
            totalErrors: 0,
            totalLatencyMs: 1200,
          },
          tokens: {
            input: 150,
            prompt: 200,
            candidates: 100,
            total: 300,
            cached: 70,
            thoughts: 0,
            tool: 0,
          },
          roles: {},
        },
      },
      tools: {
        totalCalls: 2,
        totalSuccess: 2,
        totalFail: 0,
        totalDurationMs: 800,
        totalDecisions: {
          accept: 1,
          reject: 0,
          modify: 0,
          auto_accept: 1,
        },
        byName: {},
      },
      files: {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    perfSubCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.PERF_STATS,
      memory: {
        rss: 100 * 1024 * 1024,
        heapUsed: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsedPercent: 50,
        external: 5 * 1024 * 1024,
      },
      runtime: {
        apiTimeMs: 1200,
        apiTimePercent: 60,
        toolTimeMs: 800,
        toolTimePercent: 40,
        cacheEfficiency: 35,
      },
      startupPhases: [
        {
          name: 'load_settings',
          duration_ms: 42,
          cpu_usage_user_usec: 100,
          cpu_usage_system_usec: 50,
          start_time_usec: 1000,
          end_time_usec: 43000,
        },
      ],
    });
  });
});
