/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Credentials } from 'google-auth-library';
import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOauthClient,
  resetOauthClientForTesting,
  clearCachedCredentialFile,
  clearOauthClientCache,
  authEvents,
} from './oauth2.js';
import { UserAccountManager } from '../utils/userAccountManager.js';
import { OAuth2Client, Compute, GoogleAuth } from 'google-auth-library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import http from 'node:http';
import open from 'open';
import crypto from 'node:crypto';
import * as os from 'node:os';
import { AuthType } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import readline from 'node:readline';
import { FORCE_ENCRYPTED_FILE_ENV_VAR } from '../mcp/token-storage/index.js';
import { GEMINI_DIR, homedir as pathsHomedir } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import { writeToStdout } from '../utils/stdio.js';
import { FatalCancellationError } from '../utils/errors.js';
import process from 'node:process';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
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
vi.mock('../utils/stdio.js', () => ({
  writeToStdout: vi.fn(),
  writeToStderr: vi.fn(),
  createWorkingStdio: vi.fn(() => ({
    stdout: process.stdout,
    stderr: process.stderr,
  })),
  enterAlternateScreen: vi.fn(),
  exitAlternateScreen: vi.fn(),
  enableLineWrapping: vi.fn(),
  disableMouseEvents: vi.fn(),
  disableKittyKeyboardProtocol: vi.fn(),
}));

vi.mock('./oauth-credential-storage.js', () => ({
  OAuthCredentialStorage: {
    saveCredentials: vi.fn(),
    loadCredentials: vi.fn(),
    clearCredentials: vi.fn(),
  },
}));

const mockConfig = {
  getNoBrowser: () => false,
  getProxy: () => 'http://test.proxy.com:8080',
  isBrowserLaunchSuppressed: () => false,
} as unknown as Config;

// Mock fetch globally
global.fetch = vi.fn();

