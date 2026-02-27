/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision } from './types.js';
import { USER_POLICY_TIER, ALWAYS_ALLOW_PRIORITY } from './config.js';

describe('PolicyEngine - Issue #20294 Reproduction', () => {
  it('shows that a session-level allow is no longer shadowed by a user policy', async () => {
    const engine = new PolicyEngine({});

    // 1. A rule in a User Policy file
    engine.addRule({
      toolName: 'shell',
      decision: PolicyDecision.ASK_USER,
      priority: USER_POLICY_TIER + 0.05,
      source: 'User Policy File',
    });

    // Verify it asks
    const result1 = await engine.check(
      { name: 'shell', args: { command: 'ls' } },
      undefined,
    );
    expect(result1.decision).toBe(PolicyDecision.ASK_USER);

    // 2. User selects "Allow for this session".
    engine.addRule({
      toolName: 'shell',
      decision: PolicyDecision.ALLOW,
      priority: ALWAYS_ALLOW_PRIORITY,
      source: 'Dynamic (Session)',
    });

    // 3. Verify it allows (FIXED)
    const result2 = await engine.check(
      { name: 'shell', args: { command: 'ls' } },
      undefined,
    );

    expect(result2.decision).toBe(PolicyDecision.ALLOW);
  });
});
