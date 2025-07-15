/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { UpdateCRITool } from '../tools/UpdateCRI.js'; 

// Mock the Gaxios class and uuid
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-v4',
}));


describe('UpdateCRITool', () => {
  let tool: UpdateCRITool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validBaseParams = {
    indexId: 'my-updatable-index',
    location: 'us-central1',
    projectId: 'test-project',
  };

  const mockCurrentIndex = {
    name: `projects/test-project/locations/us-central1/codeRepositoryIndexes/my-updatable-index`,
    state: 'ACTIVE',
    labels: { existing: 'label', to_be_removed: 'true' },
  };

  const mockOperation = {
    name: 'operations/update-12345',
    done: false,
  };


  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new UpdateCRITool(mockConfig);

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
    // Helper to mock the two-step (GET, then PATCH) process
    const mockGetThenPatch = () => {
        return vi.spyOn(mockGaxiosInstance, 'request')
            // First call is GET to fetch current index
            .mockResolvedValueOnce({ data: mockCurrentIndex } as GaxiosResponse)
            // Second call is PATCH to update
            .mockResolvedValueOnce({ data: mockOperation } as GaxiosResponse);
    }

    test('should update labels with setLabels', async () => {
      const params = { ...validBaseParams, setLabels: { new: 'label', other: 'value' } };
      const requestSpy = mockGetThenPatch();

      const result = await tool.execute(params);

      expect(result.returnDisplay).toContain('Successfully initiated label update');
      expect(result.operation?.name).toBe(mockOperation.name);

      const patchRequest = requestSpy.mock.calls[1][0];
      expect(patchRequest?.method).toBe('PATCH');
      expect(patchRequest?.data).toEqual({ labels: { new: 'label', other: 'value' } });
    });

    test('should update labels with updateLabels', async () => {
        const params = { ...validBaseParams, updateLabels: { new: 'label', existing: 'updated' } };
        const requestSpy = mockGetThenPatch();

        const result = await tool.execute(params);
        expect(result.returnDisplay).toContain('Successfully initiated label update');

        const patchRequest = requestSpy.mock.calls[1][0];
        expect(patchRequest?.data).toEqual({ labels: { existing: 'updated', to_be_removed: 'true', new: 'label' } });
    });

    test('should remove all labels with clearLabels', async () => {
        const params = { ...validBaseParams, clearLabels: true };
        const requestSpy = mockGetThenPatch();

        const result = await tool.execute(params);
        expect(result.returnDisplay).toContain('Successfully initiated label update');

        const patchRequest = requestSpy.mock.calls[1][0];
        expect(patchRequest?.data).toEqual({ labels: {} });
    });

    test('should remove specific labels with removeLabels', async () => {
        const params = { ...validBaseParams, removeLabels: ['to_be_removed'] };
        const requestSpy = mockGetThenPatch();

        const result = await tool.execute(params);
        expect(result.returnDisplay).toContain('Successfully initiated label update');

        const patchRequest = requestSpy.mock.calls[1][0];
        expect(patchRequest?.data).toEqual({ labels: { existing: 'label' } });
    });

    test('should use provided requestId', async () => {
        const customRequestId = 'ca98e102-f8b2-4d5f-a359-25f269a83151';
        const params = { ...validBaseParams, setLabels: { a: 'b'}, requestId: customRequestId };
        const requestSpy = mockGetThenPatch();

        await tool.execute(params);

        const patchRequestUrl = requestSpy.mock.calls[1][0]?.url as string;
        expect(patchRequestUrl).toContain(`requestId=${customRequestId}`);
    });
  });

  describe('Parameter Validation', () => {
    test.each([
      ['indexId', { ...validBaseParams, indexId: '', setLabels: {a:'b'} }, "The 'indexId' parameter is required."],
      ['location', { ...validBaseParams, location: ' ', setLabels: {a:'b'} }, "The 'location' parameter is required."],
      ['projectId', { ...validBaseParams, projectId: undefined, setLabels: {a:'b'} }, "The 'projectId' parameter is required."],
      ['no label op', { ...validBaseParams }, "One of setLabels, updateLabels, clearLabels, or removeLabels must be specified to perform an update."],
      ['too many label ops', { ...validBaseParams, setLabels: {}, clearLabels: true }, "At most one of setLabels, updateLabels, clearLabels, or removeLabels can be specified."],
      ['invalid requestId', { ...validBaseParams, setLabels: {}, requestId: 'not-a-uuid' }, 'requestId must be a valid UUID.'],
    ])('should return validation error for invalid params: %s', async (_, params, expectedError) => {
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

      const result = await tool.execute({ ...validBaseParams, setLabels: {} });

      expect(result.returnDisplay).toBe(`Error: Index "${validBaseParams.indexId}" not found (404).`);
    });

    test('should handle 403 on PATCH', async () => {
      const error = new Error('Permission Denied') as any;
      error.response = { status: 403 };
      // Succeed on GET, fail on PATCH
      vi.spyOn(mockGaxiosInstance, 'request')
        .mockResolvedValueOnce({ data: mockCurrentIndex } as GaxiosResponse)
        .mockRejectedValueOnce(error);

      const result = await tool.execute({ ...validBaseParams, setLabels: {} });

      expect(result.returnDisplay).toBe('Error: Permission denied (403). Ensure role cloudaicompanion.codeRepositoryIndexes.update.');
    });

    test('should handle authentication errors', async () => {
        vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
            // Simulate failed token retrieval before any API call
            getAccessToken: vi.fn().mockResolvedValue({ token: null })
        });

        const result = await tool.execute({ ...validBaseParams, setLabels: {} });
        expect(result.llmContent).toContain('Failed to retrieve access token.');
        // The error message for auth isn't customized in the catch block, so we check for the thrown message.
    });
  });
});