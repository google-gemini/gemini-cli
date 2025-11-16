/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePolicy } from './policy_generator.js';
import * as utilities from './utilities.js';
import { GeminiClient } from '../../core/client.js';

vi.mock('./utilities.js');

describe('policy_generator', () => {
  let mockClient: GeminiClient;

  beforeEach(() => {
    mockClient = {
      generateContent: vi.fn(),
    } as unknown as GeminiClient;
  });

  it('should return a policy object when client is available', async () => {
    const mockPolicy = {
      read_file: {
        permissions: 'ALLOW',
        constraints: 'None',
        rationale: 'Test',
      },
    };
    mockClient.generateContent = vi.fn().mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(mockPolicy) }]
        }
      }]
    });
    vi.mocked(utilities.getGeminiClient).mockResolvedValue(mockClient);
    
    const policy = await generatePolicy('test prompt', 'trusted content');

    expect(utilities.getGeminiClient).toHaveBeenCalled();
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      expect.anything(), // model config
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          parts: expect.arrayContaining([
            expect.objectContaining({ text: expect.stringContaining('User Prompt:') })
          ])
        })
      ]),
      expect.anything() // signal
    );
    expect(policy).toEqual(mockPolicy);
  });

  it('should handle missing client gracefully (though getGeminiClient always returns one now)', async () => {
    // If getGeminiClient throws or something
    vi.mocked(utilities.getGeminiClient).mockRejectedValue(new Error('Failed'));

    const policy = await generatePolicy('test prompt', 'trusted content');

    expect(policy).toEqual({});
  });
});
