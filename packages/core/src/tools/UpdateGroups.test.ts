/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { UpdateRepositoryGroupTool } from '../tools/UpdateGroups.js'; 

// Mock the Gaxios class and uuid
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-v4',
}));


describe('UpdateRepositoryGroupTool', () => {
  let tool: UpdateRepositoryGroupTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validBaseParams = {
    indexId: 'my-index',
    repositoryGroupId: 'my-group',
    location: 'us-central1',
    projectId: 'test-project',
  };

  const mockCurrentGroup = {
    name: `projects/test-project/locations/us-central1/codeRepositoryIndexes/my-index/repositoryGroups/my-group`,
    labels: { existing: 'label', to_remove: 'true' },
    repositories: [
        { resource: 'repo-a', branchPattern: 'main' },
        { resource: 'repo-to-remove', branchPattern: 'main' }
    ],
  };

  const mockOperation = {
    name: 'operations/update-group-789',
    done: false,
  };

  // Helper to mock the two-step (GET, then PATCH) process
  const mockGetThenPatch = () => {
    return vi.spyOn(mockGaxiosInstance, 'request')
        // First call is GET to fetch current state
        .mockResolvedValueOnce({ data: mockCurrentGroup } as GaxiosResponse)
        // Second call is PATCH to update
        .mockResolvedValueOnce({ data: mockOperation } as GaxiosResponse);
  }

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new UpdateRepositoryGroupTool(mockConfig);

    mockGaxiosInstance = new (Gaxios as any)();
    (tool as any).client = mockGaxiosInstance;

    const mockAuth = {
      getClient: vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'fake-access-token' }),
      }),
    };
    (tool as any).auth = mockAuth;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Execution Scenarios', () => {
    test('should update labels with updateLabels', async () => {
      const params = { ...validBaseParams, updateLabels: { new: 'label', existing: 'updated' } };
      const requestSpy = mockGetThenPatch();

      const result = await tool.execute(params);
      expect(result.returnDisplay).toContain('Successfully initiated update');

      const patchRequest = requestSpy.mock.calls[1][0];
      const patchUrl = new URL(patchRequest?.url as string);

      expect(patchUrl.searchParams.get('updateMask')).toBe('labels');
      expect(patchRequest?.data.labels).toEqual({ existing: 'updated', to_remove: 'true', new: 'label' });
    });

    test('should add repositories with addRepositories', async () => {
        const params = { ...validBaseParams, addRepositories: [{ resource: 'repo-c', branchPattern: 'dev' }] };
        const requestSpy = mockGetThenPatch();

        const result = await tool.execute(params);
        expect(result.returnDisplay).toContain('Successfully initiated update');

        const patchRequest = requestSpy.mock.calls[1][0];
        const patchUrl = new URL(patchRequest?.url as string);

        expect(patchUrl.searchParams.get('updateMask')).toBe('repositories');
        expect(patchRequest?.data.repositories).toHaveLength(3);
        expect(patchRequest?.data.repositories).toContainEqual({ resource: 'repo-c', branchPattern: 'dev' });
    });

    test('should clear all repositories with clearRepositories', async () => {
        const params = { ...validBaseParams, clearRepositories: true };
        const requestSpy = mockGetThenPatch();

        await tool.execute(params);

        const patchRequest = requestSpy.mock.calls[1][0];
        expect(patchRequest?.data.repositories).toEqual([]);
        expect(new URL(patchRequest?.url as string).searchParams.get('updateMask')).toBe('repositories');
    });

    test('should remove specific repositories with removeRepositories', async () => {
        const params = { ...validBaseParams, removeRepositories: [{ resource: 'repo-to-remove' }] };
        const requestSpy = mockGetThenPatch();

        await tool.execute(params);

        const patchRequest = requestSpy.mock.calls[1][0];
        expect(patchRequest?.data.repositories).toHaveLength(1);
        expect(patchRequest?.data.repositories[0].resource).toBe('repo-a');
        expect(new URL(patchRequest?.url as string).searchParams.get('updateMask')).toBe('repositories');
    });

    test('should handle a combined update of labels and repositories', async () => {
        const params = {
            ...validBaseParams,
            updateLabels: { team: 'frontend' },
            removeRepositories: [{ resource: 'repo-to-remove' }]
        };
        const requestSpy = mockGetThenPatch();

        await tool.execute(params);

        const patchRequest = requestSpy.mock.calls[1][0];
        const updateMask = new URL(patchRequest?.url as string).searchParams.get('updateMask');
        expect(updateMask).toContain('labels');
        expect(updateMask).toContain('repositories');
        expect(patchRequest?.data.labels.team).toBe('frontend');
        expect(patchRequest?.data.repositories).toHaveLength(1);
    });
  });

  describe('Parameter Validation', () => {
    test.each([
      ['missing projectId', { ...validBaseParams, projectId: ' ', updateLabels: {a:'b'} }, "The 'projectId' is required."],
      ['too many label ops', { ...validBaseParams, setLabels: {}, clearLabels: true }, 'At most one label operation (set, update, clear, remove) can be specified.'],
      ['too many repo ops', { ...validBaseParams, setRepositories: [], clearRepositories: true }, 'At most one repository operation (set, add, clear, remove) can be specified.'],
      ['no ops', { ...validBaseParams }, 'At least one update operation for labels or repositories must be specified.'],
      ['invalid UUID', { ...validBaseParams, updateLabels: {}, requestId: 'not-a-uuid' }, 'The provided requestId is not a valid UUID.'],
    ])('should return validation error for %s', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should handle 404 on initial GET', async () => {
      const error = new Error('Request failed with 404') as any;
      error.response = { status: 404 };
      // Fail on the first (GET) call
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute({ ...validBaseParams, clearLabels: true });
      expect(result.returnDisplay).toBe(`Error: RepositoryGroup "${validBaseParams.repositoryGroupId}" not found.`);
    });

    test('should handle 403 on PATCH', async () => {
      const error = new Error('Permission Denied') as any;
      error.response = { status: 403 };
      // Succeed on GET, fail on PATCH
      mockGetThenPatch().mockReset()
        .mockResolvedValueOnce({ data: mockCurrentGroup } as GaxiosResponse)
        .mockRejectedValueOnce(error);

      const result = await tool.execute({ ...validBaseParams, setLabels: {} });
      expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the correct IAM roles (cloudaicompanion.repositoryGroups.update).');
    });

    test('should handle authentication failure', async () => {
        vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
            getAccessToken: vi.fn().mockResolvedValue({ token: null })
        });
        const result = await tool.execute({ ...validBaseParams, clearLabels: true });
        expect(result.returnDisplay).toBe('Error: Authentication failed. Please run `gcloud auth login`.');
    });
  });
});