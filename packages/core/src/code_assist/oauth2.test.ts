/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { getOauthClient, getCachedGoogleAccountId } from './oauth2.js';
import { OAuth2Client, Compute } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import open from 'open';
import crypto from 'crypto';
import * as os from 'os';
import { AuthType } from '../core/contentGenerator.js';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

vi.mock('google-auth-library');
vi.mock('http');
vi.mock('open');
vi.mock('crypto');

// Mock fetch globally
global.fetch = vi.fn();

describe('oauth2', () => {
  let tempHomeDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    (os.homedir as Mock).mockReturnValue(tempHomeDir);
  });
  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
    delete process.env.CLOUD_SHELL;
  });

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
    const mockGetAccessToken = vi
      .fn()
      .mockResolvedValue({ token: 'mock-access-token' });
    const mockRefreshAccessToken = vi.fn().mockImplementation((callback) => {
      // Mock the callback-style refreshAccessToken method
      const mockTokensWithIdToken = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        id_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWdvb2dsZS1hY2NvdW50LWlkLTEyMyJ9.signature', // Mock JWT with sub: test-google-account-id-123
      };
      callback(null, mockTokensWithIdToken);
    });
    const mockVerifyIdToken = vi.fn().mockResolvedValue({
      getPayload: () => ({
        sub: 'test-google-account-id-123',
        aud: 'test-audience',
        iss: 'https://accounts.google.com',
      }),
    });
    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      setCredentials: mockSetCredentials,
      getAccessToken: mockGetAccessToken,
      refreshAccessToken: mockRefreshAccessToken,
      verifyIdToken: mockVerifyIdToken,
      credentials: mockTokens,
      on: vi.fn(),
    } as unknown as OAuth2Client;
    (OAuth2Client as unknown as Mock).mockImplementation(
      () => mockOAuth2Client,
    );

    vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
    (open as Mock).mockImplementation(async () => ({}) as never);

    // Mock the UserInfo API response
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'test-google-account-id-123' }),
    } as unknown as Response);

    let requestCallback!: http.RequestListener<
      typeof http.IncomingMessage,
      typeof http.ServerResponse
    >;

    let serverListeningCallback: (value: unknown) => void;
    const serverListeningPromise = new Promise(
      (resolve) => (serverListeningCallback = resolve),
    );

    let capturedPort = 0;
    const mockHttpServer = {
      listen: vi.fn((port: number, callback?: () => void) => {
        capturedPort = port;
        if (callback) {
          callback();
        }
        serverListeningCallback(undefined);
      }),
      close: vi.fn((callback?: () => void) => {
        if (callback) {
          callback();
        }
      }),
      on: vi.fn(),
      address: () => ({ port: capturedPort }),
    };
    (http.createServer as Mock).mockImplementation((cb) => {
      requestCallback = cb as http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;
      return mockHttpServer as unknown as http.Server;
    });

    const clientPromise = getOauthClient(AuthType.LOGIN_WITH_GOOGLE);

    // wait for server to start listening.
    await serverListeningPromise;

    const mockReq = {
      url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
    } as http.IncomingMessage;
    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    await requestCallback(mockReq, mockRes);

    const client = await clientPromise;
    expect(client).toBe(mockOAuth2Client);

    expect(open).toHaveBeenCalledWith(mockAuthUrl);
    expect(mockGetToken).toHaveBeenCalledWith({
      code: mockCode,
      redirect_uri: `http://localhost:${capturedPort}/oauth2callback`,
    });
    expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);

    // Verify Google Account ID was cached
    const googleAccountIdPath = path.join(
      tempHomeDir,
      '.gemini',
      'google_account_id',
    );
    expect(fs.existsSync(googleAccountIdPath)).toBe(true);
    const cachedGoogleAccountId = fs.readFileSync(googleAccountIdPath, 'utf-8');
    expect(cachedGoogleAccountId).toBe('test-google-account-id-123');

    // Verify the getCachedGoogleAccountId function works
    expect(getCachedGoogleAccountId()).toBe('test-google-account-id-123');
  });

  describe('in Cloud Shell', () => {
    const mockGetAccessToken = vi.fn();
    let mockComputeClient: Compute;

    beforeEach(() => {
      vi.spyOn(os, 'homedir').mockReturnValue('/user/home');
      vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'readFile').mockRejectedValue(
        new Error('File not found'),
      ); // Default to no cached creds

      mockGetAccessToken.mockResolvedValue({ token: 'test-access-token' });
      mockComputeClient = {
        credentials: { refresh_token: 'test-refresh-token' },
        getAccessToken: mockGetAccessToken,
      } as unknown as Compute;

      (Compute as unknown as Mock).mockImplementation(() => mockComputeClient);
    });

    it('should attempt to load cached credentials first', async () => {
      const cachedCreds = { refresh_token: 'cached-token' };
      vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
        JSON.stringify(cachedCreds),
      );

      const mockClient = {
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
        getTokenInfo: vi.fn().mockResolvedValue({}),
        on: vi.fn(),
      };

      // To mock the new OAuth2Client() inside the function
      (OAuth2Client as unknown as Mock).mockImplementation(
        () => mockClient as unknown as OAuth2Client,
      );

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE);

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        '/user/home/.gemini/oauth_creds.json',
        'utf-8',
      );
      expect(mockClient.setCredentials).toHaveBeenCalledWith(cachedCreds);
      expect(mockClient.getAccessToken).toHaveBeenCalled();
      expect(mockClient.getTokenInfo).toHaveBeenCalled();
      expect(Compute).not.toHaveBeenCalled(); // Should not fetch new client if cache is valid
    });

    it('should use Compute to get a client if no cached credentials exist', async () => {
      await getOauthClient(AuthType.CLOUD_SHELL);

      expect(Compute).toHaveBeenCalledWith({});
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it('should not cache the credentials after fetching them via ADC', async () => {
      const newCredentials = { refresh_token: 'new-adc-token' };
      mockComputeClient.credentials = newCredentials;
      mockGetAccessToken.mockResolvedValue({ token: 'new-adc-token' });

      await getOauthClient(AuthType.CLOUD_SHELL);

      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('should return the Compute client on successful ADC authentication', async () => {
      const client = await getOauthClient(AuthType.CLOUD_SHELL);
      expect(client).toBe(mockComputeClient);
    });

    it('should throw an error if ADC fails', async () => {
      const testError = new Error('ADC Failed');
      mockGetAccessToken.mockRejectedValue(testError);

      await expect(getOauthClient(AuthType.CLOUD_SHELL)).rejects.toThrow(
        'Could not authenticate using Cloud Shell credentials. Please select a different authentication method or ensure you are in a properly configured environment. Error: ADC Failed',
      );
    });
  });
});
