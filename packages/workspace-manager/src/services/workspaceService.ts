/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Firestore } from '@google-cloud/firestore';

export interface WorkspaceData {
  owner_id: string;
  name: string;
  instance_name: string;
  status: string;
  machine_type: string;
  zone: string;
  project_id: string;
  created_at: string;
  last_connected_at: string;
}

export interface WorkspaceRecord extends WorkspaceData {
  id: string;
}

export class WorkspaceService {
  private firestore: Firestore;

  constructor() {
    this.firestore = new Firestore();
  }

  getCollection() {
    return this.firestore.collection('workspaces');
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    const snapshot = await this.getCollection().get();

    return snapshot.docs.map((doc) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const data = doc.data() as WorkspaceData;
      return {
        id: doc.id,
        ...data,
      };
    });
  }

  async listWorkspaces(ownerId: string): Promise<WorkspaceRecord[]> {
    const snapshot = await this.getCollection()
      .where('owner_id', '==', ownerId)
      .get();

    return snapshot.docs.map((doc) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const data = doc.data() as WorkspaceData;
      return {
        id: doc.id,
        ...data,
      };
    });
  }

  async getWorkspace(id: string): Promise<WorkspaceRecord | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return { id: doc.id, ...(doc.data() as WorkspaceData) };
  }

  async createWorkspace(id: string, data: WorkspaceData): Promise<void> {
    await this.getCollection().doc(id).set(data);
  }

  async updateWorkspace(id: string, data: Partial<WorkspaceData>): Promise<void> {
    await this.getCollection().doc(id).update(data);
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.getCollection().doc(id).delete();
  }
}
