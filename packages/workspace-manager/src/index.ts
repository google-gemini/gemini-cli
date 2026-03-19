/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Firestore } from '@google-cloud/firestore';

interface WorkspaceData {
  owner_id: string;
  name: string;
  instance_name: string;
  status: string;
  machine_type: string;
  created_at: string;
}

const app = express();
app.use(express.json());

// Initialize Firestore
const firestore = new Firestore();

const PORT = process.env.PORT || 8080;

app.get('/health', (_req: Request, res: Response) => {
  res.send({ status: 'ok' });
});

/**
 * List all workspaces for the authenticated user
 */
const listWorkspaces: RequestHandler = async (_req, res) => {
  try {
    const ownerId = 'default-user'; // TODO: Get from OAuth/IAP headers
    const snapshot = await firestore
      .collection('workspaces')
      .where('owner_id', '==', ownerId)
      .get();

    const workspaces = snapshot.docs.map((doc) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const data = doc.data() as WorkspaceData;
      return {
        id: doc.id,
        ...data,
      };
    });

    res.json(workspaces);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
};

app.get('/workspaces', listWorkspaces);

/**
 * Create a new workspace (GCE VM)
 */
const createWorkspace: RequestHandler = async (req, res) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const body = req.body as Record<string, unknown>;
    const name = typeof body['name'] === 'string' ? body['name'] : 'unnamed';
    const machineType =
      typeof body['machineType'] === 'string'
        ? body['machineType']
        : 'e2-standard-4';

    const ownerId = 'default-user'; // TODO: Get from OAuth/IAP headers
    const workspaceId = uuidv4();
    const instanceName = `workspace-${workspaceId.slice(0, 8)}`;

    const workspaceData: WorkspaceData = {
      owner_id: ownerId,
      name,
      instance_name: instanceName,
      status: 'PROVISIONING',
      machine_type: machineType,
      created_at: new Date().toISOString(),
    };

    await firestore
      .collection('workspaces')
      .doc(workspaceId)
      .set(workspaceData);

    res.status(201).json({ id: workspaceId, ...workspaceData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
};

app.post('/workspaces', createWorkspace);

/**
 * Delete a workspace
 */
const deleteWorkspace: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Workspace ID is required' });
      return;
    }
    await firestore.collection('workspaces').doc(id).delete();
    res.status(204).send();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
};

app.delete('/workspaces/:id', deleteWorkspace);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Workspace Hub listening on port ${PORT}`);
});
