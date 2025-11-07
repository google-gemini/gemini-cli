/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadApiKey,
  saveApiKey,
  clearApiKey,
} from './apiKeyCredentialStorage.js';

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
  beforeEach(() => {
    vi.clearAllMocks();
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

    const apiKey = await loadApiKey();
    expect(apiKey).toBe('test-key');
    expect(getCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('should return null if no API key is stored', async () => {
    getCredentialsMock.mockResolvedValue(null);
    const apiKey = await loadApiKey();
    expect(apiKey).toBeNull();
    expect(getCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('should save an API key', async () => {
    await saveApiKey('new-key');
    expect(setCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'default-api-key',
        token: expect.objectContaining({
          accessToken: 'new-key',
          tokenType: 'ApiKey',
        }),
      }),
    );
  });

  it('should clear an API key when saving empty key', async () => {
    await saveApiKey('');
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    expect(setCredentialsMock).not.toHaveBeenCalled();
  });

  it('should clear an API key when saving null key', async () => {
    await saveApiKey(null);
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    expect(setCredentialsMock).not.toHaveBeenCalled();
  });

  it('should clear an API key', async () => {
    await clearApiKey();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('should not throw when clearing an API key fails', async () => {
    deleteCredentialsMock.mockRejectedValueOnce(new Error('Failed to delete'));
    await expect(saveApiKey('')).resolves.not.toThrow();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });
});
