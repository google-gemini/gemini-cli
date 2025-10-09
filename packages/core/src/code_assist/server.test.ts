/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { CodeAssistServer } from './server.js';
import { OAuth2Client } from 'google-auth-library';
import { UserTierId } from './types.js';

vi.mock('google-auth-library');

describe('CodeAssistServer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should be able to be constructed', () => {
    const auth = new OAuth2Client();
    const server = new CodeAssistServer(
      auth,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    expect(server).toBeInstanceOf(CodeAssistServer);
  });

  it('should call the generateContent endpoint', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockResponse = {
      response: {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'response' }],
            },
            finishReason: 'STOP',
            safetyRatings: [],
          },
        ],
      },
    };
    vi.spyOn(server, 'requestPost').mockResolvedValue(mockResponse);

    const response = await server.generateContent(
      {
        model: 'test-model',
        contents: [{ role: 'user', parts: [{ text: 'request' }] }],
      },
      'user-prompt-id',
    );

    expect(server.requestPost).toHaveBeenCalledWith(
      'generateContent',
      expect.any(Object),
      undefined,
    );
    expect(response.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'response',
    );
  });

  it('should call the generateContentStream endpoint', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockResponse = (async function* () {
      yield {
        response: {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: 'response' }],
              },
              finishReason: 'STOP',
              safetyRatings: [],
            },
          ],
        },
      };
    })();
    vi.spyOn(server, 'requestStreamingPost').mockResolvedValue(mockResponse);

    const stream = await server.generateContentStream(
      {
        model: 'test-model',
        contents: [{ role: 'user', parts: [{ text: 'request' }] }],
      },
      'user-prompt-id',
    );

    for await (const res of stream) {
      expect(server.requestStreamingPost).toHaveBeenCalledWith(
        'streamGenerateContent',
        expect.any(Object),
        undefined,
      );
      expect(res.candidates?.[0]?.content?.parts?.[0]?.text).toBe('response');
    }
  });

  it('should call the onboardUser endpoint', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockResponse = {
      name: 'operations/123',
      done: true,
    };
    vi.spyOn(server, 'requestPost').mockResolvedValue(mockResponse);

    const response = await server.onboardUser({
      tierId: 'test-tier',
      cloudaicompanionProject: 'test-project',
      metadata: {},
    });

    expect(server.requestPost).toHaveBeenCalledWith(
      'onboardUser',
      expect.any(Object),
    );
    expect(response.name).toBe('operations/123');
  });

  it('should call the loadCodeAssist endpoint', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockResponse = {
      currentTier: {
        id: UserTierId.FREE,
        name: 'Free',
        description: 'free tier',
      },
      allowedTiers: [],
      ineligibleTiers: [],
      cloudaicompanionProject: 'projects/test',
    };
    vi.spyOn(server, 'requestPost').mockResolvedValue(mockResponse);

    const response = await server.loadCodeAssist({
      metadata: {},
    });

    expect(server.requestPost).toHaveBeenCalledWith(
      'loadCodeAssist',
      expect.any(Object),
    );
    expect(response).toEqual(mockResponse);
  });

  it('should return 0 for countTokens', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockResponse = {
      totalTokens: 100,
    };
    vi.spyOn(server, 'requestPost').mockResolvedValue(mockResponse);

    const response = await server.countTokens({
      model: 'test-model',
      contents: [{ role: 'user', parts: [{ text: 'request' }] }],
    });
    expect(response.totalTokens).toBe(100);
  });

  it('should throw an error for embedContent', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    await expect(
      server.embedContent({
        model: 'test-model',
        contents: [{ role: 'user', parts: [{ text: 'request' }] }],
      }),
    ).rejects.toThrow();
  });

  it('should handle VPC-SC errors when calling loadCodeAssist', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockVpcScError = {
      response: {
        data: {
          error: {
            details: [
              {
                reason: 'SECURITY_POLICY_VIOLATED',
              },
            ],
          },
        },
      },
    };
    vi.spyOn(server, 'requestPost').mockRejectedValue(mockVpcScError);

    const response = await server.loadCodeAssist({
      metadata: {},
    });

    expect(server.requestPost).toHaveBeenCalledWith(
      'loadCodeAssist',
      expect.any(Object),
    );
    expect(response).toEqual({
      currentTier: { id: UserTierId.STANDARD },
    });
  });
});
