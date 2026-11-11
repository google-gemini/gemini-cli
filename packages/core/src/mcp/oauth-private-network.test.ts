/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockOpenBrowserSecurely = vi.hoisted(() => vi.fn());
const mockHttpServer = vi.hoisted(() => ({
  listen: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  address: vi.fn(() => ({ address: '127.0.0.1', family: 'IPv4', port: 7777 })),
  listening: false,
}));

vi.mock('../utils/secure-browser-launcher.js', () => ({
  openBrowserSecurely: mockOpenBrowserSecurely,
}));
vi.mock('../utils/authConsent.js', () => ({
  getConsentForOauth: vi.fn(() => Promise.resolve(false)),
}));
vi.mock('./oauth-token-storage.js', () => ({
  MCPOAuthTokenStorage: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, createServer: vi.fn(() => mockHttpServer) };
});

import * as http from 'node:http';
import * as dnsPromises from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import { MCPOAuthProvider, type MCPOAuthConfig } from './oauth-provider.js';
import { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import type { OAuthCredentials } from './token-storage/types.js';
import {
  OAuthUtils,
  OAuthSecurityError,
  validateOAuthEndpointUrl,
  type OAuthUrlValidationOptions,
} from './oauth-utils.js';
import { DynamicStoredOAuthProvider } from './stored-token-provider.js';
import { connectToMcpServer } from '../tools/mcp-client.js';
import type { MCPServerConfig } from '../config/config.js';
import {
  isEnterprisePrivateAddress,
  isAddressPrivate,
} from '../utils/fetch.js';
import { getConsentForOauth } from '../utils/authConsent.js';
import { coreEvents } from '../utils/events.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';

const SERVER_NAME = 'enterprise-jira-mcp';
const ENTERPRISE_HOST =
  'jira-app-2938-default.aip-use5.prj-dv-host.dev.internal.example.com';
const ENTERPRISE_PRIVATE_IP = '10.28.128.77';
const MCP_SERVER_URL = `https://${ENTERPRISE_HOST}/mcp`;
const PRM_URL = `https://${ENTERPRISE_HOST}/.well-known/oauth-protected-resource/mcp`;
const AS_METADATA_URL = `https://${ENTERPRISE_HOST}/.well-known/oauth-authorization-server`;
const PRIVATE_AUTHORIZATION_URL = `https://${ENTERPRISE_HOST}/oauth/authorize`;
const PRIVATE_TOKEN_URL = `https://${ENTERPRISE_HOST}/oauth/token`;
const PUBLIC_IP = '93.184.216.34';
const MIXED_ANSWER_HOST = 'mixed-answers.corp.example.com';
const REMEDIATION_HINT =
  'Set "oauth.allowPrivateNetwork": true in settings.json for this MCP server if it is on a trusted private network.';

const dnsBranchMessage = (
  url: string,
  address = ENTERPRISE_PRIVATE_IP,
  includeHint = true,
) =>
  `OAuth endpoint "${url}" resolves to private network address "${address}" which is blocked.${includeHint ? ` ${REMEDIATION_HINT}` : ''}`;

const literalBranchMessage = (url: string, includeHint = true) =>
  `OAuth endpoint "${url}" points to private or reserved IP address which is blocked.${includeHint ? ` ${REMEDIATION_HINT}` : ''}`;

type LookupAll = (
  hostname: string,
  options: LookupAllOptions,
) => Promise<LookupAddress[]>;
const mockLookup = vi.mocked(dnsPromises.lookup as unknown as LookupAll);

const DNS_ANSWERS: Record<string, LookupAddress[]> = {
  [ENTERPRISE_HOST]: [{ address: ENTERPRISE_PRIVATE_IP, family: 4 }],
  'sso.corp.internal': [{ address: ENTERPRISE_PRIVATE_IP, family: 4 }],
  'auth.mycompany.local': [{ address: '192.168.10.25', family: 4 }],
  'metadata.corp.internal': [{ address: '169.254.169.254', family: 4 }],
  [MIXED_ANSWER_HOST]: [
    { address: ENTERPRISE_PRIVATE_IP, family: 4 },
    { address: '169.254.169.254', family: 4 },
  ],
};

type RouteHandler = () => Response;
let routes: Record<string, RouteHandler> = {};
const requestLog: string[] = [];
const unexpectedRequests: string[] = [];

const mockFetch = vi.fn(
  async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url}`;
    requestLog.push(key);
    const handler = routes[key];
    if (!handler) {
      unexpectedRequests.push(key);
      throw new TypeError(`fetch failed: no test route for ${key}`);
    }
    return handler();
  },
);

function createStubStorage(credentials: OAuthCredentials | null) {
  return {
    getCredentials: vi.fn(async () => credentials),
    isTokenExpired: vi.fn(() => true),
    deleteCredentials: vi.fn(async () => {}),
    saveToken: vi.fn(async () => {}),
  };
}

function providerWith(storage: ReturnType<typeof createStubStorage>) {
  return new MCPOAuthProvider(storage as unknown as MCPOAuthTokenStorage);
}

function expiredPrivateIdpCredentials(): OAuthCredentials {
  return {
    serverName: SERVER_NAME,
    token: {
      accessToken: 'expired-access-token',
      tokenType: 'Bearer',
      refreshToken: 'refresh-token-1',
      expiresAt: Date.now() - 60_000,
    },
    clientId: 'gemini-cli',
    tokenUrl: PRIVATE_TOKEN_URL,
    mcpServerUrl: MCP_SERVER_URL,
    updatedAt: Date.now() - 3_600_000,
  };
}

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`Non-Error rejection: ${String(error)}`);
  }
  throw new Error('Expected the promise to reject, but it resolved.');
}

describe('MCP OAuth endpoints on private enterprise networks', () => {
  let feedbackSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = {};
    requestLog.length = 0;
    unexpectedRequests.length = 0;
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    feedbackSpy = vi
      .spyOn(coreEvents, 'emitFeedback')
      .mockImplementation(() => {});

    mockLookup.mockImplementation(async (hostname: string) => {
      const answer = DNS_ANSWERS[hostname];
      if (answer) {
        return answer;
      }
      const family = isIP(hostname);
      if (family !== 0) {
        return [{ address: hostname, family }];
      }
      return [{ address: PUBLIC_IP, family: 4 }];
    });

    mockHttpServer.listen.mockImplementation(
      (_port: number, callback?: () => void) => {
        callback?.();
        return mockHttpServer;
      },
    );
    vi.mocked(getConsentForOauth).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 0. Address Classifier Unit Tests (isEnterprisePrivateAddress)
  // -------------------------------------------------------------------------
  describe('isEnterprisePrivateAddress classifier', () => {
    it.each([
      ['10.0.0.1'],
      ['10.28.128.77'],
      ['172.16.0.1'],
      ['172.31.255.254'],
      ['192.168.1.1'],
      ['100.64.0.1'],
      ['100.127.255.254'],
      ['fc00::1'],
      ['fd12:3456:789a::1'],
      ['[fd00::1]'],
      ['::ffff:10.28.128.77'],
      ['sso.corp.internal'],
      ['SSO.CORP.INTERNAL'],
      ['auth.mycompany.local'],
    ])(
      'returns true for enterprise private target %s while keeping isAddressPrivate true',
      (target) => {
        expect(isEnterprisePrivateAddress(target)).toBe(true);
        expect(isAddressPrivate(target.toLowerCase())).toBe(true);
      },
    );

    it.each([
      ['127.0.0.1'],
      ['::1'],
      ['localhost'],
      ['sub.localhost'],
      ['169.254.169.254'],
      ['fe80::1'],
      ['::ffff:169.254.169.254'],
      ['::ffff:127.0.0.1'],
      ['224.0.0.1'],
      ['255.255.255.255'],
      ['0.0.0.0'],
      ['::'],
      ['198.18.0.1'],
      ['198.19.255.254'],
      ['93.184.216.34'],
      ['auth.example.com'],
    ])('returns false for restricted or public target %s', (target) => {
      expect(isEnterprisePrivateAddress(target)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 1. Default Behavior: rejects private-network OAuth endpoints without opt-in
  // -------------------------------------------------------------------------
  describe('default behavior: rejects private-network OAuth endpoints when allowPrivateNetwork is omitted or false', () => {
    it('R1a /mcp auth, WWW-Authenticate discovery: rejects the private discovery URL with actionable hint before requesting it', async () => {
      routes[`HEAD ${MCP_SERVER_URL}`] = () =>
        new Response(null, {
          status: 401,
          headers: {
            'www-authenticate': `Bearer resource_metadata="${PRM_URL}"`,
          },
        });

      const storage = createStubStorage(null);
      const error = await captureRejection(
        providerWith(storage).authenticate(
          SERVER_NAME,
          { enabled: false },
          MCP_SERVER_URL,
        ),
      );

      expect(error).toBeInstanceOf(OAuthSecurityError);
      expect(error.message).toBe(dnsBranchMessage(PRM_URL));
      expect(requestLog).toEqual([`HEAD ${MCP_SERVER_URL}`]);
      expect(unexpectedRequests).toEqual([]);
      expect(mockLookup).toHaveBeenCalledWith(ENTERPRISE_HOST, { all: true });
      expect(vi.mocked(http.createServer)).not.toHaveBeenCalled();
      expect(getConsentForOauth).not.toHaveBeenCalled();
      expect(mockOpenBrowserSecurely).not.toHaveBeenCalled();
      expect(storage.saveToken).not.toHaveBeenCalled();
    });

    it('R1b /mcp auth, well-known discovery (HEAD not 401): rejects the private discovery URL before requesting it', async () => {
      routes[`HEAD ${MCP_SERVER_URL}`] = () =>
        new Response(null, { status: 405 });

      const error = await captureRejection(
        providerWith(createStubStorage(null)).authenticate(
          SERVER_NAME,
          { enabled: false },
          MCP_SERVER_URL,
        ),
      );

      expect(error.message).toBe(dnsBranchMessage(PRM_URL));
      expect(requestLog).toEqual([`HEAD ${MCP_SERVER_URL}`]);
      expect(unexpectedRequests).toEqual([]);
      expect(getConsentForOauth).not.toHaveBeenCalled();
      expect(mockOpenBrowserSecurely).not.toHaveBeenCalled();
    });

    it('R2 automatic 401 path: discovery from WWW-Authenticate rejects the private discovery URL', async () => {
      const error = await captureRejection(
        OAuthUtils.discoverOAuthFromWWWAuthenticate(
          `Bearer resource_metadata="${PRM_URL}"`,
          MCP_SERVER_URL,
        ),
      );

      expect(error.message).toBe(dnsBranchMessage(PRM_URL));
      expect(requestLog).toEqual([]);
    });

    it('R3a explicit endpoints on a literal private IP: rejected before callback server or consent, without DNS or requests', async () => {
      const authorizationUrl = `https://${ENTERPRISE_PRIVATE_IP}/oauth/authorize`;
      const config: MCPOAuthConfig = {
        enabled: true,
        clientId: 'gemini-cli',
        authorizationUrl,
        tokenUrl: `https://${ENTERPRISE_PRIVATE_IP}/oauth/token`,
      };

      const error = await captureRejection(
        providerWith(createStubStorage(null)).authenticate(
          SERVER_NAME,
          config,
          MCP_SERVER_URL,
        ),
      );

      expect(error.message).toBe(literalBranchMessage(authorizationUrl));
      expect(requestLog).toEqual([]);
      expect(mockLookup).not.toHaveBeenCalled();
      expect(vi.mocked(http.createServer)).not.toHaveBeenCalled();
      expect(getConsentForOauth).not.toHaveBeenCalled();
      expect(mockOpenBrowserSecurely).not.toHaveBeenCalled();
    });

    it('R3b explicit endpoints on a hostname resolving to a private IP: rejected before callback server or consent', async () => {
      const config: MCPOAuthConfig = {
        enabled: true,
        clientId: 'gemini-cli',
        authorizationUrl: PRIVATE_AUTHORIZATION_URL,
        tokenUrl: PRIVATE_TOKEN_URL,
      };

      const error = await captureRejection(
        providerWith(createStubStorage(null)).authenticate(
          SERVER_NAME,
          config,
          MCP_SERVER_URL,
        ),
      );

      expect(error.message).toBe(dnsBranchMessage(PRIVATE_AUTHORIZATION_URL));
      expect(requestLog).toEqual([]);
      expect(vi.mocked(http.createServer)).not.toHaveBeenCalled();
      expect(getConsentForOauth).not.toHaveBeenCalled();
    });

    it('R4 token refresh against a private token endpoint without opt-in: rejected and stored credentials are deleted', async () => {
      const storage = createStubStorage(expiredPrivateIdpCredentials());

      const token = await providerWith(storage).getValidToken(SERVER_NAME, {});

      expect(token).toBeNull();
      expect(requestLog).toEqual([]);
      expect(storage.saveToken).not.toHaveBeenCalled();
      expect(storage.deleteCredentials).toHaveBeenCalledTimes(1);
      expect(storage.deleteCredentials).toHaveBeenCalledWith(SERVER_NAME);
      expect(feedbackSpy).toHaveBeenCalledWith(
        'error',
        'Failed to refresh auth token.',
        expect.objectContaining({
          message: dnsBranchMessage(PRIVATE_TOKEN_URL),
        }),
      );
    });

    it.each([
      ['RFC 1918 10.0.0.0/8', 'https://10.0.0.1/oauth/token', true],
      ['RFC 1918 172.16.0.0/12', 'https://172.16.0.1/oauth/token', true],
      ['RFC 1918 192.168.0.0/16', 'https://192.168.1.1/oauth/token', true],
      ['CGNAT 100.64.0.0/10', 'https://100.64.0.10/oauth/token', true],
      ['RFC 4193 fc00::/7', 'https://[fd00::1]/oauth/token', true],
      ['.internal name', 'https://sso.corp.internal/oauth/token', true],
      ['.local name', 'https://auth.mycompany.local/oauth/token', true],
      [
        'link-local 169.254.0.0/16',
        'https://169.254.169.254/oauth/token',
        false,
      ],
    ])(
      'R5 scope: rejects %s without opt-in',
      async (_label, url, includeHint) => {
        await expect(validateOAuthEndpointUrl(url)).rejects.toThrow(
          literalBranchMessage(url, includeHint),
        );
        await expect(
          validateOAuthEndpointUrl(url, { allowPrivateNetwork: false }),
        ).rejects.toThrow(literalBranchMessage(url, includeHint));
      },
    );

    it('C1 control: a public OAuth endpoint is accepted by the same harness', async () => {
      const url = 'https://auth.example.com/oauth/authorize';
      await expect(validateOAuthEndpointUrl(url)).resolves.toBe(url);
    });

    it('C2 control: a loopback discovery URL is accepted when the MCP server is loopback', async () => {
      const url =
        'http://localhost:8080/.well-known/oauth-protected-resource/mcp';
      await expect(
        validateOAuthEndpointUrl(url, { allowLoopback: true }),
      ).resolves.toBe(url);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Opt-in Behavior: per-server oauth.allowPrivateNetwork: true
  // -------------------------------------------------------------------------
  describe('opt-in behavior: per-server oauth.allowPrivateNetwork: true', () => {
    it('A1 /mcp auth discovery for a private MCP server with opt-in reaches the consent step', async () => {
      routes[`HEAD ${MCP_SERVER_URL}`] = () =>
        new Response(null, {
          status: 401,
          headers: {
            'www-authenticate': `Bearer resource_metadata="${PRM_URL}"`,
          },
        });
      routes[`GET ${PRM_URL}`] = () =>
        Response.json({
          resource: MCP_SERVER_URL,
          authorization_servers: [`https://${ENTERPRISE_HOST}`],
        });
      const PRIVATE_REGISTRATION_URL = `https://${ENTERPRISE_HOST}/oauth/register`;
      routes[`GET ${AS_METADATA_URL}`] = () =>
        Response.json({
          issuer: `https://${ENTERPRISE_HOST}`,
          authorization_endpoint: PRIVATE_AUTHORIZATION_URL,
          token_endpoint: PRIVATE_TOKEN_URL,
          registration_endpoint: PRIVATE_REGISTRATION_URL,
        });
      routes[`POST ${PRIVATE_REGISTRATION_URL}`] = () =>
        Response.json({
          client_id: 'dynamic-private-client',
          redirect_uris: ['http://localhost:33418/oauth/callback'],
        });
      const config: MCPOAuthConfig = {
        enabled: false,
        clientId: 'gemini-cli',
        allowPrivateNetwork: true,
      };

      const error = await captureRejection(
        providerWith(createStubStorage(null)).authenticate(
          SERVER_NAME,
          config,
          MCP_SERVER_URL,
        ),
      );

      expect(error.message).toBe('Authentication cancelled by user.');
      expect(getConsentForOauth).toHaveBeenCalledTimes(1);
      expect(unexpectedRequests).toEqual([]);
    });

    it('A2 explicit private endpoints with opt-in reach the consent step', async () => {
      const config: MCPOAuthConfig = {
        enabled: true,
        clientId: 'gemini-cli',
        authorizationUrl: PRIVATE_AUTHORIZATION_URL,
        tokenUrl: PRIVATE_TOKEN_URL,
        allowPrivateNetwork: true,
      };

      const error = await captureRejection(
        providerWith(createStubStorage(null)).authenticate(
          SERVER_NAME,
          config,
          MCP_SERVER_URL,
        ),
      );

      expect(error.message).toBe('Authentication cancelled by user.');
      expect(getConsentForOauth).toHaveBeenCalledTimes(1);
    });

    it('A3 token refresh with opt-in succeeds and preserves the stored credentials', async () => {
      routes[`POST ${PRIVATE_TOKEN_URL}`] = () =>
        Response.json({
          access_token: 'new-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        });
      const storage = createStubStorage(expiredPrivateIdpCredentials());
      const config: MCPOAuthConfig = { allowPrivateNetwork: true };

      const token = await providerWith(storage).getValidToken(
        SERVER_NAME,
        config,
      );

      expect(token).toBe('new-access-token');
      expect(storage.deleteCredentials).not.toHaveBeenCalled();
      expect(storage.saveToken).toHaveBeenCalledTimes(1);
      expect(requestLog).toEqual([`POST ${PRIVATE_TOKEN_URL}`]);
    });

    it('A4 validator with opt-in accepts DNS-resolved RFC 1918, literal RFC 1918, CGNAT, RFC 4193, and .internal/.local endpoints', async () => {
      const options: OAuthUrlValidationOptions = {
        allowPrivateNetwork: true,
      };
      for (const url of [
        'https://10.0.0.1/oauth/token',
        'https://172.16.0.1/oauth/token',
        'https://192.168.1.1/oauth/token',
        'https://100.64.0.1/oauth/token',
        'https://[fd00::1]/oauth/token',
        'https://sso.corp.internal/oauth/token',
        'https://auth.mycompany.local/oauth/token',
        PRIVATE_TOKEN_URL,
      ]) {
        await expect(validateOAuthEndpointUrl(url, options)).resolves.toBe(url);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. Unconditional Guardrails: still rejected even with allowPrivateNetwork: true
  // -------------------------------------------------------------------------
  describe('guardrails: restricted ranges and protocol checks still enforced when allowPrivateNetwork is true', () => {
    const optIn: OAuthUrlValidationOptions = { allowPrivateNetwork: true };

    it('G1 link-local / instance metadata literals (169.254.169.254, fe80::/10) stay rejected', async () => {
      await expect(
        validateOAuthEndpointUrl(
          'https://169.254.169.254/computeMetadata/v1',
          optIn,
        ),
      ).rejects.toThrow(OAuthSecurityError);

      await expect(
        validateOAuthEndpointUrl('https://[fe80::1]/oauth/token', optIn),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('G2 a hostname or .internal domain resolving to link-local or mixed DNS answers stays rejected', async () => {
      await expect(
        validateOAuthEndpointUrl(
          `https://${MIXED_ANSWER_HOST}/oauth/token`,
          optIn,
        ),
      ).rejects.toThrow(
        dnsBranchMessage(
          `https://${MIXED_ANSWER_HOST}/oauth/token`,
          '169.254.169.254',
          false,
        ),
      );

      await expect(
        validateOAuthEndpointUrl(
          'https://metadata.corp.internal/oauth/token',
          optIn,
        ),
      ).rejects.toThrow(
        dnsBranchMessage(
          'https://metadata.corp.internal/oauth/token',
          '169.254.169.254',
          false,
        ),
      );
    });

    it('G3 plain HTTP to a private address stays rejected', async () => {
      await expect(
        validateOAuthEndpointUrl(
          `http://${ENTERPRISE_PRIVATE_IP}/oauth/token`,
          optIn,
        ),
      ).rejects.toThrow(
        /OAuth endpoints must use HTTPS unless connecting to localhost\.$/,
      );
    });

    it('G4 loopback (127.0.0.1, ::1, localhost, .localhost) stays rejected unless allowLoopback is set', async () => {
      await expect(
        validateOAuthEndpointUrl('https://127.0.0.1/oauth/token', optIn),
      ).rejects.toThrow(
        'Loopback OAuth endpoint "https://127.0.0.1/oauth/token" is not allowed for remote MCP servers.',
      );

      await expect(
        validateOAuthEndpointUrl('https://app.localhost/oauth/token', optIn),
      ).rejects.toThrow(
        literalBranchMessage('https://app.localhost/oauth/token', false),
      );
    });

    it('G5 multicast (224.0.0.1) and benchmark testing (198.18.0.1) addresses stay rejected', async () => {
      await expect(
        validateOAuthEndpointUrl('https://224.0.0.1/oauth/token', optIn),
      ).rejects.toThrow(
        literalBranchMessage('https://224.0.0.1/oauth/token', false),
      );

      await expect(
        validateOAuthEndpointUrl('https://198.18.0.1/oauth/token', optIn),
      ).rejects.toThrow(
        literalBranchMessage('https://198.18.0.1/oauth/token', false),
      );
    });

    it('G6 cross-origin resource_metadata stays rejected even with allowPrivateNetwork: true', async () => {
      await expect(
        OAuthUtils.discoverOAuthFromWWWAuthenticate(
          'Bearer resource_metadata="https://other-internal.corp.internal/.well-known/oauth-protected-resource"',
          MCP_SERVER_URL,
          { allowPrivateNetwork: true },
        ),
      ).rejects.toThrow(/does not match expected origin/);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Plumbing Verification: DynamicStoredOAuthProvider & Automatic 401 OAuth
  // -------------------------------------------------------------------------
  describe('plumbing verification: background token refresh and automatic 401 OAuth', () => {
    it('P1 DynamicStoredOAuthProvider.tokens() forwards allowPrivateNetwork during refresh even when oauth.enabled is not set', async () => {
      routes[`POST ${PRIVATE_TOKEN_URL}`] = () =>
        Response.json({
          access_token: 'refreshed-private-token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      const storage = createStubStorage(expiredPrivateIdpCredentials());
      vi.mocked(MCPOAuthTokenStorage).mockImplementation(
        () => storage as unknown as MCPOAuthTokenStorage,
      );
      const getValidTokenWithMetadataSpy = vi.spyOn(
        MCPOAuthProvider.prototype,
        'getValidTokenWithMetadata',
      );

      const serverConfig = {
        url: MCP_SERVER_URL,
        type: 'http',
        oauth: {
          allowPrivateNetwork: true,
        },
      } as unknown as MCPServerConfig;

      const dynamicProvider = new DynamicStoredOAuthProvider(
        SERVER_NAME,
        serverConfig,
      );
      const tokens = await dynamicProvider.tokens();

      expect(getValidTokenWithMetadataSpy).toHaveBeenCalledWith(SERVER_NAME, {
        allowPrivateNetwork: true,
      });
      expect(tokens?.access_token).toBe('refreshed-private-token');
      expect(storage.deleteCredentials).not.toHaveBeenCalled();
      expect(storage.saveToken).toHaveBeenCalledTimes(1);
    });

    it('P2 connectToMcpServer automatic 401 OAuth flow forwards allowPrivateNetwork to discovery and authenticate()', async () => {
      routes[`POST ${MCP_SERVER_URL}`] = () =>
        new Response('Unauthorized', {
          status: 401,
          headers: {
            'www-authenticate': `Bearer resource_metadata="${PRM_URL}"`,
          },
        });
      routes[`HEAD ${MCP_SERVER_URL}`] = () =>
        new Response(null, {
          status: 401,
          headers: {
            'www-authenticate': `Bearer resource_metadata="${PRM_URL}"`,
          },
        });
      routes[`GET ${PRM_URL}`] = () =>
        Response.json({
          resource: MCP_SERVER_URL,
          authorization_servers: [`https://${ENTERPRISE_HOST}`],
        });
      const PRIVATE_REGISTRATION_URL = `https://${ENTERPRISE_HOST}/oauth/register`;
      routes[`GET ${AS_METADATA_URL}`] = () =>
        Response.json({
          issuer: `https://${ENTERPRISE_HOST}`,
          authorization_endpoint: PRIVATE_AUTHORIZATION_URL,
          token_endpoint: PRIVATE_TOKEN_URL,
          registration_endpoint: PRIVATE_REGISTRATION_URL,
        });
      routes[`POST ${PRIVATE_REGISTRATION_URL}`] = () =>
        Response.json({
          client_id: 'dynamic-private-client',
          redirect_uris: ['http://localhost:33418/oauth/callback'],
        });

      const storage = createStubStorage(null);
      vi.mocked(MCPOAuthTokenStorage).mockImplementation(
        () => storage as unknown as MCPOAuthTokenStorage,
      );

      const authenticateSpy = vi.spyOn(
        MCPOAuthProvider.prototype,
        'authenticate',
      );
      const discoverWWWAuthSpy = vi.spyOn(
        OAuthUtils,
        'discoverOAuthFromWWWAuthenticate',
      );

      const serverConfig: MCPServerConfig = {
        httpUrl: MCP_SERVER_URL,
        oauth: {
          enabled: true,
          allowPrivateNetwork: true,
        },
      };

      const workspaceContext = new WorkspaceContext(process.cwd());
      const mockContext = {
        sanitizationConfig: {
          enableEnvironmentVariableRedaction: false,
          allowedEnvironmentVariables: [],
          blockedEnvironmentVariables: [],
        },
        emitMcpDiagnostic: vi.fn(),
        isTrustedFolder: () => true,
      };

      await expect(
        connectToMcpServer(
          '0.0.1',
          SERVER_NAME,
          serverConfig,
          false,
          workspaceContext,
          mockContext,
        ),
      ).rejects.toThrow(
        `Failed to handle automatic OAuth for server '${SERVER_NAME}'`,
      );

      expect(discoverWWWAuthSpy).toHaveBeenCalledWith(
        `Bearer resource_metadata="${PRM_URL}"`,
        MCP_SERVER_URL,
        { allowPrivateNetwork: true },
      );
      expect(authenticateSpy).toHaveBeenCalledWith(
        SERVER_NAME,
        expect.objectContaining({
          enabled: true,
          authorizationUrl: PRIVATE_AUTHORIZATION_URL,
          tokenUrl: PRIVATE_TOKEN_URL,
          allowPrivateNetwork: true,
        }),
        MCP_SERVER_URL,
      );
      expect(getConsentForOauth).toHaveBeenCalledTimes(1);
    });
  });
});
