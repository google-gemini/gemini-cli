/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CleanupService } from './cleanupService.js';
import { WorkspaceService } from './workspaceService.js';
import { ComputeService } from './computeService.js';

vi.mock('./workspaceService.js');
vi.mock('./computeService.js');

describe('CleanupService', () => {
  let service: CleanupService;
  let mockWorkspaceService: any;
  let mockComputeService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CleanupService();
    mockWorkspaceService = vi.mocked(new WorkspaceService());
    mockComputeService = vi.mocked(new ComputeService());
    
    // Wire up the internal instances
    (service as any).workspaceService = mockWorkspaceService;
    (service as any).computeService = mockComputeService;
  });

  it('should cleanup workspaces older than TTL', async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 300 * 60 * 1000).toISOString(); // 5 hours ago
    const newDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString();  // 1 hour ago

    const workspaces = [
      { id: 'old-1', name: 'old', last_connected_at: oldDate, instance_name: 'inst-1', zone: 'z1', status: 'READY' },
      { id: 'new-1', name: 'new', last_connected_at: newDate, instance_name: 'inst-2', zone: 'z1', status: 'READY' },
      { id: 'stuck-1', name: 'stuck', last_connected_at: oldDate, instance_name: 'inst-3', zone: 'z1', status: 'PROVISIONING' },
    ];

    mockWorkspaceService.listAllWorkspaces.mockResolvedValue(workspaces);

    const cleanedCount = await service.cleanupIdleWorkspaces(240); // 4 hour TTL

    expect(cleanedCount).toBe(2);
    expect(mockComputeService.deleteWorkspaceInstance).toHaveBeenCalledWith('inst-1', 'z1');
    expect(mockComputeService.deleteWorkspaceInstance).toHaveBeenCalledWith('inst-3', 'z1');
    expect(mockWorkspaceService.deleteWorkspace).toHaveBeenCalledWith('old-1');
    expect(mockWorkspaceService.deleteWorkspace).toHaveBeenCalledWith('stuck-1');
    
    // Should NOT have deleted the new one
    expect(mockWorkspaceService.deleteWorkspace).not.toHaveBeenCalledWith('new-1');
  });
});
