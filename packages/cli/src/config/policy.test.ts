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
        r.toolName === '^mcp://my-server/.*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(100);
  });

  it('should deny tools from excluded MCP servers', () => {
    const settings: Settings = {
      mcp: { excluded: ['my-server'] },
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const rule = config.rules?.find(
      (r) =>
        r.toolName === '^mcp://my-server/.*' &&
        r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(200);
  });

  it('should deny replace tool if useSmartEdit is true', () => {
    const settings: Settings = {
      useSmartEdit: true,
    };
    const config = createPolicyEngineConfig(settings, ApprovalMode.DEFAULT);
    const rule = config.rules?.find(
      (r) => r.toolName === 'replace' && r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(200);
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
      (r) => r.toolName === 'edit' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(10);
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
});
