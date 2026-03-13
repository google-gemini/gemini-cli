/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PolicyDecision, ApprovalMode } from '../types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPoliciesFromToml } from '../toml-loader.js';
import { PolicyEngine } from '../policy-engine.js';
import {
  TRACKER_CREATE_TASK_TOOL_NAME,
  TRACKER_UPDATE_TASK_TOOL_NAME,
  TRACKER_GET_TASK_TOOL_NAME,
  TRACKER_LIST_TASKS_TOOL_NAME,
  TRACKER_ADD_DEPENDENCY_TOOL_NAME,
  TRACKER_VISUALIZE_TOOL_NAME,
} from '../../tools/tool-names.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Tracker Policy Integrity', () => {
  it('should load tracker.toml and allow all tracker tools', async () => {
    const trackerTomlPath = path.resolve(__dirname, 'tracker.toml');
    const fileContent = await fs.readFile(trackerTomlPath, 'utf-8');
    const tempPolicyDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'tracker-policy-test-'),
    );

    try {
      await fs.writeFile(path.join(tempPolicyDir, 'tracker.toml'), fileContent);
      const getPolicyTier = () => 1; // Default tier

      // 1. Load the tracker policies
      const result = await loadPoliciesFromToml([tempPolicyDir], getPolicyTier);
      expect(result.errors).toHaveLength(0);

      // 2. Initialize Policy Engine
      const engine = new PolicyEngine({
        rules: result.rules,
        approvalMode: ApprovalMode.DEFAULT,
      });

      // 3. Verify all tracker tools are allowed
      const trackerTools = [
        TRACKER_CREATE_TASK_TOOL_NAME,
        TRACKER_UPDATE_TASK_TOOL_NAME,
        TRACKER_GET_TASK_TOOL_NAME,
        TRACKER_LIST_TASKS_TOOL_NAME,
        TRACKER_ADD_DEPENDENCY_TOOL_NAME,
        TRACKER_VISUALIZE_TOOL_NAME,
      ];

      for (const toolName of trackerTools) {
        const checkResult = await engine.check({ name: toolName }, undefined);
        expect(
          checkResult.decision,
          `Tool ${toolName} should be ALLOWED by tracker.toml`,
        ).toBe(PolicyDecision.ALLOW);
        expect(checkResult.rule?.priority).toBe(1.05); // Tier 1 + 50/1000
      }

      // 4. Verify a non-tracker tool is NOT allowed by this policy
      const otherResult = await engine.check(
        { name: 'run_shell_command' },
        undefined,
      );
      expect(otherResult.decision).toBe(PolicyDecision.ASK_USER); // Default decision
    } finally {
      await fs.rm(tempPolicyDir, { recursive: true, force: true });
    }
  });
});
