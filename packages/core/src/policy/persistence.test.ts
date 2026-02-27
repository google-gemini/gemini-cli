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
    vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

    const feedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.waitFor(() => {
      expect(feedbackSpy).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Permission denied'),
        expect.any(Error),
      );
    });
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
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(
      makeNodeError('ENOENT: no such file or directory', 'ENOENT'),
    );

    const mockFileHandle = {
      writeFile: vi.fn().mockRejectedValue(new Error('Disk full')),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(fs.open).mockResolvedValue(mockFileHandle);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.waitFor(() => {
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/));
    });
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
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(
      makeNodeError('Permission denied', 'EACCES'),
    );

    const feedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.waitFor(() => {
      expect(fs.open).not.toHaveBeenCalled();
      expect(feedbackSpy).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Permission denied'),
        expect.any(Error),
      );
    });
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
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(
      makeNodeError('ENOENT: no such file or directory', 'ENOENT'),
    );

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(fs.open).mockResolvedValue(mockFileHandle);
    vi.mocked(fs.rename).mockRejectedValue(
      makeNodeError('EXDEV: cross-device link not permitted', 'EXDEV'),
    );
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await vi.waitFor(() => {
      expect(fs.copyFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        policyFile,
      );
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/));
    });
  });
});