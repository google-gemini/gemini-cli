/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  ApprovalMode,
  PolicyDecision,
  PolicyEngine,
} from '@google/gemini-cli-core';
import { createPolicyEngineConfig } from './policy.js';
import type { Settings } from './settings.js';

describe('Policy Engine Integration Tests', () => {
  describe('Policy configuration produces valid PolicyEngine config', () => {
    it('should create a working PolicyEngine from basic settings', async () => {
      const settings: Settings = {
        tools: {
          allowed: ['run_shell_command'],
          exclude: ['write_file'],
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // Allowed tool should be allowed
      expect(engine.check({ name: 'run_shell_command' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );

      // Excluded tool should be denied
      expect(engine.check({ name: 'write_file' }, undefined)).toBe(
        PolicyDecision.DENY,
      );

      // Other write tools should ask user
      expect(engine.check({ name: 'replace' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );

      // Unknown tools should use default
      expect(engine.check({ name: 'unknown_tool' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should handle MCP server wildcard patterns correctly', async () => {
      const settings: Settings = {
        mcp: {
          allowed: ['allowed-server'],
          excluded: ['blocked-server'],
        },
        mcpServers: {
          'trusted-server': {
            command: 'node',
            args: ['server.js'],
            trust: true,
          },
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // Tools from allowed server should be allowed
      expect(engine.check({ name: 'allowed-server__tool1' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(
        engine.check({ name: 'allowed-server__another_tool' }, undefined),
      ).toBe(PolicyDecision.ALLOW);

      // Tools from trusted server should be allowed
      expect(engine.check({ name: 'trusted-server__tool1' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(
        engine.check({ name: 'trusted-server__special_tool' }, undefined),
      ).toBe(PolicyDecision.ALLOW);

      // Tools from blocked server should be denied
      expect(engine.check({ name: 'blocked-server__tool1' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
      expect(
        engine.check({ name: 'blocked-server__any_tool' }, undefined),
      ).toBe(PolicyDecision.DENY);

      // Tools from unknown servers should use default
      expect(engine.check({ name: 'unknown-server__tool' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should correctly prioritize specific tool excludes over MCP server wildcards', async () => {
      const settings: Settings = {
        mcp: {
          allowed: ['my-server'],
        },
        tools: {
          exclude: ['my-server__dangerous-tool'],
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // MCP server allowed (priority 2.1) provides general allow for server
      expect(engine.check({ name: 'my-server__safe-tool' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      // But specific tool exclude (priority 2.4) wins over server allow
      expect(
        engine.check({ name: 'my-server__dangerous-tool' }, undefined),
      ).toBe(PolicyDecision.DENY);
    });

    it('should handle complex mixed configurations', async () => {
      const settings: Settings = {
        tools: {
          autoAccept: true, // Allows read-only tools
          allowed: ['custom-tool', 'my-server__special-tool'],
          exclude: ['glob', 'dangerous-tool'],
        },
        mcp: {
          allowed: ['allowed-server'],
          excluded: ['blocked-server'],
        },
        mcpServers: {
          'trusted-server': {
            command: 'node',
            args: ['server.js'],
            trust: true,
          },
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // Read-only tools should be allowed (autoAccept)
      expect(engine.check({ name: 'read_file' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'list_directory' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );

      // But glob is explicitly excluded, so it should be denied
      expect(engine.check({ name: 'glob' }, undefined)).toBe(
        PolicyDecision.DENY,
      );

      // Replace should ask user (normal write tool behavior)
      expect(engine.check({ name: 'replace' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );

      // Explicitly allowed tools
      expect(engine.check({ name: 'custom-tool' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'my-server__special-tool' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );

      // MCP server tools
      expect(engine.check({ name: 'allowed-server__tool' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'trusted-server__tool' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'blocked-server__tool' }, undefined)).toBe(
        PolicyDecision.DENY,
      );

      // Write tools should ask by default
      expect(engine.check({ name: 'write_file' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should handle YOLO mode correctly', async () => {
      const settings: Settings = {
        tools: {
          exclude: ['dangerous-tool'], // Even in YOLO, excludes should be respected
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.YOLO,
      );
      const engine = new PolicyEngine(config);

      // Most tools should be allowed in YOLO mode
      expect(engine.check({ name: 'run_shell_command' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'write_file' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'unknown_tool' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );

      // But explicitly excluded tools should still be denied
      expect(engine.check({ name: 'dangerous-tool' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should handle AUTO_EDIT mode correctly', async () => {
      const settings: Settings = {};

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.AUTO_EDIT,
      );
      const engine = new PolicyEngine(config);

      // Edit tools should be allowed in AUTO_EDIT mode
      expect(engine.check({ name: 'replace' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'write_file' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );

      // Other tools should follow normal rules
      expect(engine.check({ name: 'run_shell_command' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should verify priority ordering works correctly in practice', async () => {
      const settings: Settings = {
        tools: {
          autoAccept: true, // Priority 50
          allowed: ['specific-tool'], // Priority 100
          exclude: ['blocked-tool'], // Priority 200
        },
        mcp: {
          allowed: ['mcp-server'], // Priority 85
          excluded: ['blocked-server'], // Priority 195
        },
        mcpServers: {
          'trusted-server': {
            command: 'node',
            args: ['server.js'],
            trust: true, // Priority 90
          },
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // Test that priorities are applied correctly
      const rules = config.rules || [];

      // Find rules and verify their priorities
      const blockedToolRule = rules.find((r) => r.toolName === 'blocked-tool');
      expect(blockedToolRule?.priority).toBe(2.4); // Command line exclude

      const blockedServerRule = rules.find(
        (r) => r.toolName === 'blocked-server__*',
      );
      expect(blockedServerRule?.priority).toBe(2.9); // MCP server exclude

      const specificToolRule = rules.find(
        (r) => r.toolName === 'specific-tool',
      );
      expect(specificToolRule?.priority).toBe(2.3); // Command line allow

      const trustedServerRule = rules.find(
        (r) => r.toolName === 'trusted-server__*',
      );
      expect(trustedServerRule?.priority).toBe(2.2); // MCP trusted server

      const mcpServerRule = rules.find((r) => r.toolName === 'mcp-server__*');
      expect(mcpServerRule?.priority).toBe(2.1); // MCP allowed server

      const readOnlyToolRule = rules.find((r) => r.toolName === 'glob');
      // Priority 50 in default tier → 1.05
      expect(readOnlyToolRule?.priority).toBeCloseTo(1.05, 5);

      // Verify the engine applies these priorities correctly
      expect(engine.check({ name: 'blocked-tool' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'blocked-server__any' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'specific-tool' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'trusted-server__any' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'mcp-server__any' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'glob' }, undefined)).toBe(
        PolicyDecision.ALLOW,
      );
    });

    it('should handle edge case: MCP server with both trust and exclusion', async () => {
      const settings: Settings = {
        mcpServers: {
          'conflicted-server': {
            command: 'node',
            args: ['server.js'],
            trust: true, // Priority 90 - ALLOW
          },
        },
        mcp: {
          excluded: ['conflicted-server'], // Priority 195 - DENY
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // Exclusion (195) should win over trust (90)
      expect(engine.check({ name: 'conflicted-server__tool' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should handle edge case: specific tool allowed but server excluded', async () => {
      const settings: Settings = {
        mcp: {
          excluded: ['my-server'], // Priority 195 - DENY
        },
        tools: {
          allowed: ['my-server__special-tool'], // Priority 100 - ALLOW
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // Server exclusion (195) wins over specific tool allow (100)
      // This might be counterintuitive but follows the priority system
      expect(engine.check({ name: 'my-server__special-tool' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'my-server__other-tool' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should verify non-interactive mode transformation', async () => {
      const settings: Settings = {};

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      // Enable non-interactive mode
      const engineConfig = { ...config, nonInteractive: true };
      const engine = new PolicyEngine(engineConfig);

      // ASK_USER should become DENY in non-interactive mode
      expect(engine.check({ name: 'unknown_tool' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'run_shell_command' }, undefined)).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should handle empty settings gracefully', async () => {
      const settings: Settings = {};

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const engine = new PolicyEngine(config);

      // Should have default rules for write tools
      expect(engine.check({ name: 'write_file' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );
      expect(engine.check({ name: 'replace' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );

      // Unknown tools should use default
      expect(engine.check({ name: 'unknown' }, undefined)).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should verify rules are created with correct priorities', async () => {
      const settings: Settings = {
        tools: {
          autoAccept: true,
          allowed: ['tool1', 'tool2'],
          exclude: ['tool3'],
        },
        mcp: {
          allowed: ['server1'],
          excluded: ['server2'],
        },
      };

      const config = await createPolicyEngineConfig(
        settings,
        ApprovalMode.DEFAULT,
      );
      const rules = config.rules || [];

      // Verify each rule has the expected priority
      const tool3Rule = rules.find((r) => r.toolName === 'tool3');
      expect(tool3Rule?.priority).toBe(2.4); // Excluded tools (user tier)

      const server2Rule = rules.find((r) => r.toolName === 'server2__*');
      expect(server2Rule?.priority).toBe(2.9); // Excluded servers (user tier)

      const tool1Rule = rules.find((r) => r.toolName === 'tool1');
      expect(tool1Rule?.priority).toBe(2.3); // Allowed tools (user tier)

      const server1Rule = rules.find((r) => r.toolName === 'server1__*');
      expect(server1Rule?.priority).toBe(2.1); // Allowed servers (user tier)

      const globRule = rules.find((r) => r.toolName === 'glob');
      // Priority 50 in default tier → 1.05
      expect(globRule?.priority).toBeCloseTo(1.05, 5); // Auto-accept read-only

      // The PolicyEngine will sort these by priority when it's created
      const engine = new PolicyEngine(config);
      const sortedRules = engine.getRules();

      // Verify the engine sorted them correctly
      for (let i = 1; i < sortedRules.length; i++) {
        const prevPriority = sortedRules[i - 1].priority ?? 0;
        const currPriority = sortedRules[i].priority ?? 0;
        expect(prevPriority).toBeGreaterThanOrEqual(currPriority);
      }
    });
  });
});
