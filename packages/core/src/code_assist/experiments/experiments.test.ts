/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CodeAssistServer } from '../server.js';
import { getClientMetadata } from './client_metadata.js';
import type { ListExperimentsResponse, Flag } from './types.js';

// Mock dependencies before importing the module under test
vi.mock('../server.js');
vi.mock('./client_metadata.js');

describe('experiments', () => {
  let mockServer: CodeAssistServer;

  beforeEach(() => {
    // Reset modules to clear the cached `experimentsPromise`
    vi.resetModules();

    // Mock the dependencies that `getExperiments` relies on
    vi.mocked(getClientMetadata).mockResolvedValue({
      ideName: 'GEMINI_CLI',
      ideVersion: '1.0.0',
      platform: 'LINUX_AMD64',
      updateChannel: 'stable',
    });

    // Create a mock instance of the server for each test
    mockServer = {
      listExperiments: vi.fn(),
    } as unknown as CodeAssistServer;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and parse experiments from the server', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {
      flags: [
        { flagId: 234, boolValue: true },
        { flagId: 345, stringValue: 'value' },
      ],
      experimentIds: [123, 456],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const experiments = await getExperiments(mockServer);

    // Verify that the dependencies were called
    expect(getClientMetadata).toHaveBeenCalled();
    expect(mockServer.listExperiments).toHaveBeenCalledWith(
      await getClientMetadata(),
    );

    // Verify that the response was parsed correctly
    expect(experiments.flags[234]).toEqual({
      flagId: 234,
      boolValue: true,
    });
    expect(experiments.flags[345]).toEqual({
      flagId: 345,
      stringValue: 'value',
    });
    expect(experiments.experimentIds).toEqual([123, 456]);
  });

  it('should handle an empty or partial response from the server', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {}; // No flags or experimentIds
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const experiments = await getExperiments(mockServer);

    expect(experiments.flags).toEqual({});
    expect(experiments.experimentIds).toEqual([]);
  });

  it('should ignore flags that are missing a name', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {
      flags: [
        { boolValue: true } as Flag, // No name
        { flagId: 256, stringValue: 'value' },
      ],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const experiments = await getExperiments(mockServer);

    expect(Object.keys(experiments.flags)).toHaveLength(1);
    expect(experiments.flags[256]).toBeDefined();
    expect(experiments.flags['undefined']).toBeUndefined();
  });

  it('should cache the experiments promise to avoid multiple fetches', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {
      experimentIds: [1, 2, 3],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const firstCall = await getExperiments(mockServer);
    const secondCall = await getExperiments(mockServer);

    expect(firstCall).toBe(secondCall); // Should be the exact same promise object
    // Verify the underlying functions were only called once
    expect(getClientMetadata).toHaveBeenCalledTimes(1);
    expect(mockServer.listExperiments).toHaveBeenCalledTimes(1);
  });
});
