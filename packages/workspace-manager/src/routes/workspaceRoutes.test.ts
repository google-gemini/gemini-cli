/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

// Mock the services
vi.mock('../services/workspaceService.js', () => ({
    WorkspaceService: vi.fn().mockImplementation(() => ({
      listWorkspaces: vi.fn().mockResolvedValue([]),
      getWorkspace: vi.fn().mockResolvedValue(null),
      createWorkspace: vi.fn().mockResolvedValue(undefined),
      deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    })),
  }));

vi.mock('../services/computeService.js', () => ({
    ComputeService: vi.fn().mockImplementation(() => ({
      createWorkspaceInstance: vi.fn().mockResolvedValue(undefined),
      deleteWorkspaceInstance: vi.fn().mockResolvedValue(undefined),
      getProjectId: vi.fn().mockReturnValue('dev-project'),
    })),
  }));

describe('Workspace Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /workspaces', () => {
    it('should return an empty list of workspaces', async () => {
      const response = await request(app).get('/workspaces');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /workspaces', () => {
    it('should create a new workspace', async () => {
      const payload = { name: 'test-workspace' };
      const response = await request(app).post('/workspaces').send(payload);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('test-workspace');
      expect(response.body.owner_id).toBe('dev-user-id');
      expect(response.body.status).toBe('PROVISIONING');
    });

    it('should fail if name is missing', async () => {
      const response = await request(app).post('/workspaces').send({});
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /workspaces/:id', () => {
    it('should return 404 if workspace not found', async () => {
      const response = await request(app).delete('/workspaces/non-existent');
      expect(response.status).toBe(404);
    });
  });
});
