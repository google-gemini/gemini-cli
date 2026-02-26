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
  CoreToolCallStatus,
  type SerializableConfirmationDetails,
} from '@google/gemini-cli-core';
import { type IndividualToolCallDisplay } from '../types.js';

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
      status: CoreToolCallStatus.AwaitingApproval,
      resultDisplay: undefined,
      confirmationDetails: { type: 'info', title: 'title', prompt: 'prompt' },
    },
    {
      callId: 'edit-call',
      correlationId: 'corr-edit',
      name: 'edit-tool',
      description: 'desc',
      status: CoreToolCallStatus.AwaitingApproval,
      resultDisplay: undefined,
      confirmationDetails: {
        type: 'edit',
        title: 'edit',
        fileName: 'f.txt',
        filePath: '/f.txt',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
      },
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

  it('publishes to MessageBus for tools with correlationId', async () => {
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
    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-edit',
      }),
    );
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

  it('calls local onConfirm for tools without correlationId', async () => {
    const mockOnConfirm = vi.fn().mockResolvedValue(undefined);
    const legacyTool: IndividualToolCallDisplay = {
      callId: 'legacy-call',
      name: 'legacy-tool',
      description: 'desc',
      status: CoreToolCallStatus.AwaitingApproval,
      resultDisplay: undefined,
      confirmationDetails: {
        type: 'exec',
        title: 'exec',
        command: 'ls',
        rootCommand: 'ls',
        rootCommands: ['ls'],
        onConfirm: mockOnConfirm,
      } as unknown as SerializableConfirmationDetails,
    };

    const { result } = renderHook(() => useToolActions(), {
      wrapper: ({ children }) => (
        <ToolActionsProvider config={mockConfig} toolCalls={[legacyTool]}>
          {children}
        </ToolActionsProvider>
      ),
    });

    await act(async () => {
      await result.current.confirm(
        'legacy-call',
        ToolConfirmationOutcome.ProceedOnce,
      );
    });

    expect(mockOnConfirm).toHaveBeenCalledWith(
      ToolConfirmationOutcome.ProceedOnce,
      undefined,
    );
    expect(mockMessageBus.publish).not.toHaveBeenCalled();
  });
});
