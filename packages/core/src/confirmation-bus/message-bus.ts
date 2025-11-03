/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import { MessageBusType, type Message } from './types.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type { CheckerRunner } from '../safety/checker-runner.js';

export class MessageBus extends EventEmitter {
  constructor(
    private readonly policyEngine: PolicyEngine,
    private readonly checkerRunner?: CheckerRunner,
    private readonly debug = false,
  ) {
    super();
    this.debug = debug;
  }

  private isValidMessage(message: Message): boolean {
    if (!message || !message.type) {
      return false;
    }

    if (
      message.type === MessageBusType.TOOL_CONFIRMATION_REQUEST &&
      !('correlationId' in message)
    ) {
      return false;
    }

    return true;
  }

  private emitMessage(message: Message): void {
    this.emit(message.type, message);
  }

  async publish(message: Message): Promise<void> {
    if (this.debug) {
      console.debug(`[MESSAGE_BUS] publish: ${safeJsonStringify(message)}`);
    }
    try {
      if (!this.isValidMessage(message)) {
        throw new Error(
          `Invalid message structure: ${safeJsonStringify(message)}`,
        );
      }

      if (message.type === MessageBusType.TOOL_CONFIRMATION_REQUEST) {
        const { decision, rule } = this.policyEngine.check(message.toolCall);

        if (
          decision === PolicyDecision.ALLOW &&
          rule?.safety_checker &&
          this.checkerRunner
        ) {
          // If allowed by policy but has a safety checker, run it
          try {
            const result = await this.checkerRunner.runChecker(
              message.toolCall,
              rule.safety_checker,
            );

            if (!result.allowed) {
              // Checker denied it, treat as policy rejection
              this.emitMessage({
                type: MessageBusType.TOOL_POLICY_REJECTION,
                toolCall: message.toolCall,
              });
              this.emitMessage({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: message.correlationId,
                confirmed: false,
              });
              return;
            }
            // If allowed by checker, proceed to standard ALLOW handling below
          } catch (error) {
            // If checker fails to run, deny by default for safety
            this.emit('error', error);
            this.emitMessage({
              type: MessageBusType.TOOL_POLICY_REJECTION,
              toolCall: message.toolCall,
            });
            this.emitMessage({
              type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
              correlationId: message.correlationId,
              confirmed: false,
            });
            return;
          }
        }

        switch (decision) {
          case PolicyDecision.ALLOW:
            // Directly emit the response instead of recursive publish
            this.emitMessage({
              type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
              correlationId: message.correlationId,
              confirmed: true,
            });
            break;
          case PolicyDecision.DENY:
            // Emit both rejection and response messages
            this.emitMessage({
              type: MessageBusType.TOOL_POLICY_REJECTION,
              toolCall: message.toolCall,
            });
            this.emitMessage({
              type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
              correlationId: message.correlationId,
              confirmed: false,
            });
            break;
          case PolicyDecision.ASK_USER:
            // Pass through to UI for user confirmation
            this.emitMessage(message);
            break;
          default:
            throw new Error(`Unknown policy decision: ${decision}`);
        }
      } else {
        // For all other message types, just emit them
        this.emitMessage(message);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  subscribe<T extends Message>(
    type: T['type'],
    listener: (message: T) => void,
  ): void {
    this.on(type, listener);
  }

  unsubscribe<T extends Message>(
    type: T['type'],
    listener: (message: T) => void,
  ): void {
    this.off(type, listener);
  }
}
