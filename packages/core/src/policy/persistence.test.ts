/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createPolicyUpdater, ALWAYS_ALLOW_PRIORITY } from './config.js';
import { PolicyEngine } from './policy-engine.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { Storage, AUTO_SAVED_POLICY_FILENAME } from '../config/storage.js';
import { ApprovalMode } from './types.js';

vi.mock('node:fs/promises');
vi.mock('../config/storage.js');

describe('createPolicyUpdater', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;
  let mockStorage: Storage;

  beforeEach(() => {
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
  });

  it('should persist policy when persist flag is true', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    ); // Simulate new file

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (fs.open as unknown as Mock).mockResolvedValue(mockFileHandle);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const toolName = 'test_tool';
    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
    });

    // Wait for async operations (microtasks)
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(policyFile), {
      recursive: true,
    });

    expect(fs.open).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), 'wx');

    // Check written content
    const expectedContent = expect.stringContaining(`toolName = "test_tool"`);
    expect(mockFileHandle.writeFile).toHaveBeenCalledWith(
      expectedContent,
      'utf-8',
    );
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      policyFile,
    );
  });

  it('should not persist policy when persist flag is false or undefined', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it('should persist policy with commandPrefix when provided', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (fs.open as unknown as Mock).mockResolvedValue(mockFileHandle);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const toolName = 'run_shell_command';
    const commandPrefix = 'git status';

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
      commandPrefix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // In-memory rule check (unchanged)
    const rules = policyEngine.getRules();
    const addedRule = rules.find((r) => r.toolName === toolName);
    expect(addedRule).toBeDefined();
    expect(addedRule?.priority).toBe(ALWAYS_ALLOW_PRIORITY);
    expect(addedRule?.argsPattern).toEqual(
      new RegExp(`"command":"git\\ status(?:[\\s"]|\\\\")`),
    );

    // Verify file written
    expect(fs.open).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), 'wx');
    expect(mockFileHandle.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(`commandPrefix = "git status"`),
      'utf-8',
    );
  });

  it('should persist policy with mcpName and toolName when provided', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (fs.open as unknown as Mock).mockResolvedValue(mockFileHandle);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const mcpName = 'my-jira-server';
    const simpleToolName = 'search';
    const toolName = `${mcpName}__${simpleToolName}`;

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
      mcpName,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify file written
    expect(fs.open).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), 'wx');
    const writeCall = mockFileHandle.writeFile.mock.calls[0];
    const writtenContent = writeCall[0] as string;
    expect(writtenContent).toContain(`mcpName = "${mcpName}"`);
    expect(writtenContent).toContain(`toolName = "${simpleToolName}"`);
    expect(writtenContent).toContain('priority = 200');
  });

  it('should escape special characters in toolName and mcpName', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (fs.open as unknown as Mock).mockResolvedValue(mockFileHandle);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const mcpName = 'my"jira"server';
    const toolName = `my"jira"server__search"tool"`;

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
      mcpName,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fs.open).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), 'wx');
    const writeCall = mockFileHandle.writeFile.mock.calls[0];
    const writtenContent = writeCall[0] as string;

    // Verify escaping - should be valid TOML
    // Note: @iarna/toml optimizes for shortest representation, so it may use single quotes 'foo"bar'
    // instead of "foo\"bar\"" if there are no single quotes in the string.
    try {
      expect(writtenContent).toContain(`mcpName = "my\\"jira\\"server"`);
    } catch {
      expect(writtenContent).toContain(`mcpName = 'my"jira"server'`);
    }

    try {
      expect(writtenContent).toContain(`toolName = "search\\"tool\\""`);
    } catch {
      expect(writtenContent).toContain(`toolName = 'search"tool"'`);
    }
  });

  it('should not persist duplicate rules', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);

    // Simulate an existing file that already has the same rule
    const existingContent =
      '[[rule]]\ntoolName = "test_tool"\ndecision = "allow"\npriority = 100\n';
    (fs.readFile as unknown as Mock).mockResolvedValue(existingContent);

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (fs.open as unknown as Mock).mockResolvedValue(mockFileHandle);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // The written content should still have only one rule (no duplicate)
    const writeCall = mockFileHandle.writeFile.mock.calls[0];
    const writtenContent = writeCall[0] as string;
    const ruleCount = (writtenContent.match(/\[\[rule\]\]/g) || []).length;
    expect(ruleCount).toBe(1);
  });

  it('should fall back to direct write when rename fails with EPERM', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      Object.assign(new Error('File not found'), { code: 'ENOENT' }),
    );

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (fs.open as unknown as Mock).mockResolvedValue(mockFileHandle);

    // Simulate Windows EPERM error on rename
    const epermError = Object.assign(
      new Error('EPERM: operation not permitted'),
      {
        code: 'EPERM',
      },
    );
    (fs.rename as unknown as Mock).mockRejectedValue(epermError);
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
    (fs.unlink as unknown as Mock).mockResolvedValue(undefined);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Should have fallen back to direct writeFile
    expect(fs.writeFile).toHaveBeenCalledWith(
      policyFile,
      expect.stringContaining('toolName = "test_tool"'),
      'utf-8',
    );
  });

  it('should clean up temp file on failure', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      Object.assign(new Error('File not found'), { code: 'ENOENT' }),
    );

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    (fs.open as unknown as Mock).mockResolvedValue(mockFileHandle);

    // Simulate an unexpected error on rename (not EPERM/EACCES/EXDEV)
    const eioError = Object.assign(new Error('I/O error'), { code: 'EIO' });
    (fs.rename as unknown as Mock).mockRejectedValue(eioError);
    (fs.unlink as unknown as Mock).mockResolvedValue(undefined);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Temp file should be cleaned up
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/));
  });

  it('should include error details in feedback message', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    const userPoliciesDir = '/mock/user/.gemini/policies';
    const policyFile = path.join(userPoliciesDir, AUTO_SAVED_POLICY_FILENAME);
    vi.spyOn(mockStorage, 'getAutoSavedPolicyPath').mockReturnValue(policyFile);

    // Simulate mkdir failure (permission denied on parent directory)
    const mkdirError = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    });
    (fs.mkdir as unknown as Mock).mockRejectedValue(mkdirError);

    // Spy on coreEvents to check the feedback message
    const { coreEvents } = await import('../utils/events.js');
    const feedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      persist: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Should include the directory path and the error message
    expect(feedbackSpy).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('could not create policy directory'),
    );
  });
});
