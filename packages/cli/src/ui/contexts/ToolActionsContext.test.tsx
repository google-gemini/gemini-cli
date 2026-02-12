/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { ToolActionsProvider, useToolActions } from './ToolActionsContext.js';
import {
  type Config,
  ToolConfirmationOutcome,
  MessageBusType,
  IdeClient,
  type ToolCallConfirmationDetails,
} from '@google/gemini-cli-core';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../types.js';

// Mock IdeClient
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    IdeClient: {
      getInstance: vi.fn(),
    },
  };
});

describe('ToolActionsContext', () => {
  const mockMessageBus = {
    publish: vi.fn(),
  };

  const mockConfig = {
    getIdeMode: vi.fn().mockReturnValue(false),
    getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
  } as unknown as Config;

  const mockToolCalls: IndividualToolCallDisplay[] = [
    {
      callId: 'modern-call',
      correlationId: 'corr-123',
      name: 'test-tool',
      description: 'desc',
      status: ToolCallStatus.Confirming,
      resultDisplay: undefined,
      confirmationDetails: { type: 'info', title: 'title', prompt: 'prompt' },
    },
    {
      callId: 'legacy-call',
      name: 'legacy-tool',
      description: 'desc',
      status: ToolCallStatus.Confirming,
      resultDisplay: undefined,
      confirmationDetails: {
        type: 'info',
        title: 'legacy',
        prompt: 'prompt',
        onConfirm: vi.fn(),
      } as ToolCallConfirmationDetails,
    },
    {
      callId: 'edit-call',
      name: 'edit-tool',
      description: 'desc',
      status: ToolCallStatus.Confirming,
      resultDisplay: undefined,
      confirmationDetails: {
        type: 'edit',
        title: 'edit',
        fileName: 'f.txt',
        filePath: '/f.txt',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
        onConfirm: vi.fn(),
      } as ToolCallConfirmationDetails,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToolActionsProvider config={mockConfig} toolCalls={mockToolCalls}>
      {children}
    </ToolActionsProvider>
  );

  it('publishes to MessageBus for tools with correlationId (Modern Path)', async () => {
    const { result } = renderHook(() => useToolActions(), { wrapper });

    await result.current.confirm(
      'modern-call',
      ToolConfirmationOutcome.ProceedOnce,
    );

    expect(mockMessageBus.publish).toHaveBeenCalledWith({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: 'corr-123',
      confirmed: true,
      requiresUserConfirmation: false,
      outcome: ToolConfirmationOutcome.ProceedOnce,
      payload: undefined,
    });
  });

  it('calls onConfirm for legacy tools (Legacy Path)', async () => {
    const { result } = renderHook(() => useToolActions(), { wrapper });
    const legacyDetails = mockToolCalls[1]
      .confirmationDetails as ToolCallConfirmationDetails;

    await result.current.confirm(
      'legacy-call',
      ToolConfirmationOutcome.ProceedOnce,
    );

    if (legacyDetails && 'onConfirm' in legacyDetails) {
      expect(legacyDetails.onConfirm).toHaveBeenCalledWith(
        ToolConfirmationOutcome.ProceedOnce,
        undefined,
      );
    } else {
      throw new Error('Expected onConfirm to be present');
    }
    expect(mockMessageBus.publish).not.toHaveBeenCalled();
  });

  it('handles cancel by calling confirm with Cancel outcome', async () => {
    const { result } = renderHook(() => useToolActions(), { wrapper });

    await result.current.cancel('modern-call');

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: ToolConfirmationOutcome.Cancel,
        confirmed: false,
      }),
    );
  });

  it('resolves IDE diffs for edit tools when in IDE mode', async () => {
    const mockIdeClient = {
      isDiffingEnabled: vi.fn().mockReturnValue(true),
      resolveDiffFromCli: vi.fn(),
    } as unknown as IdeClient;
    vi.mocked(IdeClient.getInstance).mockResolvedValue(mockIdeClient);
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);

    const { result } = renderHook(() => useToolActions(), { wrapper });

    // Wait for IdeClient initialization in useEffect
    await act(async () => {
      await waitFor(() => expect(IdeClient.getInstance).toHaveBeenCalled());
      // Give React a chance to update state
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await result.current.confirm(
      'edit-call',
      ToolConfirmationOutcome.ProceedOnce,
    );

    expect(mockIdeClient.resolveDiffFromCli).toHaveBeenCalledWith(
      '/f.txt',
      'accepted',
    );
    const editDetails = mockToolCalls[2]
      .confirmationDetails as ToolCallConfirmationDetails;
    if (editDetails && 'onConfirm' in editDetails) {
      expect(editDetails.onConfirm).toHaveBeenCalled();
    } else {
      throw new Error('Expected onConfirm to be present');
    }
  });

  it('updates isDiffingEnabled when IdeClient status changes', async () => {
    let statusListener: () => void = () => {};
    const mockIdeClient = {
      isDiffingEnabled: vi.fn().mockReturnValue(false),
      addStatusChangeListener: vi.fn().mockImplementation((listener) => {
        statusListener = listener;
      }),
      removeStatusChangeListener: vi.fn(),
    } as unknown as IdeClient;

    vi.mocked(IdeClient.getInstance).mockResolvedValue(mockIdeClient);
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);

    const { result } = renderHook(() => useToolActions(), { wrapper });

    // Wait for initialization
    await act(async () => {
      await waitFor(() => expect(IdeClient.getInstance).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isDiffingEnabled).toBe(false);

    // Simulate connection change
    vi.mocked(mockIdeClient.isDiffingEnabled).mockReturnValue(true);
    await act(async () => {
      statusListener();
    });

    expect(result.current.isDiffingEnabled).toBe(true);

    // Simulate disconnection
    vi.mocked(mockIdeClient.isDiffingEnabled).mockReturnValue(false);
    await act(async () => {
      statusListener();
    });

    expect(result.current.isDiffingEnabled).toBe(false);
  });
});
