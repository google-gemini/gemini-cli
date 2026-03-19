/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPoliciesFromToml } from './toml-loader.js';
import { PolicyEngine } from './policy-engine.js';
import { ApprovalMode, PolicyDecision } from './types.js';
import { CREATE_NEW_TOPIC_TOOL_NAME } from '../tools/tool-names.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Topic Tool Policy', () => {
  async function loadDefaultPolicies() {
    const policiesDir = path.resolve(__dirname, 'policies');
    const getPolicyTier = () => 1; // Default tier
    const result = await loadPoliciesFromToml([policiesDir], getPolicyTier);
    return result.rules;
  }

  it('should allow create_new_topic in DEFAULT mode', async () => {
    const rules = await loadDefaultPolicies();
    const engine = new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.DEFAULT,
    });

    const result = await engine.check(
      { name: CREATE_NEW_TOPIC_TOOL_NAME },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow create_new_topic in PLAN mode', async () => {
    const rules = await loadDefaultPolicies();
    const engine = new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.PLAN,
    });

    const result = await engine.check(
      { name: CREATE_NEW_TOPIC_TOOL_NAME },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow create_new_topic in YOLO mode', async () => {
    const rules = await loadDefaultPolicies();
    const engine = new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.YOLO,
    });

    const result = await engine.check(
      { name: CREATE_NEW_TOPIC_TOOL_NAME },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });
});
