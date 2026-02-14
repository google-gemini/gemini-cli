/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsecaSafetyChecker } from './conseca.js';
import { SafetyCheckDecision } from '../protocol.js';
import type { SafetyCheckInput } from '../protocol.js';
import {
  logConsecaPolicyGeneration,
  logConsecaVerdict,
} from '../../telemetry/index.js';
import type { Config } from '../../config/config.js';
import * as policyGenerator from './policy-generator.js';
import * as policyEnforcer from './policy-enforcer.js';

vi.mock('../../telemetry/index.js', () => ({
  logConsecaPolicyGeneration: vi.fn(),
  ConsecaPolicyGenerationEvent: vi.fn(),
  logConsecaVerdict: vi.fn(),
  ConsecaVerdictEvent: vi.fn(),
}));

vi.mock('./policy-generator.js');
vi.mock('./policy-enforcer.js');

describe('ConsecaSafetyChecker', () => {
  let checker: ConsecaSafetyChecker;
  let mockConfig: Config;

  beforeEach(() => {
    // Reset singleton instance to ensure clean state
    ConsecaSafetyChecker.resetInstance();
    // Get the fresh singleton instance
    checker = ConsecaSafetyChecker.getInstance();

    mockConfig = {
      enableConseca: true,
      getToolRegistry: vi.fn().mockReturnValue({
        getFunctionDeclarations: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Config;
    checker.setConfig(mockConfig);
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(policyGenerator.generatePolicy).mockResolvedValue({ policy: {} });
    vi.mocked(policyEnforcer.enforcePolicy).mockResolvedValue({
      decision: SafetyCheckDecision.ALLOW,
    });
  });

  it('should be a singleton', () => {
    const instance1 = ConsecaSafetyChecker.getInstance();
    const instance2 = ConsecaSafetyChecker.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should return ALLOW when no user prompt is present in context', async () => {
    const input: SafetyCheckInput = {
      protocolVersion: '1.0.0',
      toolCall: { name: 'testTool' },
      context: {
        environment: { cwd: '/tmp', workspaces: [] },
      },
    };

    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should return ALLOW if enableConseca is false', async () => {
    const disabledConfig = {
      enableConseca: false,
    } as unknown as Config;
    checker.setConfig(disabledConfig);

    const input: SafetyCheckInput = {
      protocolVersion: '1.0.0',
      toolCall: { name: 'testTool' },
      context: {
        environment: { cwd: '/tmp', workspaces: [] },
      },
    };

    const result = await checker.check(input);
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
    expect(result.reason).toBe('Conseca is disabled');
    expect(policyGenerator.generatePolicy).not.toHaveBeenCalled();
  });

  it('getPolicy should return cached policy if user prompt matches', async () => {
    const mockPolicy = {
      tool: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    vi.mocked(policyGenerator.generatePolicy).mockResolvedValue({
      policy: mockPolicy,
    });

    const policy1 = await checker.getPolicy('prompt', 'trusted', mockConfig);
    const policy2 = await checker.getPolicy('prompt', 'trusted', mockConfig);

    expect(policy1).toBe(mockPolicy);
    expect(policy2).toBe(mockPolicy);
    expect(policyGenerator.generatePolicy).toHaveBeenCalledTimes(1);
  });

  it('getPolicy should generate new policy if user prompt changes', async () => {
    const mockPolicy1 = {
      tool1: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    const mockPolicy2 = {
      tool2: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    vi.mocked(policyGenerator.generatePolicy)
      .mockResolvedValueOnce({ policy: mockPolicy1 })
      .mockResolvedValueOnce({ policy: mockPolicy2 });

    const policy1 = await checker.getPolicy('prompt1', 'trusted', mockConfig);
    const policy2 = await checker.getPolicy('prompt2', 'trusted', mockConfig);

    expect(policy1).toBe(mockPolicy1);
    expect(policy2).toBe(mockPolicy2);
    expect(policyGenerator.generatePolicy).toHaveBeenCalledTimes(2);
  });

  it('check should call getPolicy and enforcePolicy', async () => {
    const mockPolicy = {
      tool: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    vi.mocked(policyGenerator.generatePolicy).mockResolvedValue({
      policy: mockPolicy,
    });
    vi.mocked(policyEnforcer.enforcePolicy).mockResolvedValue({
      decision: SafetyCheckDecision.ALLOW,
    });

    const input: SafetyCheckInput = {
      protocolVersion: '1.0.0',
      toolCall: { name: 'tool', args: {} },
      context: {
        environment: { cwd: '.', workspaces: [] },
        history: {
          turns: [
            {
              user: { text: 'user prompt' },
              model: {},
            },
          ],
        },
      },
    };

    const result = await checker.check(input);

    expect(policyGenerator.generatePolicy).toHaveBeenCalledWith(
      'user prompt',
      expect.any(String),
      mockConfig,
    );
    expect(policyEnforcer.enforcePolicy).toHaveBeenCalledWith(
      mockPolicy,
      input.toolCall,
      mockConfig,
    );
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('check should return ALLOW if no user prompt found (fallback)', async () => {
    const input: SafetyCheckInput = {
      protocolVersion: '1.0.0',
      toolCall: { name: 'tool', args: {} },
      context: {
        environment: { cwd: '.', workspaces: [] },
      },
    };

    const result = await checker.check(input);

    expect(policyGenerator.generatePolicy).not.toHaveBeenCalled();
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  // Test state helpers
  it('should expose current state via helpers', async () => {
    const mockPolicy = {
      tool: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    vi.mocked(policyGenerator.generatePolicy).mockResolvedValue({
      policy: mockPolicy,
    });

    await checker.getPolicy('prompt', 'trusted', mockConfig);

    expect(checker.getCurrentPolicy()).toBe(mockPolicy);
    expect(checker.getActiveUserPrompt()).toBe('prompt');
  });
  it('should log policy generation event when config is set', async () => {
    const mockPolicy = {
      tool: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    vi.mocked(policyGenerator.generatePolicy).mockResolvedValue({
      policy: mockPolicy,
    });

    await checker.getPolicy('telemetry_prompt', 'trusted', mockConfig);

    expect(logConsecaPolicyGeneration).toHaveBeenCalledWith(
      mockConfig,
      expect.anything(),
    );
  });

  it('should log verdict event on check', async () => {
    const mockPolicy = {
      tool: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    vi.mocked(policyGenerator.generatePolicy).mockResolvedValue({
      policy: mockPolicy,
    });
    vi.mocked(policyEnforcer.enforcePolicy).mockResolvedValue({
      decision: SafetyCheckDecision.ALLOW,
      reason: 'Allowed by policy',
    });

    const input: SafetyCheckInput = {
      protocolVersion: '1.0.0',
      toolCall: { name: 'tool', args: {} },
      context: {
        environment: { cwd: '.', workspaces: [] },
        history: {
          turns: [
            {
              user: { text: 'user prompt' },
              model: {},
            },
          ],
        },
      },
    };

    await checker.check(input);

    expect(logConsecaVerdict).toHaveBeenCalledWith(
      mockConfig,
      expect.anything(),
    );
  });
});
