/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enforcePolicy } from './policy_enforcer.js';
import type { Config } from '../../config/config.js';
import type { ContentGenerator } from '../../core/contentGenerator.js';
import { SafetyCheckDecision } from '../protocol.js';
import type { FunctionCall } from '@google/genai';

describe('policy_enforcer', () => {
  let mockConfig: Config;
  let mockContentGenerator: ContentGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContentGenerator = {
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    mockConfig = {
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
    } as unknown as Config;
  });

  it('should return ALLOW when content generator returns ALLOW', async () => {
    mockContentGenerator.generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { text: JSON.stringify({ decision: 'ALLOW', reason: 'Safe' }) },
            ],
          },
        },
      ],
    });

    const toolCall: FunctionCall = { name: 'testTool', args: {} };
    const policy = {
      testTool: {
        permissions: 'ALLOW' as const,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    const result = await enforcePolicy(policy, toolCall, mockConfig);

    expect(mockConfig.getContentGenerator).toHaveBeenCalled();
    expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        config: expect.objectContaining({
          responseMimeType: 'application/json',
        }),
        contents: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Security Policy:'),
              }),
            ]),
          }),
        ]),
      }),
      'conseca-policy-enforcement',
    );
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should handle missing content generator gracefully (error case)', async () => {
    vi.mocked(mockConfig.getContentGenerator).mockReturnValue(
      undefined as unknown as ContentGenerator,
    );

    const toolCall: FunctionCall = { name: 'testTool', args: {} };
    const policy = {
      testTool: {
        permissions: 'ALLOW' as const,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    const result = await enforcePolicy(policy, toolCall, mockConfig);

    expect(result.decision).toBe(SafetyCheckDecision.DENY);
  });

  it('should DENY if tool name is missing', async () => {
    const toolCall = { args: {} } as FunctionCall;
    const policy = {};
    const result = await enforcePolicy(policy, toolCall, mockConfig);

    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toBe('Tool name is missing');
  });
});
