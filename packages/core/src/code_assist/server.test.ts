/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { CodeAssistServer } from './server.js';
import { OAuth2Client } from 'google-auth-library';

vi.mock('google-auth-library');

describe('CodeAssistServer', () => {
  it('should be able to be constructed', () => {
    const auth = new OAuth2Client();
    const server = new CodeAssistServer(auth, 'test-project');
    expect(server).toBeInstanceOf(CodeAssistServer);
  });

  it('should call the generateContent endpoint', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(client, 'test-project');
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

    const response = await server.generateContent({
      model: 'test-model',
      contents: [{ role: 'user', parts: [{ text: 'request' }] }],
    });

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
    const server = new CodeAssistServer(client, 'test-project');
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

    const stream = await server.generateContentStream({
      model: 'test-model',
      contents: [{ role: 'user', parts: [{ text: 'request' }] }],
    });

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
    const server = new CodeAssistServer(client, 'test-project');
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
    const server = new CodeAssistServer(client, 'test-project');
    const mockResponse = {
      // TODO: Add mock response
    };
    vi.spyOn(server, 'requestPost').mockResolvedValue(mockResponse);

    const response = await server.loadCodeAssist({
      metadata: {},
    });

    expect(server.requestPost).toHaveBeenCalledWith(
      'loadCodeAssist',
      expect.any(Object),
    );
    expect(response).toBe(mockResponse);
  });

  it('should return 0 for countTokens', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(client, 'test-project');
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
    const server = new CodeAssistServer(client, 'test-project');
    await expect(
      server.embedContent({
        model: 'test-model',
        contents: [{ role: 'user', parts: [{ text: 'request' }] }],
      }),
    ).rejects.toThrow();
  });
});
