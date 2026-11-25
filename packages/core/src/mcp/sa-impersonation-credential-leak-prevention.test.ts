/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ServiceAccountImpersonationProvider } from './sa-impersonation-provider.js';
import type { MCPServerConfig } from '../config/config.js';
import { GoogleAuth } from 'google-auth-library';

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(),
}));

describe('Credential Leak Prevention (SA Impersonation)', () => {
  const mockRequest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (GoogleAuth as unknown as Mock).mockImplementation(() => ({
      getClient: vi.fn().mockResolvedValue({
        request: mockRequest,
      }),
    }));
  });

  it('should FAIL (throw error) when the MCP server URL points to an untrusted arbitrary host (reproducing vulnerability prevention)', () => {
    // This test simulates the reproduction scenario: an attacker-controlled or
    // misconfigured MCP server URL receiving the minted service account ID token.
    const untrustedUrls = [
      'https://malicious-server.evil.com/mcp',
      'https://attacker.example.com',
      'https://googleapis.com', // no subdomain
      'https://evil-run-app.com', // suffix trick
      'https://notrun.app', // suffix trick
      'https://evilgoogleapis.com', // suffix trick
    ];

    for (const url of untrustedUrls) {
      const config = {
        url,
        targetAudience: 'my-audience',
        targetServiceAccount: 'my-sa',
        oauth: {
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        },
      } as MCPServerConfig;
      const hostname = new URL(url).hostname;
      expect(() => {
        new ServiceAccountImpersonationProvider(config);
      }).toThrow(
        `Host "${hostname}" is not an allowed host for the Service Account Impersonation provider.`,
      );
    }
  });

  it('should SUCCEED only for allowed default hosts (proving the allowlist constraint)', () => {
    const trustedUrls = [
      'https://my-iap-service.run.app/sse',
      'https://iamcredentials.googleapis.com/v1',
      'https://some-service.region.run.app',
    ];

    for (const url of trustedUrls) {
      const config = {
        url,
        targetAudience: 'my-audience',
        targetServiceAccount: 'my-sa',
        oauth: {
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        },
      } as MCPServerConfig;
      expect(() => {
        new ServiceAccountImpersonationProvider(config);
      }).not.toThrow();
    }
  });

  it('should FAIL when no scopes are configured (preventing over-privileged impersonated credentials)', () => {
    const config = {
      url: 'https://my-iap-service.run.app',
      targetAudience: 'my-audience',
      targetServiceAccount: 'my-sa',
    } as MCPServerConfig;
    expect(() => {
      new ServiceAccountImpersonationProvider(config);
    }).toThrow(
      'Scopes must be provided in the oauth config for the Service Account Impersonation provider',
    );
    expect(GoogleAuth).not.toHaveBeenCalled();
  });

  it('should honor a user-configured allowedHosts list (exact and wildcard entries)', () => {
    const config = {
      url: 'https://corp.example.com/mcp',
      targetAudience: 'my-audience',
      targetServiceAccount: 'my-sa',
      oauth: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
      allowedHosts: ['corp.example.com', '*.internal.example.com'],
    } as MCPServerConfig;

    expect(() => {
      new ServiceAccountImpersonationProvider(config);
    }).not.toThrow();

    const wildcardSubdomainConfig = {
      url: 'https://api.internal.example.com/mcp',
      targetAudience: 'my-audience',
      targetServiceAccount: 'my-sa',
      oauth: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
      allowedHosts: ['corp.example.com', '*.internal.example.com'],
    } as MCPServerConfig;
    expect(() => {
      new ServiceAccountImpersonationProvider(wildcardSubdomainConfig);
    }).not.toThrow();
  });

  it('should FAIL for hosts outside the user-configured allowedHosts list', () => {
    const config = {
      url: 'https://evil.com/mcp',
      targetAudience: 'my-audience',
      targetServiceAccount: 'my-sa',
      oauth: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
      allowedHosts: ['corp.example.com', '*.internal.example.com'],
    } as MCPServerConfig;
    expect(() => {
      new ServiceAccountImpersonationProvider(config);
    }).toThrow(
      'Host "evil.com" is not an allowed host for the Service Account Impersonation provider.',
    );
  });

  it('should not allow suffix tricks against wildcard allowedHosts entries', () => {
    const config = {
      url: 'https://evilinternal.example.com/mcp',
      targetAudience: 'my-audience',
      targetServiceAccount: 'my-sa',
      oauth: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
      allowedHosts: ['*.internal.example.com'],
    } as MCPServerConfig;
    expect(() => {
      new ServiceAccountImpersonationProvider(config);
    }).toThrow(
      'Host "evilinternal.example.com" is not an allowed host for the Service Account Impersonation provider.',
    );
  });

  it('should never mint a token for an untrusted host (no IAM request is made)', () => {
    const config = {
      url: 'https://malicious-server.evil.com/mcp',
      targetAudience: 'my-audience',
      targetServiceAccount: 'my-sa',
      oauth: {
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    } as MCPServerConfig;

    expect(() => {
      new ServiceAccountImpersonationProvider(config);
    }).toThrow(/is not an allowed host/);
    // The provider must fail at construction time, before any token is minted.
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
