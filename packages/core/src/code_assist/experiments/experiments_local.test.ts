/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CodeAssistServer } from '../server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import type { ListExperimentsResponse } from './types.js';
import type { ClientMetadata } from '../types.js';

// Mock dependencies
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
  readFileSync: vi.fn(),
}));
vi.mock('node:os');
vi.mock('../server.js');
vi.mock('./client_metadata.js', () => ({
  getClientMetadata: vi.fn(),
}));

describe('experiments with GEMINI_EXP', () => {
  let mockServer: CodeAssistServer;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env['GEMINI_EXP'] = ''; // Clear env var

    // Default mocks
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    mockServer = {
      listExperiments: vi.fn(),
    } as unknown as CodeAssistServer;
  });

  afterEach(() => {
    delete process.env['GEMINI_EXP'];
  });

  it('should read experiments from local file if GEMINI_EXP is set', async () => {
    process.env['GEMINI_EXP'] = '/tmp/experiments.json';
    const mockFileContent = JSON.stringify({
      flags: [{ flagId: 111, boolValue: true }],
      experimentIds: [999],
    });
    vi.mocked(fs.promises.readFile).mockResolvedValue(mockFileContent);

    const { getExperiments } = await import('./experiments.js');
    const experiments = await getExperiments(mockServer);

    expect(fs.promises.readFile).toHaveBeenCalledWith(
      '/tmp/experiments.json',
      'utf8',
    );
    expect(experiments.flags[111]).toEqual({
      flagId: 111,
      boolValue: true,
    });
    expect(experiments.experimentIds).toEqual([999]);
    expect(mockServer.listExperiments).not.toHaveBeenCalled();
  });

  it('should fall back to server if reading file fails', async () => {
    process.env['GEMINI_EXP'] = '/tmp/missing.json';
    vi.mocked(fs.promises.readFile).mockRejectedValue(
      new Error('File not found'),
    );

    // Mock server response
    const mockApiResponse = {
      flags: [{ flagId: 222, boolValue: true }],
      experimentIds: [111],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(
      mockApiResponse as ListExperimentsResponse,
    );
    const { getClientMetadata } = await import('./client_metadata.js');
    vi.mocked(getClientMetadata).mockResolvedValue(
      {} as unknown as ClientMetadata,
    );

    const { getExperiments } = await import('./experiments.js');
    const experiments = await getExperiments(mockServer);

    expect(experiments.flags[222]).toBeDefined();
    expect(mockServer.listExperiments).toHaveBeenCalled();
  });

  it('should work without server if file read succeeds', async () => {
    process.env['GEMINI_EXP'] = '/tmp/experiments.json';
    const mockFileContent = JSON.stringify({
      flags: [{ flagId: 333, boolValue: true }],
      experimentIds: [999],
    });
    vi.mocked(fs.promises.readFile).mockResolvedValue(mockFileContent);

    const { getExperiments } = await import('./experiments.js');
    const experiments = await getExperiments(undefined);

    expect(experiments.flags[333]).toEqual({
      flagId: 333,
      boolValue: true,
    });
  });

  it('should return empty if no server and no GEMINI_EXP', async () => {
    const { getExperiments } = await import('./experiments.js');
    const experiments = await getExperiments(undefined);
    expect(experiments.flags).toEqual({});
    expect(experiments.experimentIds).toEqual([]);
  });

  it('should fallback to server if file has invalid structure', async () => {
    process.env['GEMINI_EXP'] = '/tmp/invalid.json';
    const mockFileContent = JSON.stringify({
      flags: 'invalid-flags-type', // Should be array
      experimentIds: 123, // Should be array
    });
    vi.mocked(fs.promises.readFile).mockResolvedValue(mockFileContent);

    // Mock server response
    const mockApiResponse = {
      flags: [{ flagId: 444, boolValue: true }],
      experimentIds: [555],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(
      mockApiResponse as ListExperimentsResponse,
    );
    const { getClientMetadata } = await import('./client_metadata.js');
    vi.mocked(getClientMetadata).mockResolvedValue(
      {} as unknown as ClientMetadata,
    );

    const { getExperiments } = await import('./experiments.js');
    const experiments = await getExperiments(mockServer);

    expect(experiments.flags[444]).toBeDefined();
    expect(mockServer.listExperiments).toHaveBeenCalled();
  });
});
