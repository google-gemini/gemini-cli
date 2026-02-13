/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import * as fs from 'node:fs';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { saveDeepWorkState } from '../services/deepWorkState.js';
import {
  StartDeepWorkRunTool,
  StopDeepWorkRunTool,
} from './deep-work-tools.js';

describe('StartDeepWorkRunTool', () => {
  let tempRootDir: string;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    tempRootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deep-work-tool-test-')),
    );
    mockMessageBus = createMockMessageBus();

    mockConfig = {
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(tempRootDir),
      } as unknown as Config['storage'],
      getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
      setApprovedPlanPath: vi.fn(),
    };
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('restores approved plan path from persisted Deep Work state when starting a resumed iteration', async () => {
    const now = new Date().toISOString();
    const persistedPlanPath = '/tmp/approved-plan.md';
    await saveDeepWorkState(mockConfig as Config, {
      runId: 'deep-work-run-1',
      status: 'ready',
      prompt:
        'Implement a multi-step migration with verification loops and tests across modules.',
      approvedPlanPath: persistedPlanPath,
      maxRuns: 5,
      maxTimeMinutes: 60,
      completionPromise: null,
      requiredQuestions: [],
      iteration: 1,
      createdAt: now,
      startedAt: null,
      lastUpdatedAt: now,
      rejectionReason: null,
      readinessReport: {
        verdict: 'ready',
        missingRequiredQuestionIds: [],
        followUpQuestions: [],
        blockingReasons: [],
        singleShotRecommendation: false,
        reviewer: 'heuristic',
        generatedAt: now,
      },
    });

    const tool = new StartDeepWorkRunTool(
      mockConfig as Config,
      mockMessageBus as unknown as MessageBus,
    );

    const result = await tool.build({}).execute(new AbortController().signal);

    expect(mockConfig.setApprovedPlanPath).toHaveBeenCalledWith(
      persistedPlanPath,
    );
    expect(result.returnDisplay).toContain(
      `Plan context: ${persistedPlanPath}.`,
    );
  });

  it('returns detailed Deep Work summary stats when run is completed', async () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 125_000).toISOString();
    await saveDeepWorkState(mockConfig as Config, {
      runId: 'deep-work-run-2',
      status: 'running',
      prompt: 'Implement and verify multi-step auth migration.',
      approvedPlanPath: '/tmp/deep-plan.md',
      maxRuns: 8,
      maxTimeMinutes: 90,
      completionPromise: 'AUTH_MIGRATION_DONE',
      requiredQuestions: [
        {
          id: 'scope',
          question: 'What is the migration scope?',
          required: true,
          answer: 'Auth + session layer',
          done: true,
          updatedAt: startedAt,
        },
        {
          id: 'fallback',
          question: 'Rollback strategy?',
          required: true,
          answer: '',
          done: false,
          updatedAt: startedAt,
        },
      ],
      iteration: 3,
      createdAt: startedAt,
      startedAt,
      lastUpdatedAt: startedAt,
      rejectionReason: null,
      readinessReport: {
        verdict: 'ready',
        missingRequiredQuestionIds: [],
        followUpQuestions: [],
        blockingReasons: [],
        singleShotRecommendation: false,
        reviewer: 'heuristic',
        generatedAt: startedAt,
      },
    });

    const tool = new StopDeepWorkRunTool(
      mockConfig as Config,
      mockMessageBus as unknown as MessageBus,
    );

    const result = await tool
      .build({ mode: 'completed' })
      .execute(new AbortController().signal);

    expect(typeof result.returnDisplay).toBe('object');
    if (
      typeof result.returnDisplay !== 'object' ||
      !result.returnDisplay ||
      !('type' in result.returnDisplay) ||
      result.returnDisplay.type !== 'deep_work_summary'
    ) {
      return;
    }

    expect(result.returnDisplay).toMatchObject({
      type: 'deep_work_summary',
      status: 'completed',
      runId: 'deep-work-run-2',
      executionCount: 3,
      maxRuns: 8,
      maxTimeMinutes: 90,
      answeredRequiredQuestions: 1,
      totalRequiredQuestions: 2,
      readinessVerdict: 'ready',
      completionPromise: 'AUTH_MIGRATION_DONE',
      approvedPlanPath: '/tmp/deep-plan.md',
    });
    expect(result.returnDisplay.elapsedSeconds).toBeGreaterThan(0);
  });
});
