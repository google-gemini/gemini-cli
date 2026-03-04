/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MessageBus,
  MessageBusType,
  PolicyDecision,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
} from '@google/gemini-cli-core';
import { PolicyEngine } from '@google/gemini-cli-core';

/**
 * Directly exercises the MessageBus approval-listener mechanics that
 * GeminiCliSession.attachApprovalListener relies on, without needing to spin up
 * a full Config / GeminiClient stack.
 *
 * The session wires an event listener onto the MessageBus for the duration of
 * each scheduleAgentTools call.  When the policy engine returns ASK_USER, the
 * bus emits a TOOL_CONFIRMATION_REQUEST event; the listener picks it up, calls
 * onToolApproval, and publishes the matching TOOL_CONFIRMATION_RESPONSE.
 *
 * These tests validate that contract at the bus level.
 */
describe('onToolApproval callback mechanics', () => {
  let policyEngine: PolicyEngine;
  let bus: MessageBus;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
    bus = new MessageBus(policyEngine);
    // All tool calls go to ASK_USER so the approval listener is exercised.
    vi.spyOn(policyEngine, 'check').mockResolvedValue({
      decision: PolicyDecision.ASK_USER,
    });
  });

  /**
   * Helper that mimics what attachApprovalListener does inside the session.
   * Registers a subscriber, returns a cleanup function.
   */
  function attachListener(
    onApproval: (call: { name: string }) => Promise<'allow' | 'deny'>,
  ): () => void {
    const handler = async (msg: ToolConfirmationRequest): Promise<void> => {
      const { toolCall, correlationId } = msg;

      let decision: 'allow' | 'deny';
      try {
        decision = await onApproval({ name: toolCall.name ?? '' });
      } catch {
        decision = 'deny';
      }

      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId,
        confirmed: decision === 'allow',
      };

      await bus.publish(response);
    };

    bus.subscribe(MessageBusType.TOOL_CONFIRMATION_REQUEST, handler);
    return () =>
      bus.unsubscribe(MessageBusType.TOOL_CONFIRMATION_REQUEST, handler);
  }

  it('forwards an allow decision to the bus as confirmed=true', async () => {
    const onApproval = vi.fn().mockResolvedValue('allow');
    const responseHandler = vi.fn();
    bus.subscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, responseHandler);

    const remove = attachListener(onApproval);

    await bus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      toolCall: { name: 'write_file', args: { path: '/tmp/out.txt' } },
      correlationId: 'corr-1',
    });

    expect(onApproval).toHaveBeenCalledWith({ name: 'write_file' });
    expect(responseHandler).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-1', confirmed: true }),
    );

    remove();
  });

  it('forwards a deny decision to the bus as confirmed=false', async () => {
    const onApproval = vi.fn().mockResolvedValue('deny');
    const responseHandler = vi.fn();
    bus.subscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, responseHandler);

    const remove = attachListener(onApproval);

    await bus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      toolCall: { name: 'run_shell', args: { command: 'rm -rf /' } },
      correlationId: 'corr-2',
    });

    expect(onApproval).toHaveBeenCalledWith({ name: 'run_shell' });
    expect(responseHandler).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-2', confirmed: false }),
    );

    remove();
  });

  it('defaults to deny when the callback throws', async () => {
    const onApproval = vi.fn().mockRejectedValue(new Error('timeout'));
    const responseHandler = vi.fn();
    bus.subscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, responseHandler);

    const remove = attachListener(onApproval);

    await bus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      toolCall: { name: 'delete_file', args: {} },
      correlationId: 'corr-3',
    });

    expect(responseHandler).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-3', confirmed: false }),
    );

    remove();
  });

  it('denies with requiresUserConfirmation when no listener is registered', async () => {
    // This validates the pre-existing bus behaviour: without any subscriber,
    // ASK_USER collapses to a safe denial so headless flows never hang.
    const responseHandler = vi.fn();
    bus.subscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, responseHandler);

    await bus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      toolCall: { name: 'read_file', args: {} },
      correlationId: 'corr-4',
    });

    expect(responseHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-4',
        confirmed: false,
        requiresUserConfirmation: true,
      }),
    );
  });

  it('stops receiving events after the cleanup function is called', async () => {
    const onApproval = vi.fn().mockResolvedValue('allow');
    const responseHandler = vi.fn();
    bus.subscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, responseHandler);

    const remove = attachListener(onApproval);
    remove(); // immediately unsubscribe

    await bus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      toolCall: { name: 'write_file', args: {} },
      correlationId: 'corr-5',
    });

    // Listener was removed, so onApproval must not have been called, and the
    // bus should have emitted the fallback requiresUserConfirmation response.
    expect(onApproval).not.toHaveBeenCalled();
    expect(responseHandler).toHaveBeenCalledWith(
      expect.objectContaining({ requiresUserConfirmation: true }),
    );
  });
});
