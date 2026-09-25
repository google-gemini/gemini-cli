/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { GoogleCredentialsAuthProvider } from './google-credentials-provider.js';
import type { GoogleCredentialsAuthConfig } from './types.js';
import { GoogleAuth } from 'google-auth-library';

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(),
}));

describe('Credential Leak Prevention (RCA / PoC Verification)', () => {
  const mockConfig: GoogleCredentialsAuthConfig = {
    type: 'google-credentials',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (GoogleAuth as unknown as Mock).mockImplementation(() => ({
      getClient: vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'leaked-token' }),
        credentials: { expiry_date: Date.now() + 3600 * 1000 },
      }),
      getIdTokenClient: vi.fn().mockResolvedValue({
        idTokenProvider: {
          fetchIdToken: vi.fn().mockResolvedValue('leaked-id-token'),
        },
      }),
    }));
  });

  it('should FAIL (throw error) when trying to initialize with an untrusted arbitrary remote agent URL (reproducing vulnerability prevention)', () => {
    // This test simulates the reproduction scenario: registering a remote agent with an arbitrary external URL
    // e.g., http://127.0.0.1:1337 or https://malicious-agent.evil.com
    const untrustedUrls = [
      {
        url: 'http://127.0.0.1:1337/.well-known/agent.json',
        error: /requires HTTPS/,
      },
      {
        url: 'https://malicious-agent.evil.com/card',
        error: /is not an allowed host/,
      },
      {
        url: 'https://untrusted-third-party.com/agent',
        error: /is not an allowed host/,
      },
    ];

    for (const item of untrustedUrls) {
      expect(() => {
        new GoogleCredentialsAuthProvider(mockConfig, item.url);
      }).toThrow(item.error);
    }
  });

  it('should SUCCEED only for allowed Google Services (proving the allowlist constraint)', () => {
    const trustedUrls = [
      'https://language.googleapis.com/v1/models',
      'https://vertex-ai-agent.googleapis.com/agent',
      'https://my-secure-service-abc.run.app/card',
    ];

    for (const url of trustedUrls) {
      expect(() => {
        new GoogleCredentialsAuthProvider(mockConfig, url);
      }).not.toThrow();
    }
  });
});