describe('oauth2', () => {
  describe('with encrypted flag false', () => {
    let tempHomeDir: string;

    beforeEach(() => {
      process.env[FORCE_ENCRYPTED_FILE_ENV_VAR] = 'false';
      tempHomeDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-test-home-'),
      );
      vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
      vi.mocked(pathsHomedir).mockReturnValue(tempHomeDir);
    });
    afterEach(() => {
      fs.rmSync(tempHomeDir, { recursive: true, force: true });
      vi.clearAllMocks();
      resetOauthClientForTesting();
      vi.unstubAllEnvs();
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
      let tokensListener: ((tokens: Credentials) => void) | undefined;
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
        on: vi.fn((event, listener) => {
          if (event === 'tokens') {
            tokensListener = listener;
          }
        }),
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(
        async () => ({ on: vi.fn() }) as never,
      );

      // Mock the UserInfo API response
      vi.mocked(global.fetch).mockResolvedValue({
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

      requestCallback(mockReq, mockRes);

      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);

      expect(open).toHaveBeenCalledWith(mockAuthUrl);
      expect(mockGetToken).toHaveBeenCalledWith({
        code: mockCode,
        redirect_uri: `http://localhost:${capturedPort}/oauth2callback`,
      });
      expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);

      // Manually trigger the 'tokens' event listener
      if (tokensListener) {
        await (
          tokensListener as unknown as (tokens: Credentials) => Promise<void>
        )(mockTokens);
      }

      // Verify Google Account was cached
      const googleAccountPath = path.join(
        tempHomeDir,
        GEMINI_DIR,
        'google_accounts.json',
      );
      expect(fs.existsSync(googleAccountPath)).toBe(true);
      const cachedGoogleAccount = fs.readFileSync(googleAccountPath, 'utf-8');
      expect(JSON.parse(cachedGoogleAccount)).toEqual({
        active: 'test-google-account@gmail.com',
        old: [],
      });

      // Verify the getCachedGoogleAccount function works
      const userAccountManager = new UserAccountManager();
      expect(userAccountManager.getCachedGoogleAccount()).toBe(
        'test-google-account@gmail.com',
      );
    });

    it('should clear credentials file', async () => {
      // Setup initial state with files
      const credsPath = path.join(tempHomeDir, GEMINI_DIR, 'oauth_creds.json');

      await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
      await fs.promises.writeFile(credsPath, '{}');

      await clearCachedCredentialFile();

      expect(fs.existsSync(credsPath)).toBe(false);
    });

    it('should emit post_auth event when loading cached credentials', async () => {
      const cachedCreds = { refresh_token: 'cached-token' };
      const credsPath = path.join(tempHomeDir, GEMINI_DIR, 'oauth_creds.json');
      await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
      await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

      const mockClient = {
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
        getTokenInfo: vi.fn().mockResolvedValue({}),
        on: vi.fn(),
      };
      vi.mocked(OAuth2Client).mockImplementation(
        () => mockClient as unknown as OAuth2Client,
      );

      const eventPromise = new Promise<void>((resolve) => {
        authEvents.once('post_auth', (creds) => {
          expect(creds.refresh_token).toBe('cached-token');
          resolve();
        });
      });

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);
      await eventPromise;
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
      const mockGenerateCodeVerifierAsync = vi
        .fn()
        .mockResolvedValue(mockCodeVerifier);

      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        generateCodeVerifierAsync: mockGenerateCodeVerifierAsync,
        getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
        on: vi.fn(),
        credentials: {},
      } as unknown as OAuth2Client;
      mockOAuth2Client.setCredentials = vi.fn().mockImplementation((creds) => {
        mockOAuth2Client.credentials = creds;
      });
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      const mockReadline = {
        question: vi.fn((_query, callback) => callback(mockCode)),
        close: vi.fn(),
        on: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const client = await getOauthClient(
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfigWithNoBrowser,
      );

      expect(client).toBe(mockOAuth2Client);

      // Verify the auth flow
      expect(mockGenerateCodeVerifierAsync).toHaveBeenCalled();
      expect(mockGenerateAuthUrl).toHaveBeenCalled();
      expect(vi.mocked(writeToStdout)).toHaveBeenCalledWith(
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
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockTokens);
    });

    it('should cache Google Account when logging in with user code', async () => {
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
      const mockGenerateCodeVerifierAsync = vi
        .fn()
        .mockResolvedValue(mockCodeVerifier);
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: 'test-access-token-user-code' });

      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        generateCodeVerifierAsync: mockGenerateCodeVerifierAsync,
        getAccessToken: mockGetAccessToken,
        on: vi.fn(),
        credentials: {},
      } as unknown as OAuth2Client;
      mockOAuth2Client.setCredentials = vi.fn().mockImplementation((creds) => {
        mockOAuth2Client.credentials = creds;
      });
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, 'randomBytes').mockReturnValue('test-state' as never);

      const mockReadline = {
        question: vi.fn((_query, callback) => callback(mockCode)),
        close: vi.fn(),
        on: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      // Mock User Info API
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi
          .fn()
          .mockResolvedValue({ email: 'test-user-code-account@gmail.com' }),
      } as unknown as Response);

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfigWithNoBrowser);

      // Verify Google Account was cached
      const googleAccountPath = path.join(
        tempHomeDir,
        GEMINI_DIR,
        'google_accounts.json',
      );

      expect(fs.existsSync(googleAccountPath)).toBe(true);
      if (fs.existsSync(googleAccountPath)) {
        const cachedGoogleAccount = fs.readFileSync(googleAccountPath, 'utf-8');
        expect(JSON.parse(cachedGoogleAccount)).toEqual({
          active: 'test-user-code-account@gmail.com',
          old: [],
        });
      }
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

        (Compute as unknown as Mock).mockImplementation(
          () => mockComputeClient,
        );
      });

      it('should attempt to load cached credentials first', async () => {
        const cachedCreds = { refresh_token: 'cached-token' };
        const credsPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'oauth_creds.json',
        );
        await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
        await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

        const mockClient = {
          setCredentials: vi.fn(),
          getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
          getTokenInfo: vi.fn().mockResolvedValue({}),
          on: vi.fn(),
        };

        // To mock the new OAuth2Client() inside the function
        vi.mocked(OAuth2Client).mockImplementation(
          () => mockClient as unknown as OAuth2Client,
        );

        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

        expect(mockClient.setCredentials).toHaveBeenCalledWith(cachedCreds);
        expect(mockClient.getAccessToken).toHaveBeenCalled();
        expect(mockClient.getTokenInfo).toHaveBeenCalled();
        expect(Compute).not.toHaveBeenCalled(); // Should not fetch new client if cache is valid
      });

      it('should use Compute to get a client if no cached credentials exist', async () => {
        await getOauthClient(AuthType.COMPUTE_ADC, mockConfig);

        expect(Compute).toHaveBeenCalledWith({});
        expect(mockGetAccessToken).toHaveBeenCalled();
      });

      it('should not cache the credentials after fetching them via ADC', async () => {
        const newCredentials = { refresh_token: 'new-adc-token' };
        mockComputeClient.credentials = newCredentials;
        mockGetAccessToken.mockResolvedValue({ token: 'new-adc-token' });

        await getOauthClient(AuthType.COMPUTE_ADC, mockConfig);

        const credsPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'oauth_creds.json',
        );
        expect(fs.existsSync(credsPath)).toBe(false);
      });

      it('should return the Compute client on successful ADC authentication', async () => {
        const client = await getOauthClient(AuthType.COMPUTE_ADC, mockConfig);
        expect(client).toBe(mockComputeClient);
      });

      it('should throw an error if ADC fails', async () => {
        const testError = new Error('ADC Failed');
        mockGetAccessToken.mockRejectedValue(testError);

        await expect(
          getOauthClient(AuthType.COMPUTE_ADC, mockConfig),
        ).rejects.toThrow(
          'Could not authenticate using metadata server application default credentials. Please select a different authentication method or ensure you are in a properly configured environment. Error: ADC Failed',
        );
      });
    });

    describe('credential loading order', () => {
      it('should prioritize default cached credentials over GOOGLE_APPLICATION_CREDENTIALS', async () => {
        // Setup default cached credentials
        const defaultCreds = { refresh_token: 'default-cached-token' };
        const defaultCredsPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'oauth_creds.json',
        );
        await fs.promises.mkdir(path.dirname(defaultCredsPath), {
          recursive: true,
        });
        await fs.promises.writeFile(
          defaultCredsPath,
          JSON.stringify(defaultCreds),
        );

        // Setup credentials via environment variable
        const envCreds = { refresh_token: 'env-var-token' };
        const envCredsPath = path.join(tempHomeDir, 'env_creds.json');
        await fs.promises.writeFile(envCredsPath, JSON.stringify(envCreds));
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', envCredsPath);

        const mockClient = {
          setCredentials: vi.fn(),
          getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
          getTokenInfo: vi.fn().mockResolvedValue({}),
          on: vi.fn(),
        };
        vi.mocked(OAuth2Client).mockImplementation(
          () => mockClient as unknown as OAuth2Client,
        );

        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

        // Assert the correct credentials were used
        expect(mockClient.setCredentials).toHaveBeenCalledWith(defaultCreds);
        expect(mockClient.setCredentials).not.toHaveBeenCalledWith(envCreds);
      });

      it('should fall back to GOOGLE_APPLICATION_CREDENTIALS if default cache is missing', async () => {
        // Setup credentials via environment variable
        const envCreds = { refresh_token: 'env-var-token' };
        const envCredsPath = path.join(tempHomeDir, 'env_creds.json');
        await fs.promises.writeFile(envCredsPath, JSON.stringify(envCreds));
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', envCredsPath);

        const mockClient = {
          setCredentials: vi.fn(),
          getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
          getTokenInfo: vi.fn().mockResolvedValue({}),
          on: vi.fn(),
        };
        vi.mocked(OAuth2Client).mockImplementation(
          () => mockClient as unknown as OAuth2Client,
        );

        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

        // Assert the correct credentials were used
        expect(mockClient.setCredentials).toHaveBeenCalledWith(envCreds);
      });

      it('should use GoogleAuth for BYOID credentials from GOOGLE_APPLICATION_CREDENTIALS', async () => {
        // Setup BYOID credentials via environment variable
        const byoidCredentials = {
          type: 'external_account_authorized_user',
          client_id: 'mock-client-id',
        };
        const envCredsPath = path.join(tempHomeDir, 'byoid_creds.json');
        await fs.promises.writeFile(
          envCredsPath,
          JSON.stringify(byoidCredentials),
        );
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', envCredsPath);

        // Mock GoogleAuth and its chain of calls
        const mockExternalAccountClient = {
          getAccessToken: vi.fn().mockResolvedValue({ token: 'byoid-token' }),
        };
        const mockFromJSON = vi.fn().mockReturnValue(mockExternalAccountClient);
        const mockGoogleAuthInstance = {
          fromJSON: mockFromJSON,
        };
        (GoogleAuth as unknown as Mock).mockImplementation(
          () => mockGoogleAuthInstance,
        );

        const mockOAuth2Client = {
          on: vi.fn(),
        };
        (OAuth2Client as unknown as Mock).mockImplementation(
          () => mockOAuth2Client,
        );

        const client = await getOauthClient(
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        );

        // Assert that GoogleAuth was used and the correct client was returned
        expect(GoogleAuth).toHaveBeenCalledWith({
          scopes: expect.any(Array),
        });
        expect(mockFromJSON).toHaveBeenCalledWith(byoidCredentials);
        expect(client).toBe(mockExternalAccountClient);
      });
    });

    describe('with GCP environment variables', () => {
      it('should use GOOGLE_CLOUD_ACCESS_TOKEN when GOOGLE_GENAI_USE_GCA is true', async () => {
        vi.stubEnv('GOOGLE_GENAI_USE_GCA', 'true');
        vi.stubEnv('GOOGLE_CLOUD_ACCESS_TOKEN', 'gcp-access-token');

        const mockSetCredentials = vi.fn();
        const mockGetAccessToken = vi
          .fn()
          .mockResolvedValue({ token: 'gcp-access-token' });
        const mockOAuth2Client = {
          setCredentials: mockSetCredentials,
          getAccessToken: mockGetAccessToken,
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

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
          GEMINI_DIR,
          'google_accounts.json',
        );
        const cachedContent = fs.readFileSync(googleAccountPath, 'utf-8');
        expect(JSON.parse(cachedContent)).toEqual({
          active: 'test-gcp-account@gmail.com',
          old: [],
        });
      });

      it('should not use GCP token if GOOGLE_CLOUD_ACCESS_TOKEN is not set', async () => {
        vi.stubEnv('GOOGLE_GENAI_USE_GCA', 'true');

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
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        // Make it fall through to cached credentials path
        const cachedCreds = { refresh_token: 'cached-token' };
        const credsPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'oauth_creds.json',
        );
        await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
        await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

        // It should be called with the cached credentials, not the GCP access token.
        expect(mockSetCredentials).toHaveBeenCalledTimes(1);
        expect(mockSetCredentials).toHaveBeenCalledWith(cachedCreds);
      });

      it('should not use GCP token if GOOGLE_GENAI_USE_GCA is not set', async () => {
        vi.stubEnv('GOOGLE_CLOUD_ACCESS_TOKEN', 'gcp-access-token');

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
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        // Make it fall through to cached credentials path
        const cachedCreds = { refresh_token: 'cached-token' };
        const credsPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'oauth_creds.json',
        );
        await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
        await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

        // It should be called with the cached credentials, not the GCP access token.
        expect(mockSetCredentials).toHaveBeenCalledTimes(1);
        expect(mockSetCredentials).toHaveBeenCalledWith(cachedCreds);
      });
    });

    describe('error handling', () => {
      it('should handle browser launch failure with FatalAuthenticationError', async () => {
        const mockError = new Error('Browser launch failed');
        (open as Mock).mockRejectedValue(mockError);

        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue('https://example.com/auth'),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        await expect(
          getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig),
        ).rejects.toThrow('Failed to open browser: Browser launch failed');
      });

      it('should handle authentication timeout with proper error message', async () => {
        const mockAuthUrl = 'https://example.com/auth';
        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        vi.mocked(open).mockImplementation(
          async () => ({ on: vi.fn() }) as never,
        );

        const mockHttpServer = {
          listen: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          address: () => ({ port: 3000 }),
        };
        (http.createServer as Mock).mockImplementation(
          () => mockHttpServer as unknown as http.Server,
        );

        // Mock setTimeout to trigger timeout immediately
        const originalSetTimeout = global.setTimeout;
        global.setTimeout = vi.fn(
          (callback) => (callback(), {} as unknown as NodeJS.Timeout),
        ) as unknown as typeof setTimeout;

        await expect(
          getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig),
        ).rejects.toThrow(
          'Authentication timed out after 5 minutes. The browser tab may have gotten stuck in a loading state. Please try again or use NO_BROWSER=true for manual authentication.',
        );

        global.setTimeout = originalSetTimeout;
      });

      it('should handle OAuth callback errors with descriptive messages', async () => {
        const mockAuthUrl = 'https://example.com/auth';
        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        vi.mocked(open).mockImplementation(
          async () => ({ on: vi.fn() }) as never,
        );

        let requestCallback!: http.RequestListener;
        let serverListeningCallback: (value: unknown) => void;
        const serverListeningPromise = new Promise(
          (resolve) => (serverListeningCallback = resolve),
        );

        const mockHttpServer = {
          listen: vi.fn(
            (_port: number, _host: string, callback?: () => void) => {
              if (callback) callback();
              serverListeningCallback(undefined);
            },
          ),
          close: vi.fn(),
          on: vi.fn(),
          address: () => ({ port: 3000 }),
        };
        (http.createServer as Mock).mockImplementation((cb) => {
          requestCallback = cb;
          return mockHttpServer as unknown as http.Server;
        });

        const clientPromise = getOauthClient(
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        );
        await serverListeningPromise;

        // Test OAuth error with description
        const mockReq = {
          url: '/oauth2callback?error=access_denied&error_description=User+denied+access',
        } as http.IncomingMessage;
        const mockRes = {
          writeHead: vi.fn(),
          end: vi.fn(),
        } as unknown as http.ServerResponse;

        await expect(async () => {
          requestCallback(mockReq, mockRes);
          await clientPromise;
        }).rejects.toThrow(
          'Google OAuth error: access_denied. User denied access',
        );
      });

      it('should handle OAuth error without description', async () => {
        const mockAuthUrl = 'https://example.com/auth';
        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        vi.mocked(open).mockImplementation(
          async () => ({ on: vi.fn() }) as never,
        );

        let requestCallback!: http.RequestListener;
        let serverListeningCallback: (value: unknown) => void;
        const serverListeningPromise = new Promise(
          (resolve) => (serverListeningCallback = resolve),
        );

        const mockHttpServer = {
          listen: vi.fn(
            (_port: number, _host: string, callback?: () => void) => {
              if (callback) callback();
              serverListeningCallback(undefined);
            },
          ),
          close: vi.fn(),
          on: vi.fn(),
          address: () => ({ port: 3000 }),
        };
        (http.createServer as Mock).mockImplementation((cb) => {
          requestCallback = cb;
          return mockHttpServer as unknown as http.Server;
        });

        const clientPromise = getOauthClient(
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        );
        await serverListeningPromise;

        // Test OAuth error without description
        const mockReq = {
          url: '/oauth2callback?error=server_error',
        } as http.IncomingMessage;
        const mockRes = {
          writeHead: vi.fn(),
          end: vi.fn(),
        } as unknown as http.ServerResponse;

        await expect(async () => {
          requestCallback(mockReq, mockRes);
          await clientPromise;
        }).rejects.toThrow(
          'Google OAuth error: server_error. No additional details provided',
        );
      });

      it('should handle token exchange failure with descriptive error', async () => {
        const mockAuthUrl = 'https://example.com/auth';
        const mockCode = 'test-code';
        const mockState = 'test-state';

        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
          getToken: vi
            .fn()
            .mockRejectedValue(new Error('Token exchange failed')),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
        vi.mocked(open).mockImplementation(
          async () => ({ on: vi.fn() }) as never,
        );

        let requestCallback!: http.RequestListener;
        let serverListeningCallback: (value: unknown) => void;
        const serverListeningPromise = new Promise(
          (resolve) => (serverListeningCallback = resolve),
        );

        const mockHttpServer = {
          listen: vi.fn(
            (_port: number, _host: string, callback?: () => void) => {
              if (callback) callback();
              serverListeningCallback(undefined);
            },
          ),
          close: vi.fn(),
          on: vi.fn(),
          address: () => ({ port: 3000 }),
        };
        (http.createServer as Mock).mockImplementation((cb) => {
          requestCallback = cb;
          return mockHttpServer as unknown as http.Server;
        });

        const clientPromise = getOauthClient(
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        );
        await serverListeningPromise;

        const mockReq = {
          url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
        } as http.IncomingMessage;
        const mockRes = {
          writeHead: vi.fn(),
          end: vi.fn(),
        } as unknown as http.ServerResponse;

        await expect(async () => {
          requestCallback(mockReq, mockRes);
          await clientPromise;
        }).rejects.toThrow(
          'Failed to exchange authorization code for tokens: Token exchange failed',
        );
      });

      it('should handle fetchAndCacheUserInfo failure gracefully', async () => {
        const mockAuthUrl = 'https://example.com/auth';
        const mockCode = 'test-code';
        const mockState = 'test-state';
        const mockTokens = {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        };

        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
          getToken: vi.fn().mockResolvedValue({ tokens: mockTokens }),
          getAccessToken: vi
            .fn()
            .mockResolvedValue({ token: 'test-access-token' }),
          on: vi.fn(),
          credentials: {},
        } as unknown as OAuth2Client;
        mockOAuth2Client.setCredentials = vi
          .fn()
          .mockImplementation((creds) => {
            mockOAuth2Client.credentials = creds;
          });
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
        vi.mocked(open).mockImplementation(
          async () => ({ on: vi.fn() }) as never,
        );

        // Mock fetch to fail
        vi.mocked(global.fetch).mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as unknown as Response);

        const consoleLogSpy = vi
          .spyOn(debugLogger, 'log')
          .mockImplementation(() => {});

        let requestCallback!: http.RequestListener;
        let serverListeningCallback: (value: unknown) => void;
        const serverListeningPromise = new Promise(
          (resolve) => (serverListeningCallback = resolve),
        );

        const mockHttpServer = {
          listen: vi.fn(
            (_port: number, _host: string, callback?: () => void) => {
              if (callback) callback();
              serverListeningCallback(undefined);
            },
          ),
          close: vi.fn(),
          on: vi.fn(),
          address: () => ({ port: 3000 }),
        } as unknown as http.Server;
        (http.createServer as Mock).mockImplementation((cb) => {
          requestCallback = cb;
          return mockHttpServer;
        });

        const clientPromise = getOauthClient(
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        );
        await serverListeningPromise;

        const mockReq = {
          url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
        } as http.IncomingMessage;
        const mockRes = {
          writeHead: vi.fn(),
          end: vi.fn(),
        } as unknown as http.ServerResponse;

        requestCallback(mockReq, mockRes);
        const client = await clientPromise;

        // Authentication should succeed even if fetchAndCacheUserInfo fails
        expect(client).toBe(mockOAuth2Client);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          'Failed to fetch user info:',
          500,
          'Internal Server Error',
        );

        consoleLogSpy.mockRestore();
      });

      it('should handle user code authentication failure with descriptive error', async () => {
        const mockConfigWithNoBrowser = {
          getNoBrowser: () => true,
          getProxy: () => 'http://test.proxy.com:8080',
          isBrowserLaunchSuppressed: () => true,
        } as unknown as Config;

        const mockOAuth2Client = {
          generateCodeVerifierAsync: vi.fn().mockResolvedValue({
            codeChallenge: 'test-challenge',
            codeVerifier: 'test-verifier',
          }),
          generateAuthUrl: vi.fn().mockReturnValue('https://example.com/auth'),
          getToken: vi
            .fn()
            .mockRejectedValue(new Error('Invalid authorization code')),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        const mockReadline = {
          question: vi.fn((_query, callback) => callback('invalid-code')),
          close: vi.fn(),
          on: vi.fn(),
        };
        (readline.createInterface as Mock).mockReturnValue(mockReadline);

        const consoleLogSpy = vi
          .spyOn(debugLogger, 'log')
          .mockImplementation(() => {});
        const consoleErrorSpy = vi
          .spyOn(debugLogger, 'error')
          .mockImplementation(() => {});

        await expect(
          getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfigWithNoBrowser),
        ).rejects.toThrow('Failed to authenticate with user code.');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to authenticate with authorization code:',
          'Invalid authorization code',
        );

        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      });
    });

    describe('cancellation', () => {
      it('should cancel when SIGINT is received', async () => {
        const mockAuthUrl = 'https://example.com/auth';
        const mockState = 'test-state';
        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
        vi.mocked(open).mockImplementation(
          async () => ({ on: vi.fn() }) as never,
        );

        // Mock createServer to return a server that doesn't do anything (keeps promise pending)
        const mockHttpServer = {
          listen: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          address: () => ({ port: 3000 }),
        };
        (http.createServer as Mock).mockImplementation(
          () => mockHttpServer as unknown as http.Server,
        );

        // Mock process.on to capture SIGINT handler
        const processOnSpy = vi
          .spyOn(process, 'on')
          .mockImplementation(() => process);

        const processRemoveListenerSpy = vi.spyOn(process, 'removeListener');

        const clientPromise = getOauthClient(
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        );

        // Wait for the SIGINT handler to be registered
        let sigIntHandler: (() => void) | undefined;
        await vi.waitFor(() => {
          const sigintCall = processOnSpy.mock.calls.find(
            (call) => call[0] === 'SIGINT',
          );
          sigIntHandler = sigintCall?.[1] as (() => void) | undefined;
          if (!sigIntHandler)
            throw new Error('SIGINT handler not registered yet');
        });

        expect(sigIntHandler).toBeDefined();

        // Trigger SIGINT
        if (sigIntHandler) {
          sigIntHandler();
        }

        await expect(clientPromise).rejects.toThrow(FatalCancellationError);
        expect(processRemoveListenerSpy).toHaveBeenCalledWith(
          'SIGINT',
          expect.any(Function),
        );

        processOnSpy.mockRestore();
        processRemoveListenerSpy.mockRestore();
      });

      it('should cancel when Ctrl+C (0x03) is received on stdin', async () => {
        const mockAuthUrl = 'https://example.com/auth';
        const mockState = 'test-state';
        const mockOAuth2Client = {
          generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
        vi.mocked(open).mockImplementation(
          async () => ({ on: vi.fn() }) as never,
        );

        const mockHttpServer = {
          listen: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          address: () => ({ port: 3000 }),
        };
        (http.createServer as Mock).mockImplementation(
          () => mockHttpServer as unknown as http.Server,
        );

        // Spy on process.stdin.on to capture data handler
        const stdinOnSpy = vi
          .spyOn(process.stdin, 'on')
          .mockImplementation(() => process.stdin);

        const stdinRemoveListenerSpy = vi.spyOn(
          process.stdin,
          'removeListener',
        );

        const clientPromise = getOauthClient(
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        );

        // Wait for the stdin handler to be registered
        let dataHandler: ((data: Buffer) => void) | undefined;
        await vi.waitFor(() => {
          const dataCall = stdinOnSpy.mock.calls.find(
            (call: [string, ...unknown[]]) => call[0] === 'data',
          );
          dataHandler = dataCall?.[1] as ((data: Buffer) => void) | undefined;
          if (!dataHandler) throw new Error('stdin handler not registered yet');
        });

        expect(dataHandler).toBeDefined();

        // Trigger Ctrl+C
        if (dataHandler) {
          dataHandler(Buffer.from([0x03]));
        }

        await expect(clientPromise).rejects.toThrow(FatalCancellationError);
        expect(stdinRemoveListenerSpy).toHaveBeenCalledWith(
          'data',
          expect.any(Function),
        );

        stdinOnSpy.mockRestore();
        stdinRemoveListenerSpy.mockRestore();
      });
    });

    describe('clearCachedCredentialFile', () => {
      it('should clear cached credentials and Google account', async () => {
        const cachedCreds = { refresh_token: 'test-token' };
        const credsPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'oauth_creds.json',
        );
        await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
        await fs.promises.writeFile(credsPath, JSON.stringify(cachedCreds));

        const googleAccountPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'google_accounts.json',
        );
        const accountData = { active: 'test@example.com', old: [] };
        await fs.promises.writeFile(
          googleAccountPath,
          JSON.stringify(accountData),
        );
        const userAccountManager = new UserAccountManager();

        expect(fs.existsSync(credsPath)).toBe(true);
        expect(fs.existsSync(googleAccountPath)).toBe(true);
        expect(userAccountManager.getCachedGoogleAccount()).toBe(
          'test@example.com',
        );

        await clearCachedCredentialFile();
        expect(fs.existsSync(credsPath)).toBe(false);
        expect(userAccountManager.getCachedGoogleAccount()).toBeNull();
        const updatedAccountData = JSON.parse(
          fs.readFileSync(googleAccountPath, 'utf-8'),
        );
        expect(updatedAccountData.active).toBeNull();
        expect(updatedAccountData.old).toContain('test@example.com');
      });

      it('should clear the in-memory OAuth client cache', async () => {
        const mockSetCredentials = vi.fn();
        const mockGetAccessToken = vi
          .fn()
          .mockResolvedValue({ token: 'test-token' });
        const mockGetTokenInfo = vi.fn().mockResolvedValue({});
        const mockOAuth2Client = {
          setCredentials: mockSetCredentials,
          getAccessToken: mockGetAccessToken,
          getTokenInfo: mockGetTokenInfo,
          on: vi.fn(),
        } as unknown as OAuth2Client;
        vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

        // Pre-populate credentials to make getOauthClient resolve quickly
        const credsPath = path.join(
          tempHomeDir,
          GEMINI_DIR,
          'oauth_creds.json',
        );
        await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
        await fs.promises.writeFile(
          credsPath,
          JSON.stringify({ refresh_token: 'token' }),
        );

        // First call, should create a client
        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);
        expect(OAuth2Client).toHaveBeenCalledTimes(1);

        // Second call, should use cached client
        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);
        expect(OAuth2Client).toHaveBeenCalledTimes(1);

        clearOauthClientCache();

        // Third call, after clearing cache, should create a new client
        await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);
        expect(OAuth2Client).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('with encrypted flag true', () => {
    let tempHomeDir: string;
    beforeEach(() => {
      process.env[FORCE_ENCRYPTED_FILE_ENV_VAR] = 'true';
      tempHomeDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-test-home-'),
      );
      vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
      vi.mocked(pathsHomedir).mockReturnValue(tempHomeDir);
    });

    afterEach(() => {
      fs.rmSync(tempHomeDir, { recursive: true, force: true });
      vi.clearAllMocks();
      resetOauthClientForTesting();
      vi.unstubAllEnvs();
    });

    it('should save credentials using OAuthCredentialStorage during web login', async () => {
      const { OAuthCredentialStorage } = await import(
        './oauth-credential-storage.js'
      );
      const mockAuthUrl = 'https://example.com/auth';
      const mockCode = 'test-code';
      const mockState = 'test-state';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      let onTokensCallback: (tokens: Credentials) => void = () => {};
      const mockOn = vi.fn((event, callback) => {
        if (event === 'tokens') {
          onTokensCallback = callback;
        }
      });

      const mockGetToken = vi.fn().mockImplementation(async () => {
        onTokensCallback(mockTokens);
        return { tokens: mockTokens };
      });

      const mockOAuth2Client = {
        generateAuthUrl: vi.fn().mockReturnValue(mockAuthUrl),
        getToken: mockGetToken,
        setCredentials: vi.fn(),
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ token: 'mock-access-token' }),
        on: mockOn,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(
        async () => ({ on: vi.fn() }) as never,
      );

      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: vi
          .fn()
          .mockResolvedValue({ email: 'test-google-account@gmail.com' }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener;
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
        requestCallback = cb as http.RequestListener;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient(
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      requestCallback(mockReq, mockRes);

      await clientPromise;

      expect(
        vi.mocked(OAuthCredentialStorage.saveCredentials),
      ).toHaveBeenCalledWith(mockTokens);
      const credsPath = path.join(tempHomeDir, GEMINI_DIR, 'oauth_creds.json');
      expect(fs.existsSync(credsPath)).toBe(false);
    });

    it('should load credentials using OAuthCredentialStorage and not from file', async () => {
      const { OAuthCredentialStorage } = await import(
        './oauth-credential-storage.js'
      );
      const cachedCreds = { refresh_token: 'cached-encrypted-token' };
      vi.mocked(OAuthCredentialStorage.loadCredentials).mockResolvedValue(
        cachedCreds,
      );

      // Create a dummy unencrypted credential file.
      // If the logic is correct, this file should be ignored.
      const unencryptedCreds = { refresh_token: 'unencrypted-token' };
      const credsPath = path.join(tempHomeDir, GEMINI_DIR, 'oauth_creds.json');
      await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
      await fs.promises.writeFile(credsPath, JSON.stringify(unencryptedCreds));

      const mockClient = {
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
        getTokenInfo: vi.fn().mockResolvedValue({}),
        on: vi.fn(),
      };

      vi.mocked(OAuth2Client).mockImplementation(
        () => mockClient as unknown as OAuth2Client,
      );

      await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, mockConfig);

      expect(
        vi.mocked(OAuthCredentialStorage.loadCredentials),
      ).toHaveBeenCalled();
      expect(mockClient.setCredentials).toHaveBeenCalledWith(cachedCreds);
      expect(mockClient.setCredentials).not.toHaveBeenCalledWith(
        unencryptedCreds,
      );
    });

    it('should clear credentials using OAuthCredentialStorage', async () => {
      const { OAuthCredentialStorage } = await import(
        './oauth-credential-storage.js'
      );

      // Create a dummy unencrypted credential file. It should not be deleted.
      const credsPath = path.join(tempHomeDir, GEMINI_DIR, 'oauth_creds.json');
      await fs.promises.mkdir(path.dirname(credsPath), { recursive: true });
      await fs.promises.writeFile(credsPath, '{}');

      await clearCachedCredentialFile();

      expect(
        OAuthCredentialStorage.clearCredentials as Mock,
      ).toHaveBeenCalled();
      expect(fs.existsSync(credsPath)).toBe(true); // The unencrypted file should remain
    });
  });
});
