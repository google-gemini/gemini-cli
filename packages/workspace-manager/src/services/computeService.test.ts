/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputeService } from './computeService.js';

const mockInstancesClient = {
  insert: vi.fn().mockResolvedValue([{ latestResponse: { name: 'op-1' } }]),
  delete: vi.fn().mockResolvedValue([{ latestResponse: { name: 'op-2' } }]),
};

vi.mock('@google-cloud/compute', () => ({
    InstancesClient: vi.fn().mockImplementation(() => mockInstancesClient),
  }));

describe('ComputeService', () => {
  let service: ComputeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ComputeService();
  });

  describe('createWorkspaceInstance', () => {
    it('should call instancesClient.insert with correct parameters', async () => {
      const options = {
        instanceName: 'test-inst',
        machineType: 'e2-medium',
        imageTag: 'latest',
        zone: 'us-west1-a',
      };

      await service.createWorkspaceInstance(options);

      expect(mockInstancesClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          project: expect.any(String),
          zone: 'us-west1-a',
          instanceResource: expect.objectContaining({
            name: 'test-inst',
          }),
        }),
      );
    });
  });

  describe('deleteWorkspaceInstance', () => {
    it('should call instancesClient.delete', async () => {
      await service.deleteWorkspaceInstance('inst1', 'zone1');
      expect(mockInstancesClient.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: 'inst1',
          zone: 'zone1',
        }),
      );
    });
  });
});
