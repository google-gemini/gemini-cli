/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Config } from './config.js';
import { HookEventName } from '../hooks/types.js';
import { LocalSubagentInvocation } from '../agents/local-invocation.js';

vi.mock('../agents/local-invocation.js', () => ({
  LocalSubagentInvocation: vi.fn(),
}));

vi.mock('../agents/deep-validation-agent.js', () => ({
  DeepValidationAgent: vi.fn().mockReturnValue({
    kind: 'local',
    name: 'deep-validation',
    displayName: 'Deep Validation Agent',
    description: 'test description',
    inputConfig: { inputSchema: {} },
    outputConfig: { outputName: 'validationResult', schema: { safeParse: vi.fn() } },
    promptConfig: { systemPrompt: 'test prompt', query: 'test query' },
    modelConfig: { model: 'inherit' },
    runConfig: {},
  }),
}));

describe('Deep Validation Integration', () => {
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register AfterAgent hook when deepValidation is enabled', async () => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/tmp',
      debugMode: false,
      cwd: '/tmp',
      model: 'test-model',
      enableHooks: true,
      deepValidation: true,
    } as any);

    await config.initialize();

    const hookSystem = config.getHookSystem();
    expect(hookSystem).toBeDefined();

    const hooks = hookSystem?.getAllHooks();
    expect(hooks).toBeDefined();
    expect(hooks?.some(h => h.config.name === 'deep-validation-hook' && h.eventName === HookEventName.AfterAgent)).toBe(true);
  });

  it('should NOT register AfterAgent hook when deepValidation is disabled', async () => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/tmp',
      debugMode: false,
      cwd: '/tmp',
      model: 'test-model',
      enableHooks: true,
      deepValidation: false,
    } as any);

    await config.initialize();

    const hookSystem = config.getHookSystem();
    const hooks = hookSystem?.getAllHooks();
    expect(hooks?.some(h => h.config.name === 'deep-validation-hook')).toBeFalsy();
  });

  it('should execute DeepValidationAgent when hook is triggered', async () => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/tmp',
      debugMode: false,
      cwd: '/tmp',
      model: 'test-model',
      enableHooks: true,
      deepValidation: true,
    } as any);

    const mockExecute = vi.fn().mockResolvedValue({
      returnDisplay: {
        result: JSON.stringify({
          report: 'All good',
          isSatisfied: true,
        }),
      },
    });

    (LocalSubagentInvocation as any).mockImplementation(() => ({
      execute: mockExecute,
    }));

    await config.initialize();

    const hookSystem = config.getHookSystem();
    const deepValidationEntry = hookSystem?.getAllHooks()?.find(h => h.config.name === 'deep-validation-hook');

    expect(deepValidationEntry).toBeDefined();

    if (deepValidationEntry && 'action' in deepValidationEntry.config) {
      const result = await (deepValidationEntry.config as any).action({ prompt: 'original prompt' } as any);
      
      expect(LocalSubagentInvocation).toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalled();
      expect(result).toMatchObject({
        continue: true,
        systemMessage: expect.stringContaining('✅ Deep validation satisfied.'),
      });
      expect(result).toMatchObject({
        systemMessage: expect.stringContaining('All good'),
      });
    }
  });
});
