/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspaceService } from './workspaceService.js';
import { ComputeService } from './computeService.js';

export class CleanupService {
  private workspaceService = new WorkspaceService();
  private computeService = new ComputeService();

  /**
   * Identifies and deletes workspaces that have been idle for too long.
   * @param ttlMinutes Threshold for idleness in minutes.
   */
  async cleanupIdleWorkspaces(ttlMinutes: number = 240): Promise<number> {
    // 1. Get all workspaces (Note: in a huge system we'd need to paginate or use a query)
    // For now, we list all, but in prod we'd query by last_connected_at
    const now = new Date();
    const threshold = new Date(now.getTime() - ttlMinutes * 60 * 1000);
    
    // Using simple approach: list all, filter in code.
    // Real implementation should use Firestore .where('last_connected_at', '<', threshold.toISOString())
    // but Firestore where requires composite indexes for some queries.
    
    // We'll just list active ones for now
    const snapshot = await (this.workspaceService as any).collection
        .where('status', '==', 'READY')
        .get();

    let cleanedCount = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const lastConnected = new Date(data.last_connected_at);
        
        if (lastConnected < threshold) {
            // eslint-disable-next-line no-console
            console.log(`[Cleanup] Workspace ${doc.id} (${data.name}) is idle since ${data.last_connected_at}. Cleaning up...`);
            
            try {
                // Delete GCE
                await this.computeService.deleteWorkspaceInstance(data.instance_name, data.zone);
                // Update status or delete from DB
                await this.workspaceService.deleteWorkspace(doc.id);
                cleanedCount++;
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error(`[Cleanup] Failed to clean up ${doc.id}:`, err);
            }
        }
    }

    return cleanedCount;
  }
}
