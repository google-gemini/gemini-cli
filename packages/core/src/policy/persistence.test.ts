/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
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
import { coreEvents } from '../utils/events.js';

// Use memfs for all fs operations in this test
vi.mock('node:fs/promises', () => import('memfs').then((m) => m.fs.promises));

/**
 * Creates a Node.js-style error with a `code` property.
 */
function makeNodeError(message: string, code: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

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


  it('should include error details in feedback message on persistence failure', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const workspacePoliciesDir = '/mock/project/.gemini/policies';
    const policyFile = path.join(
      workspacePoliciesDir,
      AUTO_SAVED_POLICY_FILENAME,
    );
    vi.spyOn(mockStorage, 'getWorkspacePoliciesDir').mockReturnValue(
      workspacePoliciesDir,
    );
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    vi.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Permission denied'));

    const feedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.runAllTimersAsync();
      expect(feedbackSpy).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Permission denied'),
        expect.any(Error),
      );
    
  });

  it('should clean up tmp file on write failure', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const workspacePoliciesDir = '/mock/project/.gemini/policies';
    const policyFile = path.join(
      workspacePoliciesDir,
      AUTO_SAVED_POLICY_FILENAME,
    );
    vi.spyOn(mockStorage, 'getWorkspacePoliciesDir').mockReturnValue(
      workspacePoliciesDir,
    );
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined as never);
    vi.spyOn(fs, 'readFile').mockRejectedValue(makeNodeError('ENOENT: no such file or directory', 'ENOENT'));

    const mockFileHandle = {
      writeFile: vi.fn().mockRejectedValue(new Error('Disk full')),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(fs, 'open').mockResolvedValue(mockFileHandle as never);
    vi.spyOn(fs, 'unlink').mockResolvedValue(undefined as never);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.runAllTimersAsync();
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/));
    
  });

  it('should abort persistence on non-ENOENT read errors', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const workspacePoliciesDir = '/mock/project/.gemini/policies';
    const policyFile = path.join(
      workspacePoliciesDir,
      AUTO_SAVED_POLICY_FILENAME,
    );
    vi.spyOn(mockStorage, 'getWorkspacePoliciesDir').mockReturnValue(
      workspacePoliciesDir,
    );
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined as never);
    vi.spyOn(fs, 'readFile').mockRejectedValue(makeNodeError('Permission denied', 'EACCES'));
    const openSpy = vi.spyOn(fs, 'open');

    const feedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.runAllTimersAsync();
      expect(openSpy).not.toHaveBeenCalled();
      expect(feedbackSpy).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Permission denied'),
        expect.any(Error),
      );
    
  });

  it('should fall back to copy+unlink when rename fails with EXDEV', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const workspacePoliciesDir = '/mock/project/.gemini/policies';
    const policyFile = path.join(
      workspacePoliciesDir,
      AUTO_SAVED_POLICY_FILENAME,
    );
    vi.spyOn(mockStorage, 'getWorkspacePoliciesDir').mockReturnValue(
      workspacePoliciesDir,
    );
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined as never);
    vi.spyOn(fs, 'readFile').mockRejectedValue(makeNodeError('ENOENT: no such file or directory', 'ENOENT'));

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(fs, 'open').mockResolvedValue(mockFileHandle as never);
    vi.spyOn(fs, 'rename').mockRejectedValue(makeNodeError('EXDEV: cross-device link not permitted', 'EXDEV'));
    vi.spyOn(fs, 'copyFile').mockResolvedValue(undefined as never);
    vi.spyOn(fs, 'unlink').mockResolvedValue(undefined as never);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.runAllTimersAsync();
      expect(fs.copyFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        policyFile,
      );
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/));
    
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

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
      modes: [ApprovalMode.DEFAULT, ApprovalMode.AUTO_EDIT, ApprovalMode.YOLO],
    });

    await vi.advanceTimersByTimeAsync(100);

    const content = memfs.readFileSync(policyFile, 'utf-8') as string;
    const ruleCount = (content.match(/\[\[rule\]\]/g) || []).length;
    expect(ruleCount).toBe(1);
    expect(content).toContain('modes = [ "default", "autoEdit", "yolo" ]');
  });
});