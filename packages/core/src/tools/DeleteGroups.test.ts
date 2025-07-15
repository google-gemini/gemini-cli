/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { DeleteRepositoryGroupTool } from '../tools/DeleteGroups.js'; 

// Mock the Gaxios class and uuid
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-v4',
}));


describe('DeleteRepositoryGroupTool', () => {
  let tool: DeleteRepositoryGroupTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    indexId: 'my-parent-index',
    repositoryGroupId: 'group-to-delete',
    location: 'us-central1',
    projectId: 'test-project',
  };

  const mockOperation = {
    name: 'operations/delete-group-456',
    done: false,
  };


  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new DeleteRepositoryGroupTool(mockConfig);

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
    test('should initiate repository group deletion successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = {
        data: mockOperation,
        status: 200,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Successfully initiated deletion for RepositoryGroup "group-to-delete". Operation: operations/delete-group-456'
      );
      expect(result.llmContent).toContain('Operation: operations/delete-group-456');
      expect(result.operation?.name).toBe(mockOperation.name);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.method).toBe('DELETE');
      expect(requestOptions?.url).toContain(`repositoryGroups/${validParams.repositoryGroupId}`);
    });

    test('should use a custom requestId when provided', async () => {
        const paramsWithId = { ...validParams, requestId: 'a1b2c3d4-e5f6-1234-a456-426614174000' };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: mockOperation } as GaxiosResponse);

        await tool.execute(paramsWithId);
        const requestUrl = requestSpy.mock.calls[0][0]?.url as string;
        expect(requestUrl).toContain(`requestId=${paramsWithId.requestId}`);
    });
  });

  describe('Parameter Validation', () => {
    test.each([
      ['projectId', { ...validParams, projectId: ' ' }, "The 'projectId' parameter is required."],
      ['indexId', { ...validParams, indexId: undefined }, "The 'indexId' parameter is required."],
      ['repositoryGroupId', { ...validParams, repositoryGroupId: '' }, "The 'repositoryGroupId' parameter is required."],
      ['invalid requestId', { ...validParams, requestId: 'not-a-valid-uuid' }, 'requestId must be a valid UUID.'],
    ])('should return validation error for invalid params: %s', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
    });
  });


  describe('Error Handling Scenarios', () => {
    test('should handle 404 Not Found error', async () => {
        const error = new Error('Request failed: NOT_FOUND') as any;
        error.response = { status: 404 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe(`Error: RepositoryGroup "${validParams.repositoryGroupId}" not found under index "${validParams.indexId}" in staging.`);
    });

    test('should handle 403 Permission Denied error', async () => {
        const error = new Error('Request failed: PERMISSION_DENIED') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.repositoryGroups.delete) on the project.');
    });

    test('should handle authentication errors', async () => {
        vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
            getAccessToken: vi.fn().mockResolvedValue({ token: null })
        });
        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toContain('Error: Authentication failed.');
    });
  });
});