/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { loadPoliciesFromToml } from './toml-loader.js';
import { PolicyEngine } from './policy-engine.js';
import { ApprovalMode, PolicyDecision } from './types.js';
import { UPDATE_TOPIC_TOOL_NAME } from '../tools/tool-names.js';

describe('Topic Tool Policy', () => {
  async function loadDefaultPolicies() {
    // Path relative to packages/core root
    const policiesDir = path.resolve(process.cwd(), 'src/policy/policies');
    const getPolicyTier = () => 1; // Default tier
    const result = await loadPoliciesFromToml([policiesDir], getPolicyTier);
    return result.rules;
  }

  it('should allow update_topic in DEFAULT mode', async () => {
    const rules = await loadDefaultPolicies();
    const engine = new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.DEFAULT,
    });

    const result = await engine.check(
      { name: UPDATE_TOPIC_TOOL_NAME },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow update_topic in PLAN mode', async () => {
    const rules = await loadDefaultPolicies();
    const engine = new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.PLAN,
    });

    const result = await engine.check(
      { name: UPDATE_TOPIC_TOOL_NAME },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow update_topic in YOLO mode', async () => {
    const rules = await loadDefaultPolicies();
    const engine = new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.YOLO,
    });

    const result = await engine.check(
      { name: UPDATE_TOPIC_TOOL_NAME },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });
});
