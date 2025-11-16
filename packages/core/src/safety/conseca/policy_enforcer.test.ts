/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enforcePolicy } from './policy_enforcer.js';
import * as utilities from './utilities.js';
import { GeminiClient } from '../../core/client.js';
import { SafetyCheckDecision } from '../protocol.js';
import type { FunctionCall } from '@google/genai';

vi.mock('./utilities.js');

describe('policy_enforcer', () => {
  let mockClient: GeminiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      generateContent: vi.fn(),
    } as unknown as GeminiClient;
  });

  it('should return ALLOW when client returns ALLOW', async () => {
    mockClient.generateContent = vi.fn().mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify({ decision: 'ALLOW', reason: 'Safe' }) }]
        }
      }]
    });
    vi.mocked(utilities.getGeminiClient).mockResolvedValue(mockClient);
    
    const toolCall: FunctionCall = { name: 'testTool', args: {} };
    const policy = {
      testTool: {
        permissions: 'ALLOW' as const,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    const result = await enforcePolicy(policy, toolCall);

    expect(utilities.getGeminiClient).toHaveBeenCalled();
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          parts: expect.arrayContaining([
            expect.objectContaining({ text: expect.stringContaining('Security Policy for testTool:') })
          ])
        })
      ]),
      expect.anything()
    );
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should handle missing client gracefully (error case)', async () => {
    vi.mocked(utilities.getGeminiClient).mockRejectedValue(new Error('Failed'));

    const toolCall: FunctionCall = { name: 'testTool', args: {} };
    const policy = {
      testTool: {
        permissions: 'ALLOW' as const,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    const result = await enforcePolicy(policy, toolCall);

    expect(result.decision).toBe(SafetyCheckDecision.DENY);
  });

  it('should DENY if tool policy is missing', async () => {
    vi.mocked(utilities.getGeminiClient).mockResolvedValue(mockClient);
    
    const toolCall: FunctionCall = { name: 'unknownTool', args: {} };
    const policy = {};
    const result = await enforcePolicy(policy, toolCall);

    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain("No security policy generated for tool 'unknownTool'");
  });

  it('should DENY if tool name is missing', async () => {
    vi.mocked(utilities.getGeminiClient).mockResolvedValue(mockClient);
    
    const toolCall = { args: {} } as FunctionCall;
    const policy = {};
    const result = await enforcePolicy(policy, toolCall);

    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toBe('Tool name is missing.');
  });
});
