/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePolicy } from './policy_generator.js';
import type { Config } from '../../config/config.js';
import type { ContentGenerator } from '../../core/contentGenerator.js';

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
        permissions: 'ALLOW',
        constraints: 'None',
        rationale: 'Test',
      },
    };
    mockContentGenerator.generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(mockPolicy) }],
          },
        },
      ],
    });

    const policy = await generatePolicy(
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
        }),
        contents: expect.any(Array),
      }),
      'conseca-policy-generation',
    );
    expect(policy).toEqual(mockPolicy);
  });

  it('should handle missing content generator gracefully', async () => {
    vi.mocked(mockConfig.getContentGenerator).mockReturnValue(
      undefined as unknown as ContentGenerator,
    );

    const policy = await generatePolicy(
      'test prompt',
      'trusted content',
      mockConfig,
    );

    expect(policy).toEqual({});
  });
});
