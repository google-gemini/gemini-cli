/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { webLoginClient } from './oauth2.js';
import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import open from 'open';
import crypto from 'crypto';

vi.mock('google-auth-library');
vi.mock('http');
vi.mock('open');
vi.mock('crypto');

describe('oauth2', () => {
  it('should perform a web login', async () => {
    const mockAuthUrl = 'https://example.com/auth';
    const mockCode = 'test-code';
    const mockState = 'test-state';
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
    };

    const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
    const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
    const mockSetCredentials = vi.fn();
    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      setCredentials: mockSetCredentials,
    } as unknown as OAuth2Client;
    vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

    vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
    vi.mocked(open).mockImplementation(async () => ({}) as never);

    let requestCallback!: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ) => void;
    const mockHttpServer = {
      listen: vi.fn((port: number, callback?: () => void) => {
        if (callback) {
          callback();
        }
      }),
      close: vi.fn((callback?: () => void) => {
        if (callback) {
          callback();
        }
      }),
      on: vi.fn(),
      address: () => ({ port: 1234 }),
    };
    vi.mocked(http.createServer).mockImplementation((cb) => {
      requestCallback = cb as (
        req: http.IncomingMessage,
        res: http.ServerResponse,
      ) => void;
      return mockHttpServer as unknown as http.Server;
    });

    const clientPromise = webLoginClient();

    // Wait for the server to be created
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mockReq = {
      url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
    } as http.IncomingMessage;
    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    if (requestCallback) {
      await requestCallback(mockReq, mockRes);
    }

    const client = await clientPromise;

    expect(open).toHaveBeenCalledWith(mockAuthUrl);
    expect(mockGetToken).toHaveBeenCalledWith(mockCode);
    expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);
    expect(client).toBe(mockOAuth2Client);
  });
});
