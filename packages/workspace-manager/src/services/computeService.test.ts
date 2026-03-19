/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputeService } from './computeService.js';
import { WorkspaceService } from './workspaceService.js';

// Mock WorkspaceService and compute client
vi.mock('./workspaceService.js');
vi.mock('@google-cloud/compute', () => ({
    InstancesClient: vi.fn().mockImplementation(() => ({
        insert: vi.fn().mockResolvedValue([{ latestResponse: { name: 'op-1' } }]),
        delete: vi.fn().mockResolvedValue([{ latestResponse: { name: 'op-2' } }]),
    })),
}));

describe('ComputeService', () => {
  let service: ComputeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ComputeService();
  });

  describe('createWorkspaceInstance', () => {
    it('should initiate provisioning', async () => {
      const options = {
        instanceName: 'test-inst',
        machineType: 'e2-standard-4',
        imageTag: 'latest',
        zone: 'us-west1-a',
        workspaceId: 'ws-123',
      };

      // Mock console to avoid noise and check output
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.createWorkspaceInstance(options);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Provisioning test-inst'));
      logSpy.mockRestore();
    });
  });

  describe('deleteWorkspaceInstance', () => {
    it('should initiate deletion', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await service.deleteWorkspaceInstance('inst1', 'zone1');
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Deleting instance inst1'));
      logSpy.mockRestore();
    });
  });
});
