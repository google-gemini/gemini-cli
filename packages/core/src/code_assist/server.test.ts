/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';
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
    const mockRequest = vi.fn();
    const client = { request: mockRequest } as unknown as OAuth2Client;
    const server = new CodeAssistServer(
      client,
      'test-project',
      { headers: { 'x-custom-header': 'test-value' } },
      'test-session',
      UserTierId.FREE,
    );
    const mockResponseData = {
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
    mockRequest.mockResolvedValue({ data: mockResponseData });

    const response = await server.generateContent(
      {
        model: 'test-model',
        contents: [{ role: 'user', parts: [{ text: 'request' }] }],
      },
      'user-prompt-id',
    );

    expect(mockRequest).toHaveBeenCalledWith({
      url: expect.stringContaining(':generateContent'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-custom-header': 'test-value',
      },
      responseType: 'json',
      body: expect.any(String),
      signal: undefined,
    });

    const requestBody = JSON.parse(mockRequest.mock.calls[0][0].body);
    expect(requestBody.user_prompt_id).toBe('user-prompt-id');
    expect(requestBody.project).toBe('test-project');

    expect(response.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'response',
    );
  });

  describe('getMethodUrl', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset the environment variables to their original state
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      // Restore the original environment variables
      process.env = originalEnv;
    });

    it('should construct the default URL correctly', () => {
      const server = new CodeAssistServer({} as never);
      const url = server.getMethodUrl('testMethod');
      expect(url).toBe(
        'https://cloudcode-pa.googleapis.com/v1internal:testMethod',
      );
    });

    it('should use the CODE_ASSIST_ENDPOINT environment variable if set', () => {
      process.env['CODE_ASSIST_ENDPOINT'] = 'https://custom-endpoint.com';
      const server = new CodeAssistServer({} as never);
      const url = server.getMethodUrl('testMethod');
      expect(url).toBe('https://custom-endpoint.com/v1internal:testMethod');
    });
  });

  it('should call the generateContentStream endpoint and parse SSE', async () => {
    const mockRequest = vi.fn();
    const client = { request: mockRequest } as unknown as OAuth2Client;
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );

    // Create a mock readable stream
    const { Readable } = await import('node:stream');
    const mockStream = new Readable({
      read() {},
    });

    const mockResponseData1 = {
      response: { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] },
    };
    const mockResponseData2 = {
      response: { candidates: [{ content: { parts: [{ text: ' World' }] } }] },
    };

    mockRequest.mockResolvedValue({ data: mockStream });

    const stream = await server.generateContentStream(
      {
        model: 'test-model',
        contents: [{ role: 'user', parts: [{ text: 'request' }] }],
      },
      'user-prompt-id',
    );

    // Push SSE data to the stream
    // Use setTimeout to ensure the stream processing has started
    setTimeout(() => {
      mockStream.push('data: ' + JSON.stringify(mockResponseData1) + '\n\n');
      mockStream.push('id: 123\n'); // Should be ignored
      mockStream.push('data: ' + JSON.stringify(mockResponseData2) + '\n\n');
      mockStream.push(null); // End the stream
    }, 0);

    const results = [];
    for await (const res of stream) {
      results.push(res);
    }

    expect(mockRequest).toHaveBeenCalledWith({
      url: expect.stringContaining(':streamGenerateContent'),
      method: 'POST',
      params: { alt: 'sse' },
      responseType: 'stream',
      body: expect.any(String),
      headers: {
        'Content-Type': 'application/json',
      },
      signal: undefined,
    });

    expect(results).toHaveLength(2);
    expect(results[0].candidates?.[0].content?.parts?.[0].text).toBe('Hello');
    expect(results[1].candidates?.[0].content?.parts?.[0].text).toBe(' World');
  });

  it('should ignore malformed SSE data', async () => {
    const mockRequest = vi.fn();
    const client = { request: mockRequest } as unknown as OAuth2Client;
    const server = new CodeAssistServer(client);

    const { Readable } = await import('node:stream');
    const mockStream = new Readable({
      read() {},
    });

    mockRequest.mockResolvedValue({ data: mockStream });

    const stream = await server.requestStreamingPost('testStream', {});

    setTimeout(() => {
      mockStream.push('this is a malformed line\n');
      mockStream.push(null);
    }, 0);

    const results = [];
    for await (const res of stream) {
      results.push(res);
    }
    expect(results).toHaveLength(0);
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

  it('should re-throw non-VPC-SC errors from loadCodeAssist', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(client);
    const genericError = new Error('Something else went wrong');
    vi.spyOn(server, 'requestPost').mockRejectedValue(genericError);

    await expect(server.loadCodeAssist({ metadata: {} })).rejects.toThrow(
      'Something else went wrong',
    );

    expect(server.requestPost).toHaveBeenCalledWith(
      'loadCodeAssist',
      expect.any(Object),
    );
  });

  it('should call the listExperiments endpoint with metadata', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockResponse = {
      experiments: [],
    };
    vi.spyOn(server, 'requestPost').mockResolvedValue(mockResponse);

    const metadata = {
      ideVersion: 'v0.1.0',
    };
    const response = await server.listExperiments(metadata);

    expect(server.requestPost).toHaveBeenCalledWith('listExperiments', {
      project: 'test-project',
      metadata: { ideVersion: 'v0.1.0', duetProject: 'test-project' },
    });
    expect(response).toEqual(mockResponse);
  });

  it('should call the retrieveUserQuota endpoint', async () => {
    const client = new OAuth2Client();
    const server = new CodeAssistServer(
      client,
      'test-project',
      {},
      'test-session',
      UserTierId.FREE,
    );
    const mockResponse = {
      buckets: [
        {
          modelId: 'gemini-2.5-pro',
          tokenType: 'REQUESTS',
          remainingFraction: 0.75,
          resetTime: '2025-10-22T16:01:15Z',
        },
      ],
    };
    const requestPostSpy = vi
      .spyOn(server, 'requestPost')
      .mockResolvedValue(mockResponse);

    const req = {
      project: 'projects/my-cloudcode-project',
      userAgent: 'CloudCodePlugin/1.0 (gaghosh)',
    };

    const response = await server.retrieveUserQuota(req);

    expect(requestPostSpy).toHaveBeenCalledWith('retrieveUserQuota', req);
    expect(response).toEqual(mockResponse);
  });
});
