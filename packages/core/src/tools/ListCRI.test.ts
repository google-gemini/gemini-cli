/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { ListCRITool } from '../tools/ListCRI.js';

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('ListCRITool', () => {
  let tool: ListCRITool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  beforeEach(() => {
    mockConfig = {} as Config; // Keep it simple if no methods are called
    tool = new ListCRITool(mockConfig);

    // Get the mocked instance of Gaxios
    mockGaxiosInstance = new (Gaxios as any)();
    (tool as any).client = mockGaxiosInstance;

    // Mock the auth process to avoid actual Google Auth calls
    const mockAuth = {
      getClient: vi.fn().mockResolvedValue({
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ token: 'fake-access-token' }),
      }),
    };
    (tool as any).auth = mockAuth;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Execution Scenarios', () => {
    test('should list indexes and groups successfully', async () => {
      const params = { projectId: 'test-project', location: 'us-central1' };
      const mockIndexesResponse: Partial<GaxiosResponse> = {
        data: {
          codeRepositoryIndexes: [
            {
              name: 'projects/test-project/locations/us-central1/codeRepositoryIndexes/index1',
              state: 'ACTIVE',
            },
          ],
        },
        status: 200,
      };
      const mockGroupsResponse: Partial<GaxiosResponse> = {
        data: {
          repositoryGroups: [
            {
              name: 'projects/test-project/locations/us-central1/codeRepositoryIndexes/index1/repositoryGroups/group1',
              repositories: [{ resource: 'repo1' }],
            },
          ],
        },
        status: 200,
      };

      vi.spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValueOnce(mockIndexesResponse as GaxiosResponse)
        .mockResolvedValueOnce(mockGroupsResponse as GaxiosResponse);

      const result = await tool.execute(params);

      expect(result.llmContent).toContain('Index 1:');
      expect(result.llmContent).toContain(
        'Name: projects/test-project/locations/us-central1/codeRepositoryIndexes/index1',
      );
      expect(result.llmContent).toContain('State: ACTIVE');
      expect(result.llmContent).toContain('Groups (1):');
      expect(result.llmContent).toContain(
        'Group 1: projects/test-project/locations/us-central1/codeRepositoryIndexes/index1/repositoryGroups/group1',
      );
      expect(result.returnDisplay).toBe(
        'Successfully listed 1 index(es) from staging. Fetched group details.',
      );
      expect(result.indexesWithGroups).toHaveLength(1);
      expect(result.indexesWithGroups?.[0].groups).toHaveLength(1);
    });

    test('should list only indexes when listGroups is false', async () => {
      const params = {
        projectId: 'test-project',
        location: 'us-central1',
        listGroups: false,
      };
      const mockIndexesResponse: Partial<GaxiosResponse> = {
        data: {
          codeRepositoryIndexes: [
            {
              name: 'projects/test-project/locations/us-central1/codeRepositoryIndexes/index1',
              state: 'ACTIVE',
            },
          ],
        },
        status: 200,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue(mockIndexesResponse as GaxiosResponse);

      const result = await tool.execute(params);

      expect(result.llmContent).toContain('Index 1:');
      expect(result.llmContent).not.toContain('Groups');
      expect(result.returnDisplay).toBe(
        'Successfully listed 1 index(es) from staging.',
      );
      expect(result.indexesWithGroups).toHaveLength(1);
      expect(result.indexesWithGroups?.[0].groups).toEqual([]);
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });

    test('should handle pagination for indexes', async () => {
      const params = {
        projectId: 'test-project',
        location: 'us-central1',
        listGroups: false,
      };
      const mockResponse1: Partial<GaxiosResponse> = {
        data: {
          codeRepositoryIndexes: [{ name: 'index1', state: 'ACTIVE' }],
          nextPageToken: 'page2',
        },
        status: 200,
      };
      const mockResponse2: Partial<GaxiosResponse> = {
        data: {
          codeRepositoryIndexes: [{ name: 'index2', state: 'ACTIVE' }],
        },
        status: 200,
      };

      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValueOnce(mockResponse1 as GaxiosResponse)
        .mockResolvedValueOnce(mockResponse2 as GaxiosResponse);

      const result = await tool.execute(params);
      expect(result.indexesWithGroups).toHaveLength(2);
      expect(result.returnDisplay).toContain('Successfully listed 2 index(es)');
      expect(requestSpy).toHaveBeenCalledTimes(2);
    });

    test('should handle pagination for groups', async () => {
      const params = { projectId: 'test-project', location: 'us-central1' };
      const mockIndexesResponse: Partial<GaxiosResponse> = {
        data: {
          codeRepositoryIndexes: [
            { name: 'projects/p/l/i/index1', state: 'ACTIVE' },
          ],
        },
        status: 200,
      };
      const mockGroupsResponse1: Partial<GaxiosResponse> = {
        data: {
          repositoryGroups: [{ name: 'group1' }],
          nextPageToken: 'page2',
        },
        status: 200,
      };
      const mockGroupsResponse2: Partial<GaxiosResponse> = {
        data: { repositoryGroups: [{ name: 'group2' }] },
        status: 200,
      };

      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValueOnce(mockIndexesResponse as GaxiosResponse)
        .mockResolvedValueOnce(mockGroupsResponse1 as GaxiosResponse)
        .mockResolvedValueOnce(mockGroupsResponse2 as GaxiosResponse);

      const result = await tool.execute(params);

      expect(result.indexesWithGroups).toHaveLength(1);
      expect(result.indexesWithGroups?.[0].groups).toHaveLength(2);
      expect(result.llmContent).toContain('Groups (2):');
      expect(requestSpy).toHaveBeenCalledTimes(3);
    });

    test('should handle an empty list of indexes', async () => {
      const params = { projectId: 'test-project', location: 'us-central1' };
      const mockIndexesResponse: Partial<GaxiosResponse> = {
        data: { codeRepositoryIndexes: [] },
        status: 200,
      };
      vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(
        mockIndexesResponse as GaxiosResponse,
      );

      const result = await tool.execute(params);
      expect(result.llmContent).toBe('No code repository indexes found.');
      expect(result.returnDisplay).toBe(
        'Successfully listed 0 index(es) from staging. Fetched group details.',
      );
    });

    test('should handle an index with no groups', async () => {
      const params = { projectId: 'test-project', location: 'us-central1' };
      const mockIndexesResponse: Partial<GaxiosResponse> = {
        data: { codeRepositoryIndexes: [{ name: 'index1', state: 'ACTIVE' }] },
        status: 200,
      };
      const mockGroupsResponse: Partial<GaxiosResponse> = {
        data: { repositoryGroups: [] },
        status: 200,
      };

      vi.spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValueOnce(mockIndexesResponse as GaxiosResponse)
        .mockResolvedValueOnce(mockGroupsResponse as GaxiosResponse);

      const result = await tool.execute(params);
      expect(result.llmContent).toContain('Groups (0): None');
      expect(result.indexesWithGroups?.[0].groups).toEqual([]);
    });

    test('should use the production API endpoint when specified', async () => {
      const params = {
        projectId: 'test-project',
        location: 'us-central1',
        environment: 'prod' as const,
        listGroups: false,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue({ data: {} } as GaxiosResponse);

      await tool.execute(params);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.url).toContain(
        'https://cloudaicompanion.googleapis.com',
      );
      expect(requestOptions?.url).not.toContain('staging');
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should return an error if projectId is missing', async () => {
      const params = { location: 'us-central1' } as any;
      const result = await tool.execute(params);
      expect(result.llmContent).toBe('Project ID and Location are required.');
      expect(result.returnDisplay).toBe(
        'Error: Project ID and Location must be provided.',
      );
    });

    test('should return an error if location is missing', async () => {
      const params = { projectId: 'test-project' } as any;
      const result = await tool.execute(params);
      expect(result.llmContent).toBe('Project ID and Location are required.');
      expect(result.returnDisplay).toBe(
        'Error: Project ID and Location must be provided.',
      );
    });

    test('should handle API errors when listing indexes (e.g., 403 Forbidden)', async () => {
      const params = { projectId: 'test-project', location: 'us-central1' };
      const error = new Error('Permission denied') as any;
      error.response = {
        status: 403,
        data: { error: { message: 'PERMISSION_DENIED' } },
      };
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute(params);
      expect(result.llmContent).toContain('Error listing resources');
      expect(result.returnDisplay).toBe(
        'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.codeRepositoryIndexes.list and cloudaicompanion.repositoryGroups.list) on the project.',
      );
    });

    test('should handle API errors when listing groups', async () => {
      const params = { projectId: 'test-project', location: 'us-central1' };
      const mockIndexesResponse: Partial<GaxiosResponse> = {
        data: {
          codeRepositoryIndexes: [
            { name: 'projects/p/l/i/index1', state: 'ACTIVE' },
            { name: 'projects/p/l/i/index2', state: 'ACTIVE' },
          ],
        },
        status: 200,
      };
      const groupError = new Error('Not Found') as any;
      groupError.response = { status: 404 };
      const mockGoodGroupsResponse: Partial<GaxiosResponse> = {
        data: { repositoryGroups: [{ name: 'good-group' }] },
        status: 200,
      };

      vi.spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValueOnce(mockIndexesResponse as GaxiosResponse)
        .mockRejectedValueOnce(groupError)
        .mockResolvedValueOnce(mockGoodGroupsResponse as GaxiosResponse);

      const result = await tool.execute(params);
      expect(result.indexesWithGroups).toHaveLength(2);
      // Check index1 for error
      expect(result.indexesWithGroups?.[0].groupsError).toContain(
        'API call to https://staging-cloudaicompanion.sandbox.googleapis.com/v1/projects/p/l/i/index1/repositoryGroups',
      );
      expect(result.llmContent).toContain('Groups Error:');
      // Check index2 for success
      expect(result.indexesWithGroups?.[1].groups).toHaveLength(1);
      expect(result.indexesWithGroups?.[1].groupsError).toBeUndefined();
      expect(result.llmContent).toContain('Groups (1):');
    });

    test('should handle authentication errors', async () => {
      vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      });

      const params = { projectId: 'test-project', location: 'us-central1' };
      const result = await tool.execute(params);

      expect(result.llmContent).toContain('Failed to retrieve access token.');
      expect(result.returnDisplay).toBe(
        'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.',
      );
    });
  });
});
