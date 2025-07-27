/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { getOauthClient } from './oauth2.js';
import { getCachedGoogleAccount } from '../utils/user_account.js';
import { OAuth2Client, Compute } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import open from 'open';
import crypto from 'crypto';
import * as os from 'os';
import { AuthType } from '../core/contentGenerator.js';
import { Config } from '../config/config.js';
import readline from 'node:readline';

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
vi.mock('node:readline');
vi.mock('../utils/browser.js', () => ({
  shouldAttemptBrowserLaunch: () => true,
}));

const mockConfig = {
  getNoBrowser: () => false,
  getProxy: () => 'http://test.proxy.com:8080',
  isBrowserLaunchSuppressed: () => false,
} as unknown as Config;

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
    delete process.env.GOOGLE_GENAI_USE_GCA;
    delete process.env.GOOGLE_CLOUD_ACCESS_TOKEN;
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
    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      setCredentials: mockSetCredentials,
      getAccessToken: mockGetAccessToken,
      credentials: mockTokens,
      on: vi.fn(),
    } as unknown as OAuth2Client;
    (OAuth2Client as unknown as Mock).mockImplementation(
      () => mockOAuth2Client,
    );

    vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
    (open as Mock).mockImplementation(async () => ({ on: vi.fn() }) as never);

    // Mock the UserInfo API response
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: vi
        .fn()
        .mockResolvedValue({ email: 'test-google-account@gmail.com' }),
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
      listen: vi.fn((port: number, _host: string, callback?: () => void) => {
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

    const clientPromise = getOauthClient(
      AuthType.LOGIN_WITH_GOOGLE,
      mockConfig,
    );

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

    // Verify Google Account was cached
    const googleAccountPath = path.join(
      tempHomeDir,
      '.gemini',
      'google_accounts.json',
    );
    expect(fs.existsSync(googleAccountPath)).toBe(true);
    const cachedGoogleAccount = fs.readFileSync(googleAccountPath, 'utf-8');
    expect(JSON.parse(cachedGoogleAccount)).toEqual({
      active: 'test-google-account@gmail.com',
      old: [],
    });

    // Verify the getCachedGoogleAccount function works
    expect(getCachedGoogleAccount()).toBe('test-google-account@gmail.com');
  });

  it('should perform login with user code', async () => {
    const mockConfigWithNoBrowser = {
      getNoBrowser: () => true,
      getProxy: () => 'http://test.proxy.com:8080',
      isBrowserLaunchSuppressed: () => true,
    } as unknown as Config;

    const mockCodeVerifier = {
      codeChallenge: 'test-challenge',
      codeVerifier: 'test-verifier',
    };
    const mockAuthUrl = 'https://example.com/auth-user-code';
    const mockCode = 'test-user-code';
    const mockTokens = {
      access_token: 'test-access-token-user-code',
      refresh_token: 'test-refresh-token-user-code',
    };

    const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
    const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
    const mockSetCredentials = vi.fn();
    const mockGenerateCodeVerifierAsync = vi
      .fn()
      .mockResolvedValue(mockCodeVerifier);

    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      setCredentials: mockSetCredentials,
      generateCodeVerifierAsync: mockGenerateCodeVerifierAsync,
      on: vi.fn(),
    } as unknown as OAuth2Client;
    (OAuth2Client as unknown as Mock).mockImplementation(
      () => mockOAuth2Client,
    );

    const mockReadline = {
      question: vi.fn((_query, callback) => callback(mockCode)),
      close: vi.fn(),
    };
    (readline.createInterface as Mock).mockReturnValue(mockReadline);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const client = await getOauthClient(
      AuthType.LOGIN_WITH_GOOGLE,
      mockConfigWithNoBrowser,
    );

    expect(client).toBe(mockOAuth2Client);

    // Verify the auth flow
    expect(mockGenerateCodeVerifierAsync).toHaveBeenCalled();
    expect(mockGenerateAuthUrl).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(mockAuthUrl),
    );
    expect(mockReadline.question).toHaveBeenCalledWith(
      'Enter the authorization code: ',
      expect.any(Function),
    );
    expect(mockGetToken).toHaveBeenCalledWith({
      code: mockCode,
      codeVerifier: mockCodeVerifier.codeVerifier,
      redirect_uri: 'https://codeassist.google.com/authcode',
    });
    expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);

    consoleLogSpy.mockRestore();
  });

  describe('in Cloud Shell', () => {
    const mockGetAccessToken = vi.fn();
    let mockComputeClient: Compute;

    beforeEach(() => {
      mockGetAccessToken.mockResolvedValue({ token: 'test-access-token' });
      mockComputeClient = {
        credentials: { refresh_token: 'test-refresh-token' },
        getAccessToken: mockGetAccessToken,
      } as unknown as Compute;

      (Compute as unknown as Mock).mockImplementation(() => mockComputeClient);
    });

    it('should attempt to load cached credentials first', async () => {
      const cachedCreds = { refresh_token: 'cached-token' };
      const credsPath = path.join(tempHomeDir, '.gemini', 'oauth_creds.json');
      await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
      await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

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

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

      expect(mockClient.setCredentials).toHaveBeenCalledWith(cachedCreds);
      expect(mockClient.getAccessToken).toHaveBeenCalled();
      expect(mockClient.getTokenInfo).toHaveBeenCalled();
      expect(Compute).not.toHaveBeenCalled(); // Should not fetch new client if cache is valid
    });

    it('should use Compute to get a client if no cached credentials exist', async () => {
      await getOauthClient(AuthType.CLOUD_SHELL, mockConfig);

      expect(Compute).toHaveBeenCalledWith({});
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it('should not cache the credentials after fetching them via ADC', async () => {
      const newCredentials = { refresh_token: 'new-adc-token' };
      mockComputeClient.credentials = newCredentials;
      mockGetAccessToken.mockResolvedValue({ token: 'new-adc-token' });

      await getOauthClient(AuthType.CLOUD_SHELL, mockConfig);

      const credsPath = path.join(tempHomeDir, '.gemini', 'oauth_creds.json');
      expect(fs.existsSync(credsPath)).toBe(false);
    });

    it('should return the Compute client on successful ADC authentication', async () => {
      const client = await getOauthClient(AuthType.CLOUD_SHELL, mockConfig);
      expect(client).toBe(mockComputeClient);
    });

    it('should throw an error if ADC fails', async () => {
      const testError = new Error('ADC Failed');
      mockGetAccessToken.mockRejectedValue(testError);

      await expect(
        getOauthClient(AuthType.CLOUD_SHELL, mockConfig),
      ).rejects.toThrow(
        'Could not authenticate using Cloud Shell credentials. Please select a different authentication method or ensure you are in a properly configured environment. Error: ADC Failed',
      );
    });
  });

  describe('with GCP environment variables', () => {
    it('should use GOOGLE_CLOUD_ACCESS_TOKEN when GOOGLE_GENAI_USE_GCA is true', async () => {
      process.env.GOOGLE_GENAI_USE_GCA = 'true';
      process.env.GOOGLE_CLOUD_ACCESS_TOKEN = 'gcp-access-token';

      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: 'gcp-access-token' });
      const mockOAuth2Client = {
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        on: vi.fn(),
      } as unknown as OAuth2Client;
      (OAuth2Client as unknown as Mock).mockImplementation(
        () => mockOAuth2Client,
      );

      // Mock the UserInfo API response for fetchAndCacheUserInfo
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: vi
          .fn()
          .mockResolvedValue({ email: 'test-gcp-account@gmail.com' }),
      } as unknown as Response);

      const client = await getOauthClient(
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      expect(client).toBe(mockOAuth2Client);
      expect(mockSetCredentials).toHaveBeenCalledWith({
        access_token: 'gcp-access-token',
      });

      // Verify fetchAndCacheUserInfo was effectively called
      expect(mockGetAccessToken).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: 'Bearer gcp-access-token',
          },
        },
      );

      // Verify Google Account was cached
      const googleAccountPath = path.join(
        tempHomeDir,
        '.gemini',
        'google_accounts.json',
      );
      const cachedContent = fs.readFileSync(googleAccountPath, 'utf-8');
      expect(JSON.parse(cachedContent)).toEqual({
        active: 'test-gcp-account@gmail.com',
        old: [],
      });
    });

    it('should not use GCP token if GOOGLE_CLOUD_ACCESS_TOKEN is not set', async () => {
      process.env.GOOGLE_GENAI_USE_GCA = 'true';

      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: 'cached-access-token' });
      const mockGetTokenInfo = vi.fn().mockResolvedValue({});
      const mockOAuth2Client = {
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        getTokenInfo: mockGetTokenInfo,
        on: vi.fn(),
      } as unknown as OAuth2Client;
      (OAuth2Client as unknown as Mock).mockImplementation(
        () => mockOAuth2Client,
      );

      // Make it fall through to cached credentials path
      const cachedCreds = { refresh_token: 'cached-token' };
      const credsPath = path.join(tempHomeDir, '.gemini', 'oauth_creds.json');
      await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
      await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

      // It should be called with the cached credentials, not the GCP access token.
      expect(mockSetCredentials).toHaveBeenCalledTimes(1);
      expect(mockSetCredentials).toHaveBeenCalledWith(cachedCreds);
    });

    it('should not use GCP token if GOOGLE_GENAI_USE_GCA is not set', async () => {
      process.env.GOOGLE_CLOUD_ACCESS_TOKEN = 'gcp-access-token';

      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: 'cached-access-token' });
      const mockGetTokenInfo = vi.fn().mockResolvedValue({});
      const mockOAuth2Client = {
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        getTokenInfo: mockGetTokenInfo,
        on: vi.fn(),
      } as unknown as OAuth2Client;
      (OAuth2Client as unknown as Mock).mockImplementation(
        () => mockOAuth2Client,
      );

      // Make it fall through to cached credentials path
      const cachedCreds = { refresh_token: 'cached-token' };
      const credsPath = path.join(tempHomeDir, '.gemini', 'oauth_creds.json');
      await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
      await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

      // It should be called with the cached credentials, not the GCP access token.
      expect(mockSetCredentials).toHaveBeenCalledTimes(1);
      expect(mockSetCredentials).toHaveBeenCalledWith(cachedCreds);
    });
  });
});
