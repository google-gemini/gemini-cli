/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  ExtensionRegistryClient,
  type RegistryExtension,
} from './extensionRegistryClient.js';
import { fetchWithTimeout } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', () => ({
  fetchWithTimeout: vi.fn(),
}));

const mockExtensions: RegistryExtension[] = [
  {
    id: 'ext1',
    rank: 1,
    url: 'https://github.com/test/ext1',
    fullName: 'test/ext1',
    repoDescription: 'Test extension 1',
    stars: 100,
    lastUpdated: '2025-01-01T00:00:00Z',
    extensionName: 'extension-one',
    extensionVersion: '1.0.0',
    extensionDescription: 'First test extension',
    avatarUrl: 'https://example.com/avatar1.png',
    hasMCP: true,
    hasContext: false,
    isGoogleOwned: false,
    licenseKey: 'mit',
    hasHooks: false,
    hasCustomCommands: false,
    hasSkills: false,
  },
  {
    id: 'ext2',
    rank: 2,
    url: 'https://github.com/test/ext2',
    fullName: 'test/ext2',
    repoDescription: 'Test extension 2',
    stars: 50,
    lastUpdated: '2025-01-02T00:00:00Z',
    extensionName: 'extension-two',
    extensionVersion: '0.5.0',
    extensionDescription: 'Second test extension',
    avatarUrl: 'https://example.com/avatar2.png',
    hasMCP: false,
    hasContext: true,
    isGoogleOwned: true,
    licenseKey: 'apache-2.0',
    hasHooks: false,
    hasCustomCommands: false,
    hasSkills: false,
  },
  {
    id: 'ext3',
    rank: 3,
    url: 'https://github.com/test/ext3',
    fullName: 'test/ext3',
    repoDescription: 'Test extension 3',
    stars: 10,
    lastUpdated: '2025-01-03T00:00:00Z',
    extensionName: 'extension-three',
    extensionVersion: '0.1.0',
    extensionDescription: 'Third test extension',
    avatarUrl: 'https://example.com/avatar3.png',
    hasMCP: true,
    hasContext: true,
    isGoogleOwned: false,
    licenseKey: 'gpl-3.0',
    hasHooks: false,
    hasCustomCommands: false,
    hasSkills: false,
  },
];

describe('ExtensionRegistryClient', () => {
  let client: ExtensionRegistryClient;
  let fetchMock: Mock;

  beforeEach(() => {
    ExtensionRegistryClient.resetCache();
    client = new ExtensionRegistryClient();
    fetchMock = fetchWithTimeout as Mock;
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch and return extensions with pagination (default ranking)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const result = await client.getExtensions(1, 2);
    expect(result.extensions).toHaveLength(2);
    expect(result.extensions[0].id).toBe('ext1'); // rank 1
    expect(result.extensions[1].id).toBe('ext2'); // rank 2
    expect(result.total).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://geminicli.com/extensions.json',
      10000,
    );
  });

  it('should return extensions sorted alphabetically', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const result = await client.getExtensions(1, 3, 'alphabetical');
    expect(result.extensions).toHaveLength(3);
    expect(result.extensions[0].id).toBe('ext1');
    expect(result.extensions[1].id).toBe('ext3');
    expect(result.extensions[2].id).toBe('ext2');
  });

  it('should return the second page of extensions', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const result = await client.getExtensions(2, 2);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].id).toBe('ext3');
    expect(result.total).toBe(3);
  });

  it('should search extensions by name', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const results = await client.searchExtensions('one');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('ext1');
  });

  it('should search extensions by description', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const results = await client.searchExtensions('Second');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('ext2');
  });

  it('should get an extension by ID', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const result = await client.getExtension('ext2');
    expect(result).toBeDefined();
    expect(result?.id).toBe('ext2');
  });

  it('should return undefined if extension not found', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const result = await client.getExtension('non-existent');
    expect(result).toBeUndefined();
  });

  it('should cache the fetch result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    await client.getExtensions();
    await client.getExtensions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should share the fetch result across instances', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockExtensions,
    });

    const client1 = new ExtensionRegistryClient();
    const client2 = new ExtensionRegistryClient();

    await client1.getExtensions();
    await client2.getExtensions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if fetch fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(client.getExtensions()).rejects.toThrow(
      'Failed to fetch extensions: Not Found',
    );
  });
});
