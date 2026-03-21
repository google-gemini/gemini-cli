/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistentStateMock = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('../utils/persistentState.js', () => ({
  persistentState: persistentStateMock,
}));

describe('TaskWorkflowService', () => {
  beforeEach(() => {
    vi.resetModules();
    persistentStateMock.get.mockReset();
    persistentStateMock.set.mockReset();
    persistentStateMock.get.mockImplementation((key: string) =>
      key === 'taskWorkflowHistory' ? [] : null,
    );
  });

  it('loads persisted workflow state on first initialization', async () => {
    persistentStateMock.get.mockImplementation((key: string) =>
      key === 'taskWorkflow'
        ? {
            id: 'task-persisted',
            traceId: 'trace-persisted',
            goal: 'persisted goal',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            status: 'submitted',
            phases: ['plan', 'execute', 'verify', 'summarize'],
          }
        : [],
    );

    const { TaskWorkflowService } = await import('./TaskWorkflowService.js');
    const service = TaskWorkflowService.getInstance();

    expect(service.getStatus()?.id).toBe('task-persisted');
    expect(persistentStateMock.get).toHaveBeenCalledWith('taskWorkflow');
  });

  it('persists updates when starting and clearing task state', async () => {
    const { TaskWorkflowService } = await import('./TaskWorkflowService.js');
    const service = TaskWorkflowService.getInstance();

    const started = service.start('ship persistence');
    expect(started.goal).toBe('ship persistence');
    expect(started.traceId).toContain('trace-');
    expect(persistentStateMock.set).toHaveBeenCalledWith(
      'taskWorkflow',
      expect.objectContaining({
        goal: 'ship persistence',
        status: 'submitted',
      }),
    );

    service.clear();
    expect(persistentStateMock.set).toHaveBeenCalledWith('taskWorkflow', null);
  });
});
