/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegatedConfirmationStrategy } from './DelegatedConfirmationStrategy.js';
import { MessageBus } from '../../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type ToolConfirmationRequest,
} from '../../confirmation-bus/types.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import type { PolicyEngine } from '../../policy/policy-engine.js';
import { PolicyDecision } from '../../policy/types.js';

describe('DelegatedConfirmationStrategy', () => {
  let messageBus: MessageBus;
  let strategy: DelegatedConfirmationStrategy;
  let mockPolicyEngine: PolicyEngine;

  beforeEach(() => {
    mockPolicyEngine = {
      check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ASK_USER }),
    } as unknown as PolicyEngine;
    messageBus = new MessageBus(mockPolicyEngine);
    strategy = new DelegatedConfirmationStrategy(messageBus);
  });

  it('should ignore responses with requiresUserConfirmation=true and wait for actual confirmation', async () => {
    const toolCall = {
      name: 'test',
      args: {},
      callId: '1',
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    };
    const confirmationDetails = {
      type: 'info' as const,
      title: 'Test',
      prompt: 'Confirm?',
      onConfirm: vi.fn(),
    };
    const abortController = new AbortController();

    // Simulate CoreToolScheduler's sharedHandler
    messageBus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      (request: ToolConfirmationRequest) => {
        void messageBus.publish({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: request.correlationId,
          confirmed: false,
          requiresUserConfirmation: true,
        });
      },
    );

    const confirmPromise = strategy.confirm(
      toolCall,
      confirmationDetails,
      abortController.signal,
    );

    // Give it a moment to process the immediate response from sharedHandler
    await new Promise((resolve) => setTimeout(resolve, 10));

    // It should NOT have resolved yet
    let resolved = false;
    void confirmPromise.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);

    // Now simulate UI response
    // We need to capture the correlationId. Since we can't easily get it from inside confirm,
    // we can spy on publish or just rely on the fact that sharedHandler ran and we can't easily intercept the *same* request object unless we spy.
    // However, the sharedHandler loopback proves that *a* response was sent.

    // To send a valid UI response, we need the correlationId.
    // Let's spy on messageBus.publish to get the request.
    // const publishSpy = vi.spyOn(messageBus, 'publish');

    // Re-run the setup to capture the spy
    messageBus = new MessageBus(mockPolicyEngine);
    strategy = new DelegatedConfirmationStrategy(messageBus);
    const publishSpy2 = vi.spyOn(messageBus, 'publish');

    messageBus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      (request: ToolConfirmationRequest) => {
        // Send the "ignore me" response
        void messageBus.publish({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: request.correlationId,
          confirmed: false,
          requiresUserConfirmation: true,
        });
      },
    );

    const confirmPromise2 = strategy.confirm(
      toolCall,
      confirmationDetails,
      abortController.signal,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Get the correlation ID from the request
    const requestCall = publishSpy2.mock.calls.find(
      (call) =>
        (call[0] as ToolConfirmationRequest).type ===
        MessageBusType.TOOL_CONFIRMATION_REQUEST,
    );
    const correlationId = (requestCall![0] as ToolConfirmationRequest)
      .correlationId;

    // Send the real UI response
    await messageBus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: true,
    });

    const result = await confirmPromise2;
    expect(result).toBe(ToolConfirmationOutcome.ProceedOnce);
  });

  it('should cancel if response has requiresUserConfirmation=false and confirmed=false', async () => {
    const toolCall = {
      name: 'test',
      args: {},
      callId: '1',
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    };
    const confirmationDetails = {
      type: 'info' as const,
      title: 'Test',
      prompt: 'Confirm?',
      onConfirm: vi.fn(),
    };
    const abortController = new AbortController();

    // Simulate Policy Deny (or UI Cancel)
    messageBus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      (request: ToolConfirmationRequest) => {
        void messageBus.publish({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: request.correlationId,
          confirmed: false,
          requiresUserConfirmation: false, // Explicit denial
        });
      },
    );

    const result = await strategy.confirm(
      toolCall,
      confirmationDetails,
      abortController.signal,
    );
    expect(result).toBe(ToolConfirmationOutcome.Cancel);
  });
});
