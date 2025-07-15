/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { ListRepositoryGroupsTool } from '../tools/ListGroups.js';

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('ListRepositoryGroupsTool', () => {
  let tool: ListRepositoryGroupsTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    indexId: 'my-parent-index',
    location: 'us-central1',
    projectId: 'test-project',
  };

  const mockRepositoryGroups = [
      { name: 'group-1', repositories: [{ resource: 'repo-a' }] },
      { name: 'group-2', repositories: [{ resource: 'repo-b', branchPattern: 'main' }] },
  ];

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new ListRepositoryGroupsTool(mockConfig);

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
    test('should list repository groups successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = {
        data: { repositoryGroups: mockRepositoryGroups },
        status: 200,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe('Successfully listed 2 repository group(s) from staging.');
      expect(result.repositoryGroups).toHaveLength(2);
      expect(result.llmContent).toContain('Group 1:\n  Name: group-1');
      expect(result.llmContent).toContain('Resource: repo-b');
      expect(result.llmContent).toContain('Branch Pattern: main');
      expect(requestSpy).toHaveBeenCalledOnce();
    });

    test('should handle an empty list of groups', async () => {
        const mockApiResponse: Partial<GaxiosResponse> = {
            data: { repositoryGroups: [] },
            status: 200,
        };
        vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

        const result = await tool.execute(validParams);

        expect(result.returnDisplay).toBe('Successfully listed 0 repository group(s) from staging.');
        expect(result.llmContent).toContain('No repository groups found.');
    });

    test('should handle pagination', async () => {
        const mockResponse1: Partial<GaxiosResponse> = {
            data: { repositoryGroups: [mockRepositoryGroups[0]], nextPageToken: 'page2' },
            status: 200,
        };
        const mockResponse2: Partial<GaxiosResponse> = {
            data: { repositoryGroups: [mockRepositoryGroups[1]] },
            status: 200,
        };

        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request')
            .mockResolvedValueOnce(mockResponse1 as GaxiosResponse)
            .mockResolvedValueOnce(mockResponse2 as GaxiosResponse);

        const result = await tool.execute(validParams);

        expect(result.repositoryGroups).toHaveLength(2);
        expect(result.returnDisplay).toBe('Successfully listed 2 repository group(s) from staging.');
        expect(requestSpy).toHaveBeenCalledTimes(2);
        // Check that the second request was called with the page token
        const secondCallUrl = requestSpy.mock.calls[1][0]?.url as string;
        expect(secondCallUrl).toContain('pageToken=page2');
    });

    test('should include filter and orderBy parameters in the request', async () => {
        const params = { ...validParams, filter: 'labels.env="prod"', orderBy: 'createTime desc' };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: {} } as GaxiosResponse);

        await tool.execute(params);

        const requestUrl = requestSpy.mock.calls[0][0]?.url as string;
        expect(requestUrl).toContain('filter=labels.env%3D%22prod%22'); // URL encoded
        expect(requestUrl).toContain('orderBy=createTime+desc'); // URL encoded
    });
  });

  describe('Error Handling Scenarios', () => {
    test.each([
      ['projectId', { ...validParams, projectId: '' }],
      ['location', { ...validParams, location: ' ' }],
      ['indexId', { ...validParams, indexId: undefined }],
    ])('should return validation error if %s is missing', async (_, params) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe('Error: Project ID, Location, and Index ID must be provided.');
    });

    test('should handle 404 Not Found error for the parent index', async () => {
      const error = new Error('Request failed with 404: NOT_FOUND') as any;
      error.response = { status: 404 };
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(`Error: Parent Index "${validParams.indexId}" not found or API endpoint issue in staging.`);
    });

    test('should handle 403 Permission Denied error', async () => {
        const error = new Error('Permission Denied: PERMISSION_DENIED') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);

        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.repositoryGroups.list) on the project.');
    });

    test('should handle authentication errors', async () => {
        vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
            getAccessToken: vi.fn().mockResolvedValue({ token: null })
        });

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe('Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login` to authenticate.');
    });
  });
});