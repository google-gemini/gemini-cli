/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceService } from './workspaceService.js';
import { Firestore } from '@google-cloud/firestore';

const mockCollection = {
  where: vi.fn().mockReturnThis(),
  get: vi.fn(),
  doc: vi.fn().mockReturnThis(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@google-cloud/firestore', () => ({
    Firestore: vi.fn().mockImplementation(() => ({
      collection: vi.fn().mockReturnValue(mockCollection),
    })),
  }));

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkspaceService();
  });

  describe('listWorkspaces', () => {
    it('should query Firestore for workspaces by ownerId', async () => {
      const mockDocs = [{ id: '1', data: () => ({ name: 'ws1' }) }];
      mockCollection.get.mockResolvedValue({ docs: mockDocs });

      const result = await service.listWorkspaces('user1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].name).toBe('ws1');
      // Verify the collection name was 'workspaces'
      const firestoreInstance = vi.mocked(Firestore).mock.results[0].value;
      expect(firestoreInstance.collection).toHaveBeenCalledWith('workspaces');
    });
  });

  describe('createWorkspace', () => {
    it('should save workspace data to Firestore', async () => {
      const data = {
        owner_id: 'u1',
        name: 'test',
        instance_name: 'inst',
        status: 'READY',
        machine_type: 'e2',
        zone: 'us1',
        project_id: 'p1',
        created_at: 'now',
        last_connected_at: 'now',
      };
      await service.createWorkspace('id1', data);
      expect(mockCollection.doc).toHaveBeenCalledWith('id1');
      expect(mockCollection.set).toHaveBeenCalledWith(data);
    });
  });
});
