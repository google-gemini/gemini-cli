/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePolicy } from './policy-generator.js';
import { SafetyCheckDecision } from '../protocol.js';
import type { Config } from '../../config/config.js';
import type { ContentGenerator } from '../../core/contentGenerator.js';
import { LlmRole } from '../../telemetry/index.js';

describe('policy_generator', () => {
  let mockConfig: Config;
  let mockContentGenerator: ContentGenerator;

  beforeEach(() => {
    mockContentGenerator = {
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    mockConfig = {
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
    } as unknown as Config;
  });

  it('should return a policy object when content generator is available', async () => {
    const mockPolicy = {
      read_file: {
        permissions: SafetyCheckDecision.ALLOW,
        constraints: 'None',
        rationale: 'Test',
      },
    };
    mockContentGenerator.generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  policies: [
                    {
                      tool_name: 'read_file',
                      policy: mockPolicy.read_file,
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await generatePolicy(
      'test prompt',
      'trusted content',
      mockConfig,
    );

    expect(mockConfig.getContentGenerator).toHaveBeenCalled();
    expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          responseSchema: expect.any(Object),
        }),
        contents: expect.any(Array),
      }),
      'conseca-policy-generation',
      LlmRole.SUBAGENT,
    );
    expect(result.policy).toEqual(mockPolicy);
    expect(result.error).toBeUndefined();
  });

  it('should handle missing content generator gracefully', async () => {
    vi.mocked(mockConfig.getContentGenerator).mockReturnValue(
      undefined as unknown as ContentGenerator,
    );

    const result = await generatePolicy(
      'test prompt',
      'trusted content',
      mockConfig,
    );

    expect(result.policy).toEqual({});
    expect(result.error).toBe('Content generator not initialized');
  });
  it('should prevent template injection (double interpolation)', async () => {
    mockContentGenerator.generateContent = vi.fn().mockResolvedValue({});

    const userPrompt = '{{trusted_content}}';
    const trustedContent = 'SECRET_DATA';

    await generatePolicy(userPrompt, trustedContent, mockConfig);

    const generateContentCall = vi.mocked(mockContentGenerator.generateContent)
      .mock.calls[0];
    const request = generateContentCall[0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const promptText = request.contents[0].parts[0].text;

    // The user prompt should contain the literal placeholder, NOT the secret data
    expect(promptText).toContain('User Prompt: "{{trusted_content}}"');
    expect(promptText).not.toContain('User Prompt: "SECRET_DATA"');

    // The trusted tools section SHOULD contain the secret data
    expect(promptText).toContain('Trusted Tools (Context):\nSECRET_DATA');
  });
});
