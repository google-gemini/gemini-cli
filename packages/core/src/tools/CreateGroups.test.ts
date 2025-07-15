/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { CreateRepositoryGroupTool } from '../tools/CreateGroups.js'; 

// Mock the Gaxios class and uuid
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-v4',
}));


describe('CreateRepositoryGroupTool', () => {
  let tool: CreateRepositoryGroupTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    indexId: 'my-parent-index',
    repositoryGroupId: 'my-new-group',
    location: 'us-central1',
    projectId: 'test-project',
    repositories: [{ resource: 'repo-c', branchPattern: 'develop' }],
  };

  const mockOperation = {
    name: 'operations/create-group-123',
    done: false,
  };


  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new CreateRepositoryGroupTool(mockConfig);

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
    test('should initiate repository group creation successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = {
        data: mockOperation,
        status: 200,
      };
      const requestSpy = vi
        .spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(
        'Successfully initiated creation for RepositoryGroup "my-new-group". Operation: operations/create-group-123'
      );
      expect(result.llmContent).toContain('Operation: operations/create-group-123');
      expect(result.operation?.name).toBe(mockOperation.name);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.method).toBe('POST');
      expect(requestOptions?.data).toEqual({ repositories: validParams.repositories });
    });

    test('should include labels and a custom requestId when provided', async () => {
        const paramsWithExtras = {
            ...validParams,
            labels: { 'cost-center': '123' },
            requestId: '123e4567-e89b-12d3-a456-426614174000'
        };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: mockOperation } as GaxiosResponse);

        await tool.execute(paramsWithExtras);

        const requestOptions = requestSpy.mock.calls[0][0];
        const requestUrl = requestOptions?.url as string;
        expect(requestOptions?.data).toEqual({
            repositories: validParams.repositories,
            labels: { 'cost-center': '123' }
        });
        expect(requestUrl).toContain(`requestId=${paramsWithExtras.requestId}`);
    });
  });

  describe('Parameter Validation', () => {
    test.each([
      ['projectId', { ...validParams, projectId: ' ' }, "The 'projectId' parameter is required."],
      ['repositoryGroupId', { ...validParams, repositoryGroupId: undefined }, "The 'repositoryGroupId' parameter is required."],
      ['repositories array empty', { ...validParams, repositories: [] }, "The 'repositories' array cannot be empty."],
      ['repository missing resource', { ...validParams, repositories: [{ branchPattern: 'main' }] }, "Each repository must have a 'resource' and 'branchPattern'."],
      ['repository missing branchPattern', { ...validParams, repositories: [{ resource: 'a' }] }, "Each repository must have a 'resource' and 'branchPattern'."],
      ['invalid requestId', { ...validParams, requestId: 'not-a-uuid' }, 'requestId must be a valid UUID.'],
    ])('should return validation error for invalid params: %s', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
    });
  });


  describe('Error Handling Scenarios', () => {
    test('should handle 409 Conflict (Already Exists) error', async () => {
        const error = new Error('Request failed: ALREADY_EXISTS') as any;
        error.response = { status: 409 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe(`Error: RepositoryGroup "${validParams.repositoryGroupId}" already exists.`);
    });

    test('should handle 404 Not Found error for the parent index', async () => {
        const error = new Error('Request failed: NOT_FOUND') as any;
        error.response = { status: 404 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe(`Error: Parent Index "${validParams.indexId}" not found or API endpoint issue in staging.`);
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