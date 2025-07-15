/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { GetCRITool } from '../tools/GetCRI.js';

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('GetCRITool', () => {
  let tool: GetCRITool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    indexId: 'my-test-index',
    location: 'us-central1',
    projectId: 'test-project',
  };

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new GetCRITool(mockConfig);

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
    test('should get and format index details successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = {
        data: {
          name: `projects/test-project/locations/us-central1/codeRepositoryIndexes/my-test-index`,
          state: 'ACTIVE',
          createTime: '2025-01-01T12:00:00Z',
          updateTime: '2025-01-01T13:00:00Z',
          labels: { env: 'testing', owner: 'dev-team' },
          etag: 'v1',
        },
        status: 200,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Successfully retrieved details for index "my-test-index".'
      );
      expect(result.llmContent).toContain('Name: projects/test-project/locations/us-central1/codeRepositoryIndexes/my-test-index');
      expect(result.llmContent).toContain('State: ACTIVE');
      expect(result.llmContent).toContain('Labels: \n    env: testing\n    owner: dev-team');
      expect(result.index?.name).toBe('projects/test-project/locations/us-central1/codeRepositoryIndexes/my-test-index');
      expect(requestSpy).toHaveBeenCalledOnce();
    });

    test('should handle an index with no labels', async () => {
        const mockApiResponse: Partial<GaxiosResponse> = {
          data: {
            name: `projects/test-project/locations/us-central1/codeRepositoryIndexes/my-test-index`,
            state: 'ACTIVE',
          },
          status: 200,
        };
        vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

        const result = await tool.execute(validParams);

        expect(result.llmContent).toContain('Labels: N/A');
    });

    test('should use the production API endpoint when specified', async () => {
      const params = { ...validParams, environment: 'prod' as const };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue({ data: {} } as GaxiosResponse);

      await tool.execute(params);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.url).toContain('https://cloudaicompanion.googleapis.com');
      expect(requestOptions?.url).not.toContain('staging');
    });
  });

  describe('Error Handling Scenarios', () => {
    test.each([
      ['indexId', { ...validParams, indexId: '' }, "The 'indexId' parameter cannot be empty."],
      ['location', { ...validParams, location: ' ' }, "The 'location' parameter cannot be empty."],
      ['projectId', { ...validParams, projectId: undefined }, "The 'projectId' parameter cannot be empty."],
    ])('should return validation error if %s is invalid', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
        expect(result.llmContent).toContain(`Error: Invalid parameters provided. Reason: ${expectedError}`);
    });

    test('should handle 404 Not Found error', async () => {
      // FIX: The error message now includes "404", which the tool's code looks for.
      const error = new Error('Request failed with status code 404') as any;
      error.response = { status: 404 };
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Error: Index "my-test-index" not found in project "test-project" location "us-central1" on staging environment.'
      );
      expect(result.llmContent).toContain('Error getting index "my-test-index"');
    });

    test('should handle 403 Permission Denied error', async () => {
        // FIX: The error message now includes "PERMISSION_DENIED", which the tool's code looks for.
        const error = new Error('The caller does not have permission: PERMISSION_DENIED') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);

        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the necessary IAM roles (e.g., cloudaicompanion.codeRepositoryIndexes.get) on the project.');
    });

    test('should handle authentication errors', async () => {
      vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      });

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.'
      );
      expect(result.llmContent).toContain('Failed to retrieve access token');
    });

    test('should handle a generic API request failure', async () => {
        const error = new Error('API request failed with status 500: Internal Server Error {}') as any;
        error.response = { status: 500, statusText: 'Internal Server Error', data: {} };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);

        expect(result.returnDisplay).toContain('Error: API request failed with status 500');
    });
  });
});