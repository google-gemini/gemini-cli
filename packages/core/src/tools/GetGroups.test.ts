/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { GetRepositoryGroupTool } from '../tools/GetGroups.js'; 

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('GetRepositoryGroupTool', () => {
  let tool: GetRepositoryGroupTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    indexId: 'my-parent-index',
    repositoryGroupId: 'my-repo-group',
    location: 'us-central1',
    projectId: 'test-project',
  };

  const mockRepositoryGroup = {
      name: 'projects/test-project/locations/us-central1/codeRepositoryIndexes/my-parent-index/repositoryGroups/my-repo-group',
      createTime: '2025-01-01T12:00:00Z',
      updateTime: '2025-01-01T13:00:00Z',
      labels: { team: 'backend' },
      repositories: [
          { resource: 'repo-a', branchPattern: 'main', repositoryUri: 'http://example.com/a' }
      ]
  };


  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new GetRepositoryGroupTool(mockConfig);

    mockGaxiosInstance = new (Gaxios as any)();
    (tool as any).client = mockGaxiosInstance;

    // Mock the auth process
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
    test('should get and format repository group details successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = {
        data: mockRepositoryGroup,
        status: 200,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Successfully retrieved details for Repository Group "my-repo-group".'
      );
      expect(result.llmContent).toContain('Name: ' + mockRepositoryGroup.name);
      expect(result.llmContent).toContain('Labels: \n    team: backend');
      expect(result.llmContent).toContain('Resource: repo-a');
      expect(result.llmContent).toContain('Repo URI: http://example.com/a');
      expect(result.repositoryGroup?.name).toBe(mockRepositoryGroup.name);
      expect(requestSpy).toHaveBeenCalledOnce();
    });

    test('should handle a group with no repositories', async () => {
        const groupWithNoRepos = { ...mockRepositoryGroup, repositories: [] };
        const mockApiResponse: Partial<GaxiosResponse> = { data: groupWithNoRepos, status: 200 };
        vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

        const result = await tool.execute(validParams);

        expect(result.llmContent).toContain('Repositories: None');
    });

    test('should use the production API endpoint when specified', async () => {
      const params = { ...validParams, environment: 'prod' as const };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue({ data: {} } as GaxiosResponse);

      await tool.execute(params);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.url).toContain('https://cloudaicompanion.googleapis.com');
    });
  });

  describe('Error Handling Scenarios', () => {
    test.each([
      ['indexId', { ...validParams, indexId: '' }, "The 'indexId' parameter is required."],
      ['repositoryGroupId', { ...validParams, repositoryGroupId: ' ' }, "The 'repositoryGroupId' parameter is required."],
      ['location', { ...validParams, location: undefined }, "The 'location' parameter is required."],
      ['projectId', { ...validParams, projectId: null }, "The 'projectId' parameter is required."],
    ])('should return validation error if %s is invalid', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
        expect(result.llmContent).toContain(`Invalid Parameters: ${expectedError}`);
    });

    test('should handle 404 Not Found error', async () => {
      const error = new Error('Request failed with status code 404') as any;
      error.response = { status: 404 };
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        `Error: RepositoryGroup "${validParams.repositoryGroupId}" not found under index "${validParams.indexId}" in staging.`
      );
    });

    test('should handle 403 Permission Denied error', async () => {
        const error = new Error('The caller does not have permission: PERMISSION_DENIED') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);

        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.repositoryGroups.get) on the project.');
    });

    test('should handle authentication errors', async () => {
      vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      });

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.'
      );
    });
  });
});