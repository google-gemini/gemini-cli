/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyCredentialStorage } from './apiKeyCredentialStorage.js';
import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';

const getCredentialsMock = vi.hoisted(() => vi.fn());
const setCredentialsMock = vi.hoisted(() => vi.fn());
const deleteCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock('../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn().mockImplementation(() => ({
    getCredentials: getCredentialsMock,
    setCredentials: setCredentialsMock,
    deleteCredentials: deleteCredentialsMock,
  })),
}));

describe('ApiKeyCredentialStorage', () => {
  let storage: HybridTokenStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new (vi.mocked(HybridTokenStorage))('test-service');
    vi.spyOn(
      ApiKeyCredentialStorage as unknown as { storage: HybridTokenStorage },
      'storage',
      'get',
    ).mockReturnValue(storage);
  });

  it('should load an API key', async () => {
    getCredentialsMock.mockResolvedValue({
      serverName: 'default-api-key',
      token: {
        accessToken: 'test-key',
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    });

    const apiKey = await ApiKeyCredentialStorage.loadApiKey();
    expect(apiKey).toBe('test-key');
  });

  it('should return null if no API key is stored', async () => {
    getCredentialsMock.mockResolvedValue(null);
    const apiKey = await ApiKeyCredentialStorage.loadApiKey();
    expect(apiKey).toBeNull();
  });

  it('should save an API key', async () => {
    await ApiKeyCredentialStorage.saveApiKey('new-key');
    expect(setCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({
          accessToken: 'new-key',
        }),
      }),
    );
  });

  it('should clear an API key', async () => {
    await ApiKeyCredentialStorage.clearApiKey();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });
});
