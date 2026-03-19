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
   * Targets READY, PROVISIONING, and ERROR statuses to prevent leaks.
   * @param ttlMinutes Threshold for idleness in minutes.
   */
  async cleanupIdleWorkspaces(ttlMinutes: number = 240): Promise<number> {
    const now = new Date();
    const threshold = new Date(now.getTime() - ttlMinutes * 60 * 1000);
    
    // Fetch all workspaces for evaluation
    const workspaces = await this.workspaceService.listAllWorkspaces();

    let cleanedCount = 0;
    for (const ws of workspaces) {
        const lastConnected = new Date(ws.last_connected_at);
        
        // Cleanup if idle past TTL
        if (lastConnected < threshold) {
            // eslint-disable-next-line no-console
            console.log(`[Cleanup] Workspace ${ws.id} (${ws.name}) is idle since ${ws.last_connected_at} (Status: ${ws.status}). Cleaning up...`);
            
            try {
                // 1. Delete GCE instance if it exists (or attempts to)
                // ComputeService handles missing instances gracefully
                await this.computeService.deleteWorkspaceInstance(ws.instance_name, ws.zone);
                
                // 2. Delete record from Firestore
                await this.workspaceService.deleteWorkspace(ws.id);
                
                cleanedCount++;
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error(`[Cleanup] Failed to clean up ${ws.id}:`, err);
            }
        }
    }

    return cleanedCount;
  }
}
