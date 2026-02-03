/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { ApprovalMode, PolicyDecision } from './types.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { createPolicyUpdater } from './config.js';

describe('PolicyEngine Redirection Session', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;

  beforeEach(() => {
    policyEngine = new PolicyEngine({
      defaultDecision: PolicyDecision.ALLOW,
      approvalMode: ApprovalMode.DEFAULT,
    });
    messageBus = new MessageBus(policyEngine);
    createPolicyUpdater(policyEngine, messageBus);
  });

  it('should downgrade for redirection by default', async () => {
    const result = await policyEngine.check(
      { name: 'run_shell_command', args: { command: 'echo test > file.txt' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should NOT downgrade for redirection after ALLOW_SESSION_REDIRECTION message', async () => {
    // Publish the allow session redirection message
    await messageBus.publish({
      type: MessageBusType.ALLOW_SESSION_REDIRECTION,
    });

    const result = await policyEngine.check(
      { name: 'run_shell_command', args: { command: 'echo test > file.txt' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should still downgrade for redirection if another session starts (new PolicyEngine)', async () => {
    // Simulate new session/engine
    const newEngine = new PolicyEngine({
      defaultDecision: PolicyDecision.ALLOW,
      approvalMode: ApprovalMode.DEFAULT,
    });

    const result = await newEngine.check(
      { name: 'run_shell_command', args: { command: 'echo test > file.txt' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });
});
