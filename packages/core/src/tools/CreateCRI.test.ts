/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { CreateCRITool } from '../tools/CreateCRI.js'; 

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('CreateCRITool', () => {
  let tool: CreateCRITool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    indexId: 'my-new-index',
    location: 'us-central1',
    projectId: 'test-project',
  };

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new CreateCRITool(mockConfig);

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
    test('should initiate index creation successfully', async () => {
      const mockOperation = {
        name: 'operations/12345',
        done: false,
      };
      const mockApiResponse: Partial<GaxiosResponse> = {
        data: mockOperation,
        status: 200,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Successfully initiated creation for index "my-new-index". Operation: operations/12345'
      );
      expect(result.llmContent).toContain('Operation Name: operations/12345');
      expect(result.llmContent).toContain('Status: In Progress');
      expect(result.operation?.name).toBe('operations/12345');

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.method).toBe('POST');
      expect(requestOptions?.url).toContain(`codeRepositoryIndexId=${validParams.indexId}`);
      expect(requestOptions?.data).toEqual({}); // No optional params sent
    });

    test('should initiate creation with a displayName', async () => {
        const paramsWithDisplayName = { ...validParams, displayName: "My Test Index" };
        const mockOperation = { name: 'operations/12345', done: false };
        const mockApiResponse: Partial<GaxiosResponse> = { data: mockOperation, status: 200 };
        const requestSpy = vi
            .spyOn(mockGaxiosInstance, 'request')
            .mockResolvedValue(mockApiResponse as GaxiosResponse);

        await tool.execute(paramsWithDisplayName);

        const requestOptions = requestSpy.mock.calls[0][0];
        expect(requestOptions?.data).toEqual({ displayName: "My Test Index" });
    });

    test('should use the production API endpoint when specified', async () => {
      const params = { ...validParams, environment: 'prod' as const };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue({ data: { name: 'op', done: false } } as GaxiosResponse);

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

    test('should handle 409 Conflict (Already Exists) error', async () => {
      const error = new Error('Request failed with status code 409: ALREADY_EXISTS') as any;
      error.response = { status: 409 };
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Error: Index "my-new-index" already exists in project "test-project" location "us-central1" on staging environment.'
      );
      expect(result.llmContent).toContain('Error creating index "my-new-index"');
    });

    test('should handle 403 Permission Denied error', async () => {
        const error = new Error('The caller does not have permission: PERMISSION_DENIED') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);

        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the necessary IAM roles (e.g., cloudaicompanion.codeRepositoryIndexes.create) on the project.');
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
  });
});