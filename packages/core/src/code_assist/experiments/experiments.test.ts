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
vi.mock('node:fs/promises');
vi.mock('../../config/storage.js', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn(),
  },
}));

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
  it('should return empty experiments if server is undefined', async () => {
    const { getExperiments } = await import('./experiments.js');
    const experiments = await getExperiments(undefined);

    expect(experiments.flags).toEqual({});
    expect(experiments.experimentIds).toEqual([]);
    expect(getClientMetadata).not.toHaveBeenCalled();
  });
});

describe('local experiments', () => {
  let mockServer: CodeAssistServer;

  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_LOCAL_EXP'] = 'true';

    vi.mocked(getClientMetadata).mockResolvedValue({
      ideName: 'GEMINI_CLI',
      ideVersion: '1.0.0',
      platform: 'LINUX_AMD64',
      updateChannel: 'stable',
    });

    mockServer = {
      listExperiments: vi.fn(),
    } as unknown as CodeAssistServer;
  });

  afterEach(() => {
    delete process.env['GEMINI_LOCAL_EXP'];
    vi.clearAllMocks();
  });

  it('should read experiments from file when GEMINI_LOCAL_EXP is true and file exists', async () => {
    const { getExperiments } = await import('./experiments.js');
    const { Storage } = await import('../../config/storage.js');
    const fs = await import('node:fs/promises');

    const mockLocalResponse: ListExperimentsResponse = {
      flags: [{ flagId: 999, boolValue: true }],
      experimentIds: [999],
    };

    vi.spyOn(Storage, 'getGlobalGeminiDir').mockReturnValue('/mock/gemini/dir');
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockLocalResponse));

    const experiments = await getExperiments(mockServer);

    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('experiments.json'),
      'utf8',
    );
    expect(mockServer.listExperiments).not.toHaveBeenCalled();
    expect(experiments.flags['999']).toBeDefined();
    expect(experiments.experimentIds).toEqual([999]);
  });

  it('should fallback to server when file reading fails', async () => {
    const { getExperiments } = await import('./experiments.js');
    const { Storage } = await import('../../config/storage.js');
    const fs = await import('node:fs/promises');

    vi.spyOn(Storage, 'getGlobalGeminiDir').mockReturnValue('/mock/gemini/dir');
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

    const mockServerResponse: ListExperimentsResponse = {
      flags: [{ flagId: 123, boolValue: true }],
      experimentIds: [123],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockServerResponse);

    const experiments = await getExperiments(mockServer);

    expect(fs.readFile).toHaveBeenCalled();
    expect(mockServer.listExperiments).toHaveBeenCalled();
    expect(experiments.flags['123']).toBeDefined();
  });
  it('should read experiments from file even if server is undefined', async () => {
    const { getExperiments } = await import('./experiments.js');
    const { Storage } = await import('../../config/storage.js');
    const fs = await import('node:fs/promises');

    const mockLocalResponse: ListExperimentsResponse = {
      flags: [{ flagId: 888, boolValue: true }],
      experimentIds: [888],
    };

    vi.spyOn(Storage, 'getGlobalGeminiDir').mockReturnValue('/mock/gemini/dir');
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockLocalResponse));

    const experiments = await getExperiments(undefined);

    expect(fs.readFile).toHaveBeenCalled();
    expect(experiments.flags['888']).toBeDefined();
  });

  it('should support snake_case keys in local experiments file', async () => {
    const { getExperiments } = await import('./experiments.js');
    const { Storage } = await import('../../config/storage.js');
    const fs = await import('node:fs/promises');

    const mockLocalResponse = {
      flags: [
        {
          flag_id: 777,
          bool_value: true,
        },
        {
          flag_id: 888,
          string_value: 'snake_case_value',
        },
      ],
      experiment_ids: [777, 888],
    };

    vi.spyOn(Storage, 'getGlobalGeminiDir').mockReturnValue('/mock/gemini/dir');
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockLocalResponse));

    const experiments = await getExperiments(undefined);

    expect(experiments.flags['777']).toBeDefined();
    expect(experiments.flags['777'].boolValue).toBe(true);
    expect(experiments.flags['888']).toBeDefined();
    expect(experiments.flags['888'].stringValue).toBe('snake_case_value');
    expect(experiments.experimentIds).toEqual([777, 888]);
  });
});
