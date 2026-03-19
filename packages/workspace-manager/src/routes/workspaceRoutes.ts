/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { WorkspaceService } from '../services/workspaceService.js';
import { ComputeService } from '../services/computeService.js';
import type { AuthenticatedRequest } from '../middleware/iap.js';

const router = Router();
const workspaceService = new WorkspaceService();
const computeService = new ComputeService();

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1),
  machineType: z.string().optional().default('e2-standard-4'),
  imageTag: z.string().optional().default('latest'),
  zone: z.string().optional().default('us-west1-a'),
});

router.get('/', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaces = await workspaceService.listWorkspaces(authReq.user.id);
    res.json(workspaces);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validation = CreateWorkspaceSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error.format() });
      return;
    }

    const { name, machineType, imageTag, zone } = validation.data;
    const workspaceId = uuidv4();
    const instanceName = `workspace-${workspaceId.slice(0, 8)}`;

    const workspaceData = {
      owner_id: authReq.user.id,
      name,
      instance_name: instanceName,
      status: 'PROVISIONING',
      machine_type: machineType,
      zone,
      project_id: computeService.getProjectId(),
      created_at: new Date().toISOString(),
    };

    // 1. Save to state store
    await workspaceService.createWorkspace(workspaceId, workspaceData);

    // 2. Trigger GCE provisioning (Async)
    computeService.createWorkspaceInstance({
      instanceName,
      machineType,
      imageTag,
      zone,
    }).catch(err => {
        // eslint-disable-next-line no-console
        console.error(`Failed to provision GCE instance ${instanceName}:`, err);
    });

    res.status(201).json({ id: workspaceId, ...workspaceData });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const workspace = await workspaceService.getWorkspace(id);

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    // SECURITY: Ownership Check
    if (workspace.owner_id !== authReq.user.id) {
      res.status(403).json({ error: 'Unauthorized to delete this workspace' });
      return;
    }

    // 1. Delete GCE instance
    await computeService.deleteWorkspaceInstance(workspace.instance_name, workspace.zone);

    // 2. Delete from state store
    await workspaceService.deleteWorkspace(id);

    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

export const workspaceRouter = router;
