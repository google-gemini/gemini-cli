/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import {
  createPolicyUpdater,
  getAlwaysAllowPriorityFraction,
} from './config.js';
import { PolicyEngine } from './policy-engine.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { Storage, AUTO_SAVED_POLICY_FILENAME } from '../config/storage.js';
import { ApprovalMode } from './types.js';
import { vol, fs as memfs } from 'memfs';

// Use memfs for all fs operations in this test
vi.mock('node:fs/promises', () => import('memfs').then((m) => m.fs.promises));

vi.mock('../config/storage.js');

describe('createPolicyUpdater', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;
  let mockStorage: Storage;

  beforeEach(() => {
    vi.useFakeTimers();
    vol.reset();
    policyEngine = new PolicyEngine({
      rules: [],
      checkers: [],
      approvalMode: ApprovalMode.DEFAULT,
    });
    messageBus = new MessageBus(policyEngine);
    mockStorage = new Storage('/mock/project');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should persist policy when persist flag is true', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    // Policy updater handles persistence asynchronously in a promise queue.
    // We use advanceTimersByTimeAsync to yield to the microtask queue.
    await vi.advanceTimersByTimeAsync(100);

    const fileExists = memfs.existsSync(policyFile);
    expect(fileExists).toBe(true);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    expect(content).toContain('toolName = "test_tool"');
    expect(content).toContain('decision = "allow"');
    const expectedPriority = getAlwaysAllowPriorityFraction();
    expect(content).toContain(`priority = ${expectedPriority}`);
  });

  it('should include allowRedirection when persisting policy', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
      allowRedirection: true,
    });

    await vi.advanceTimersByTimeAsync(100);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    expect(content).toContain('toolName = "test_tool"');
    expect(content).toContain('allowRedirection = true');
  });

  it('should not persist policy when persist flag is false or undefined', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(memfs.existsSync(policyFile)).toBe(false);
  });

  it('should append to existing policy file', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    const existingContent =
      '[[rule]]\ntoolName = "existing_tool"\ndecision = "allow"\n';
    const dir = path.dirname(policyFile);
    memfs.mkdirSync(dir, { recursive: true });
    memfs.writeFileSync(policyFile, existingContent);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'new_tool',
      persist: true,
    });

    await vi.advanceTimersByTimeAsync(100);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    expect(content).toContain('toolName = "existing_tool"');
    expect(content).toContain('toolName = "new_tool"');
  });

  it('should handle toml with multiple rules correctly', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    const existingContent = `
[[rule]]
toolName = "tool1"
decision = "allow"

[[rule]]
toolName = "tool2"
decision = "deny"
`;
    const dir = path.dirname(policyFile);
    memfs.mkdirSync(dir, { recursive: true });
    memfs.writeFileSync(policyFile, existingContent);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'tool3',
      persist: true,
    });

    await vi.advanceTimersByTimeAsync(100);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    expect(content).toContain('toolName = "tool1"');
    expect(content).toContain('toolName = "tool2"');
    expect(content).toContain('toolName = "tool3"');
  });

  it('should include argsPattern if provided', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
      argsPattern: '^foo.*$',
    });

    await vi.advanceTimersByTimeAsync(100);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    expect(content).toContain('argsPattern = "^foo.*$"');
  });

  it('should include mcpName if provided', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'search"tool"',
      persist: true,
      mcpName: 'my"jira"server',
    });

    await vi.advanceTimersByTimeAsync(100);

    const writtenContent = memfs.readFileSync(policyFile, 'utf-8') as string;

    // Verify escaping - should be valid TOML and contain the values
    // Note: @iarna/toml optimizes for shortest representation, so it may use single quotes 'foo"bar'
    // instead of "foo\"bar\"" if there are no single quotes in the string.
    try {
      expect(writtenContent).toContain('mcpName = "my\\"jira\\"server"');
    } catch {
      expect(writtenContent).toContain('mcpName = \'my"jira"server\'');
    }

    try {
      expect(writtenContent).toContain('toolName = "search\\"tool\\""');
    } catch {
      expect(writtenContent).toContain('toolName = \'search"tool"\'');
    }
  });

  it('should persist to workspace when persistScope is workspace', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const workspacePoliciesDir = '/mock/project/.gemini/policies';
    const policyFile = path.join(
      workspacePoliciesDir,
      AUTO_SAVED_POLICY_FILENAME,
    );
    vi.spyOn(mockStorage, 'getWorkspaceAutoSavedPolicyPath').mockReturnValue(
      policyFile,
    );

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
      persistScope: 'workspace',
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(memfs.existsSync(policyFile)).toBe(true);
    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    expect(content).toContain('toolName = "test_tool"');
  });

  it('should include modes if provided', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
      modes: [ApprovalMode.DEFAULT, ApprovalMode.YOLO],
    });

    await vi.advanceTimersByTimeAsync(100);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    expect(content).toContain('modes = [ "default", "yolo" ]');
  });

  it('should update existing rule modes instead of appending redundant rule', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const policyFile = '/mock/user/.gemini/policies/auto-saved.toml';
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    const existingContent = `
[[rule]]
decision = "allow"
priority = 950
toolName = "test_tool"
modes = [ "autoEdit", "yolo" ]
`;
    const dir = path.dirname(policyFile);
    memfs.mkdirSync(dir, { recursive: true });
    memfs.writeFileSync(policyFile, existingContent);

    // Now grant in DEFAULT mode, which should include [default, autoEdit, yolo]
    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
      modes: [ApprovalMode.DEFAULT, ApprovalMode.AUTO_EDIT, ApprovalMode.YOLO],
    });

    await vi.advanceTimersByTimeAsync(100);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    // Should NOT have two [[rule]] entries for test_tool
    const ruleCount = (content.match(/\[\[rule\]\]/g) || []).length;
    expect(ruleCount).toBe(1);
    expect(content).toContain('modes = [ "default", "autoEdit", "yolo" ]');
  });
});
