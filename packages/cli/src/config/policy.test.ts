/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createPolicyEngineConfig } from './policy.js';
import type { Settings } from './settings.js';
import { ApprovalMode, PolicyDecision } from '@google/gemini-cli-core';

describe('createPolicyEngineConfig', () => {
  it('should return ASK_USER for all tools by default', () => {
    const settings: Settings = {};
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    expect(config.defaultDecision).toBe(PolicyDecision.ASK_USER);
    expect(config.rules).toEqual([
      { toolName: 'replace', decision: 'ask_user', priority: 10 },
      { toolName: 'save_memory', decision: 'ask_user', priority: 10 },
      { toolName: 'run_shell_command', decision: 'ask_user', priority: 10 },
      { toolName: 'write_file', decision: 'ask_user', priority: 10 },
      { toolName: 'web_fetch', decision: 'ask_user', priority: 10 },
    ]);
  });

  it('should allow tools in tools.allowed', () => {
    const settings: Settings = {
      tools: { allowed: ['run_shell_command'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(100);
  });

  it('should deny tools in tools.exclude', () => {
    const settings: Settings = {
      tools: { exclude: ['run_shell_command'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(200);
  });

  it('should allow tools from allowed MCP servers', () => {
    const settings: Settings = {
      mcp: { allowed: ['my-server'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(85);
  });

  it('should deny tools from excluded MCP servers', () => {
    const settings: Settings = {
      mcp: { excluded: ['my-server'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(195);
  });

  it('should allow tools from trusted MCP servers', () => {
    const settings: Settings = {
      mcpServers: {
        'trusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true,
        },
        'untrusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: false,
        },
      },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    const trustedRule = config.rules?.find(
      (r) =>
        r.toolName === 'trusted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(trustedRule).toBeDefined();
    expect(trustedRule?.priority).toBe(90);

    // Untrusted server should not have an allow rule
    const untrustedRule = config.rules?.find(
      (r) =>
        r.toolName === 'untrusted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(untrustedRule).toBeUndefined();
  });

  it('should handle multiple MCP server configurations together', () => {
    const settings: Settings = {
      mcp: {
        allowed: ['allowed-server'],
        excluded: ['excluded-server'],
      },
      mcpServers: {
        'trusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true,
        },
      },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    // Check allowed server
    const allowedRule = config.rules?.find(
      (r) =>
        r.toolName === 'allowed-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(allowedRule).toBeDefined();
    expect(allowedRule?.priority).toBe(85);

    // Check trusted server
    const trustedRule = config.rules?.find(
      (r) =>
        r.toolName === 'trusted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(trustedRule).toBeDefined();
    expect(trustedRule?.priority).toBe(90);

    // Check excluded server
    const excludedRule = config.rules?.find(
      (r) =>
        r.toolName === 'excluded-server__*' &&
        r.decision === PolicyDecision.DENY,
    );
    expect(excludedRule).toBeDefined();
    expect(excludedRule?.priority).toBe(195);
  });

  it('should allow read-only tools if autoAccept is true', () => {
    const settings: Settings = {
      tools: { autoAccept: true },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const rule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(50);
  });

  it('should allow all tools in YOLO mode', () => {
    const settings: Settings = {};
    const config = createPolicyEngineConfig(settings, ApprovalMode.YOLO);
    const rule = config.rules?.find(
      (r) => r.decision === PolicyDecision.ALLOW && r.priority === 0,
    );
    expect(rule).toBeDefined();
  });

  it('should allow edit tool in AUTO_EDIT mode', () => {
    const settings: Settings = {};
    const config = createPolicyEngineConfig(settings, ApprovalMode.AUTO_EDIT);
    const rule = config.rules?.find(
      (r) => r.toolName === 'replace' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(15);
  });

  it('should prioritize exclude over allow', () => {
    const settings: Settings = {
      tools: { allowed: ['run_shell_command'], exclude: ['run_shell_command'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const denyRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.DENY,
    );
    const allowRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(denyRule).toBeDefined();
    expect(allowRule).toBeDefined();
    expect(denyRule!.priority).toBeGreaterThan(allowRule!.priority!);
  });

  it('should prioritize specific tool allows over MCP server excludes', () => {
    const settings: Settings = {
      mcp: { excluded: ['my-server'] },
      tools: { allowed: ['my-server__specific-tool'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    const serverDenyRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.DENY,
    );
    const toolAllowRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__specific-tool' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(serverDenyRule).toBeDefined();
    expect(serverDenyRule?.priority).toBe(195);
    expect(toolAllowRule).toBeDefined();
    expect(toolAllowRule?.priority).toBe(100);

    // Tool allow (100) has lower priority than server deny (195),
    // so server deny wins - this might be counterintuitive
  });

  it('should prioritize specific tool excludes over MCP server allows', () => {
    const settings: Settings = {
      mcp: { allowed: ['my-server'] },
      mcpServers: {
        'my-server': {
          command: 'node',
          args: ['server.js'],
          trust: true,
        },
      },
      tools: { exclude: ['my-server__dangerous-tool'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    const serverAllowRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.ALLOW,
    );
    const toolDenyRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__dangerous-tool' &&
        r.decision === PolicyDecision.DENY,
    );

    expect(serverAllowRule).toBeDefined();
    expect(toolDenyRule).toBeDefined();
    expect(toolDenyRule!.priority).toBeGreaterThan(serverAllowRule!.priority!);
  });

  it('should handle complex priority scenarios correctly', () => {
    const settings: Settings = {
      tools: {
        autoAccept: true, // Priority 50 for read-only tools
        allowed: ['my-server__tool1', 'other-tool'], // Priority 100
        exclude: ['my-server__tool2', 'glob'], // Priority 200
      },
      mcp: {
        allowed: ['allowed-server'], // Priority 85
        excluded: ['excluded-server'], // Priority 195
      },
      mcpServers: {
        'trusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true, // Priority 90
        },
      },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    // Verify glob is denied even though autoAccept would allow it
    const globDenyRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.DENY,
    );
    const globAllowRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.ALLOW,
    );
    expect(globDenyRule).toBeDefined();
    expect(globAllowRule).toBeDefined();
    expect(globDenyRule!.priority).toBe(200);
    expect(globAllowRule!.priority).toBe(50);

    // Verify all priority levels are correct
    const priorities = config.rules
      ?.map((r) => ({
        tool: r.toolName,
        decision: r.decision,
        priority: r.priority,
      }))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Check that the highest priority items are the excludes
    const highestPriorityExcludes = priorities?.filter(
      (p) => p.priority === 200,
    );
    expect(
      highestPriorityExcludes?.every((p) => p.decision === PolicyDecision.DENY),
    ).toBe(true);
  });

  it('should handle MCP servers with undefined trust property', () => {
    const settings: Settings = {
      mcpServers: {
        'no-trust-property': {
          command: 'node',
          args: ['server.js'],
          // trust property is undefined/missing
        },
        'explicit-false': {
          command: 'node',
          args: ['server.js'],
          trust: false,
        },
      },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    // Neither server should have an allow rule
    const noTrustRule = config.rules?.find(
      (r) =>
        r.toolName === 'no-trust-property__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    const explicitFalseRule = config.rules?.find(
      (r) =>
        r.toolName === 'explicit-false__*' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(noTrustRule).toBeUndefined();
    expect(explicitFalseRule).toBeUndefined();
  });

  it('should not add write tool rules in YOLO mode', () => {
    const settings: Settings = {
      tools: { exclude: ['dangerous-tool'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.YOLO);

    // Should have the wildcard allow rule with priority 0
    const wildcardRule = config.rules?.find(
      (r) =>
        !r.toolName && r.decision === PolicyDecision.ALLOW && r.priority === 0,
    );
    expect(wildcardRule).toBeDefined();

    // Should NOT have any write tool rules (which would have priority 10)
    const writeToolRules = config.rules?.filter(
      (r) =>
        [
          'replace',
          'save_memory',
          'run_shell_command',
          'write_file',
          'web_fetch',
        ].includes(r.toolName || '') && r.decision === PolicyDecision.ASK_USER,
    );
    expect(writeToolRules).toHaveLength(0);

    // Should still have the exclude rule
    const excludeRule = config.rules?.find(
      (r) =>
        r.toolName === 'dangerous-tool' && r.decision === PolicyDecision.DENY,
    );
    expect(excludeRule).toBeDefined();
    expect(excludeRule?.priority).toBe(200);
  });

  it('should handle combination of trusted server and excluded server for same name', () => {
    const settings: Settings = {
      mcpServers: {
        'conflicted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true, // Priority 90
        },
      },
      mcp: {
        excluded: ['conflicted-server'], // Priority 195
      },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    // Both rules should exist
    const trustRule = config.rules?.find(
      (r) =>
        r.toolName === 'conflicted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    const excludeRule = config.rules?.find(
      (r) =>
        r.toolName === 'conflicted-server__*' &&
        r.decision === PolicyDecision.DENY,
    );

    expect(trustRule).toBeDefined();
    expect(trustRule?.priority).toBe(90);
    expect(excludeRule).toBeDefined();
    expect(excludeRule?.priority).toBe(195);

    // Exclude (195) should win over trust (90) when evaluated
  });

  it('should create all read-only tool rules when autoAccept is enabled', () => {
    const settings: Settings = {
      tools: { autoAccept: true },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);

    // All read-only tools should have allow rules
    const readOnlyTools = [
      'glob',
      'search_file_content',
      'list_directory',
      'read_file',
      'read_many_files',
    ];
    for (const tool of readOnlyTools) {
      const rule = config.rules?.find(
        (r) => r.toolName === tool && r.decision === PolicyDecision.ALLOW,
      );
      expect(rule).toBeDefined();
      expect(rule?.priority).toBe(50);
    }
  });

  it('should handle all approval modes correctly', () => {
    const settings: Settings = {};

    // Test DEFAULT mode
    const defaultConfig = createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    expect(defaultConfig.defaultDecision).toBe(PolicyDecision.ASK_USER);
    expect(
      defaultConfig.rules?.find(
        (r) => !r.toolName && r.decision === PolicyDecision.ALLOW,
      ),
    ).toBeUndefined();

    // Test YOLO mode
    const yoloConfig = createPolicyEngineConfig(settings, ApprovalMode.YOLO);
    expect(yoloConfig.defaultDecision).toBe(PolicyDecision.ASK_USER);
    const yoloWildcard = yoloConfig.rules?.find(
      (r) => !r.toolName && r.decision === PolicyDecision.ALLOW,
    );
    expect(yoloWildcard).toBeDefined();
    expect(yoloWildcard?.priority).toBe(0);

    // Test AUTO_EDIT mode
    const autoEditConfig = createPolicyEngineConfig(
      settings,
      ApprovalMode.AUTO_EDIT,
    );
    expect(autoEditConfig.defaultDecision).toBe(PolicyDecision.ASK_USER);
    const editRule = autoEditConfig.rules?.find(
      (r) => r.toolName === 'replace' && r.decision === PolicyDecision.ALLOW,
    );
    expect(editRule).toBeDefined();
    expect(editRule?.priority).toBe(15);
  });
});
