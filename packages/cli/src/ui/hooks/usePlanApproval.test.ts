/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { usePlanApproval } from './usePlanApproval.js';
import {
  type Config,
  type PlanApprovalRequest,
  MessageBusType,
  ApprovalMode,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

describe('usePlanApproval', () => {
  let mockConfig: Partial<Config>;
  let mockMessageBus: {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let mockAddItem: ReturnType<typeof vi.fn>;
  let mockOnApprovalModeChange: ReturnType<typeof vi.fn>;
  let planApprovalHandler: ((msg: PlanApprovalRequest) => void) | undefined;

  const mockPlansDir = '/mock/project/.gemini/plans';

  beforeEach(() => {
    vi.resetAllMocks();

    mockMessageBus = {
      subscribe: vi.fn((type, handler) => {
        if (type === MessageBusType.PLAN_APPROVAL_REQUEST) {
          planApprovalHandler = handler;
        }
      }),
      unsubscribe: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
      storage: {
        getProjectTempPlansDir: vi.fn().mockReturnValue(mockPlansDir),
      } as unknown as Config['storage'],
      setCurrentPlanPath: vi.fn(),
      setApprovalMode: vi.fn(),
    };

    mockAddItem = vi.fn();
    mockOnApprovalModeChange = vi.fn();

    vi.mocked(fs.promises.readFile).mockResolvedValue('# Test Plan Content');
  });

  afterEach(() => {
    vi.clearAllMocks();
    planApprovalHandler = undefined;
  });

  const renderUsePlanApproval = () =>
    renderHook(() =>
      usePlanApproval({
        config: mockConfig as Config,
        addItem: mockAddItem,
        onApprovalModeChange: mockOnApprovalModeChange,
      }),
    );

  it('should initialize with null request and undefined content', () => {
    const { result } = renderUsePlanApproval();

    expect(result.current.planApprovalRequest).toBeNull();
    expect(result.current.planContent).toBeUndefined();
  });

  it('should subscribe to PLAN_APPROVAL_REQUEST on mount', () => {
    renderUsePlanApproval();

    expect(mockMessageBus.subscribe).toHaveBeenCalledWith(
      MessageBusType.PLAN_APPROVAL_REQUEST,
      expect.any(Function),
    );
  });

  it('should unsubscribe on unmount', () => {
    const { unmount } = renderUsePlanApproval();

    unmount();

    expect(mockMessageBus.unsubscribe).toHaveBeenCalledWith(
      MessageBusType.PLAN_APPROVAL_REQUEST,
      expect.any(Function),
    );
  });

  it('should set planApprovalRequest when message is received', async () => {
    const { result } = renderUsePlanApproval();

    const request: PlanApprovalRequest = {
      type: MessageBusType.PLAN_APPROVAL_REQUEST,
      correlationId: 'test-correlation-id',
      planPath: `${mockPlansDir}/test-plan.md`,
    };

    await act(async () => {
      planApprovalHandler?.(request);
    });

    expect(result.current.planApprovalRequest).toEqual(request);
  });

  it('should skip duplicate requests with same correlationId', async () => {
    const { result } = renderUsePlanApproval();

    const request: PlanApprovalRequest = {
      type: MessageBusType.PLAN_APPROVAL_REQUEST,
      correlationId: 'test-correlation-id',
      planPath: `${mockPlansDir}/test-plan.md`,
    };

    await act(async () => {
      planApprovalHandler?.(request);
    });

    await act(async () => {
      planApprovalHandler?.(request);
    });

    expect(result.current.planApprovalRequest).toEqual(request);
  });

  it('should read plan content when planPath changes', async () => {
    const { result } = renderUsePlanApproval();

    const request: PlanApprovalRequest = {
      type: MessageBusType.PLAN_APPROVAL_REQUEST,
      correlationId: 'test-correlation-id',
      planPath: `${mockPlansDir}/test-plan.md`,
    };

    await act(async () => {
      planApprovalHandler?.(request);
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(result.current.planContent).toBe('# Test Plan Content');
      });
    });
  });

  it('should show error for plan path outside plans directory', async () => {
    const { result } = renderUsePlanApproval();

    const request: PlanApprovalRequest = {
      type: MessageBusType.PLAN_APPROVAL_REQUEST,
      correlationId: 'test-correlation-id',
      planPath: '/etc/passwd',
    };

    await act(async () => {
      planApprovalHandler?.(request);
    });

    expect(result.current.planContent).toBe(
      'Error: Plan path is outside the designated plans directory.',
    );
  });

  describe('handlePlanApprove', () => {
    it('should publish approval response and update config', async () => {
      const { result } = renderUsePlanApproval();

      const request: PlanApprovalRequest = {
        type: MessageBusType.PLAN_APPROVAL_REQUEST,
        correlationId: 'test-correlation-id',
        planPath: `${mockPlansDir}/test-plan.md`,
      };

      await act(async () => {
        planApprovalHandler?.(request);
      });

      await act(async () => {
        await result.current.handlePlanApprove(ApprovalMode.AUTO_EDIT);
      });

      expect(mockConfig.setCurrentPlanPath).toHaveBeenCalledWith(
        request.planPath,
      );
      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
      );
      expect(mockOnApprovalModeChange).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
      );
      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.PLAN_APPROVAL_RESPONSE,
        correlationId: 'test-correlation-id',
        approved: true,
      });
      expect(result.current.planApprovalRequest).toBeNull();
    });

    it('should add info message on successful approval', async () => {
      const { result } = renderUsePlanApproval();

      const request: PlanApprovalRequest = {
        type: MessageBusType.PLAN_APPROVAL_REQUEST,
        correlationId: 'test-correlation-id',
        planPath: `${mockPlansDir}/test-plan.md`,
      };

      await act(async () => {
        planApprovalHandler?.(request);
      });

      await act(async () => {
        await result.current.handlePlanApprove(ApprovalMode.DEFAULT);
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plan approved. Edits will require manual acceptance.',
        }),
        expect.any(Number),
      );
    });
  });

  describe('handlePlanFeedback', () => {
    it('should publish rejection response with feedback', async () => {
      const { result } = renderUsePlanApproval();

      const request: PlanApprovalRequest = {
        type: MessageBusType.PLAN_APPROVAL_REQUEST,
        correlationId: 'test-correlation-id',
        planPath: `${mockPlansDir}/test-plan.md`,
      };

      await act(async () => {
        planApprovalHandler?.(request);
      });

      await act(async () => {
        await result.current.handlePlanFeedback('Please add more tests');
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.PLAN_APPROVAL_RESPONSE,
        correlationId: 'test-correlation-id',
        approved: false,
        feedback: 'Please add more tests',
      });
      expect(result.current.planApprovalRequest).toBeNull();
    });
  });

  describe('handlePlanCancel', () => {
    it('should publish rejection response with cancellation feedback', async () => {
      const { result } = renderUsePlanApproval();

      const request: PlanApprovalRequest = {
        type: MessageBusType.PLAN_APPROVAL_REQUEST,
        correlationId: 'test-correlation-id',
        planPath: `${mockPlansDir}/test-plan.md`,
      };

      await act(async () => {
        planApprovalHandler?.(request);
      });

      await act(async () => {
        await result.current.handlePlanCancel();
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.PLAN_APPROVAL_RESPONSE,
        correlationId: 'test-correlation-id',
        approved: false,
        feedback:
          'User dismissed the plan approval dialog without providing feedback. The plan is not approved.',
      });
      expect(result.current.planApprovalRequest).toBeNull();
    });
  });
});
