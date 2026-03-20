/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, useState, useCallback } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
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
    // Default to a pending promise to avoid unwanted async state updates in tests
    // that don't specifically test the IdeClient initialization.
    vi.mocked(IdeClient.getInstance).mockReturnValue(new Promise(() => {}));
  });

  const WrapperReactComp = ({ children }: { children: React.ReactNode }) => {
    const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

    const isExpanded = useCallback(
      (callId: string) => expandedTools.has(callId),
      [expandedTools],
    );

    const toggleExpansion = useCallback((callId: string) => {
      setExpandedTools((prev) => {
        const next = new Set(prev);
        if (next.has(callId)) {
          next.delete(callId);
        } else {
          next.add(callId);
        }
        return next;
      });
    }, []);

    const toggleAllExpansion = useCallback((callIds: string[]) => {
      setExpandedTools((prev) => {
        const next = new Set(prev);
        const anyCollapsed = callIds.some((id) => !next.has(id));

        if (anyCollapsed) {
          callIds.forEach((id) => next.add(id));
        } else {
          callIds.forEach((id) => next.delete(id));
        }
        return next;
      });
    }, []);
    return (
      <ToolActionsProvider
        config={mockConfig}
        toolCalls={mockToolCalls}
        isExpanded={isExpanded}
        toggleExpansion={toggleExpansion}
        toggleAllExpansion={toggleAllExpansion}
      >
        {children}
      </ToolActionsProvider>
    );
  };

  it('publishes to MessageBus for tools with correlationId', async () => {
    const { result } = await renderHook(() => useToolActions(), {
      wrapper: WrapperReactComp,
    });

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
    const { result } = await renderHook(() => useToolActions(), {
      wrapper: WrapperReactComp,
    });

    await result.current.cancel('modern-call');

    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: ToolConfirmationOutcome.Cancel,
        confirmed: false,
      }),
    );
  });

  it('resolves IDE diffs for edit tools when in IDE mode', async () => {
    let deferredIdeClient: { resolve: (c: IdeClient) => void };
    const mockIdeClient = {
      isDiffingEnabled: vi.fn().mockReturnValue(true),
      resolveDiffFromCli: vi.fn(),
      addStatusChangeListener: vi.fn(),
      removeStatusChangeListener: vi.fn(),
    } as unknown as IdeClient;

    vi.mocked(IdeClient.getInstance).mockImplementation(
      () =>
        new Promise((resolve) => {
          deferredIdeClient = { resolve };
        }),
    );
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);

    const { result } = await renderHook(() => useToolActions(), {
      wrapper: WrapperReactComp,
    });

    await act(async () => {
      deferredIdeClient.resolve(mockIdeClient);
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
    let deferredIdeClient: { resolve: (c: IdeClient) => void };

    const mockIdeClient = {
      isDiffingEnabled: vi.fn().mockReturnValue(false),
      addStatusChangeListener: vi.fn().mockImplementation((listener) => {
        statusListener = listener;
      }),
      removeStatusChangeListener: vi.fn(),
    } as unknown as IdeClient;

    vi.mocked(IdeClient.getInstance).mockImplementation(
      () =>
        new Promise((resolve) => {
          deferredIdeClient = { resolve };
        }),
    );
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);

    const { result } = await renderHook(() => useToolActions(), {
      wrapper: WrapperReactComp,
    });

    await act(async () => {
      deferredIdeClient.resolve(mockIdeClient);
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

    const { result } = await renderHook(() => useToolActions(), {
      wrapper: ({ children }) => (
        <ToolActionsProvider
          config={mockConfig}
          toolCalls={[legacyTool]}
          isExpanded={vi.fn().mockReturnValue(false)}
          toggleExpansion={vi.fn()}
          toggleAllExpansion={vi.fn()}
        >
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

  describe('toggleAllExpansion', () => {
    it('expands all when none are expanded', async () => {
      const { result } = await renderHook(() => useToolActions(), {
        wrapper: WrapperReactComp,
      });

      act(() => {
        result.current.toggleAllExpansion(['modern-call', 'edit-call']);
      });

      expect(result.current.isExpanded('modern-call')).toBe(true);
      expect(result.current.isExpanded('edit-call')).toBe(true);
    });

    it('expands all when some are expanded', async () => {
      const { result } = await renderHook(() => useToolActions(), {
        wrapper: WrapperReactComp,
      });

      act(() => {
        result.current.toggleExpansion('modern-call');
      });
      expect(result.current.isExpanded('modern-call')).toBe(true);
      expect(result.current.isExpanded('edit-call')).toBe(false);

      act(() => {
        result.current.toggleAllExpansion(['modern-call', 'edit-call']);
      });

      expect(result.current.isExpanded('modern-call')).toBe(true);
      expect(result.current.isExpanded('edit-call')).toBe(true);
    });

    it('collapses all when all are expanded', async () => {
      const { result } = await renderHook(() => useToolActions(), {
        wrapper: WrapperReactComp,
      });

      act(() => {
        result.current.toggleExpansion('modern-call');
        result.current.toggleExpansion('edit-call');
      });
      expect(result.current.isExpanded('modern-call')).toBe(true);
      expect(result.current.isExpanded('edit-call')).toBe(true);

      act(() => {
        result.current.toggleAllExpansion(['modern-call', 'edit-call']);
      });

      expect(result.current.isExpanded('modern-call')).toBe(false);
      expect(result.current.isExpanded('edit-call')).toBe(false);
    });
  });
});
