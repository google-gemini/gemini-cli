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
import { createPolicyUpdater } from './config.js';
import { PolicyEngine } from './policy-engine.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { Storage } from '../config/storage.js';
import { ApprovalMode } from './types.js';

vi.mock('node:fs/promises');
vi.mock('../config/storage.js');

describe('createPolicyUpdater', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;

  beforeEach(() => {
    policyEngine = new PolicyEngine({
      rules: [],
      checkers: [],
      approvalMode: ApprovalMode.DEFAULT,
    });
    messageBus = new MessageBus(policyEngine);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should persist policy when persist flag is true', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(userPoliciesDir);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    ); // Simulate new file
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const toolName = 'test_tool';
    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
    });

    // Wait for async operations (microtasks)
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(Storage.getUserPoliciesDir).toHaveBeenCalled();
    expect(fs.mkdir).toHaveBeenCalledWith(userPoliciesDir, {
      recursive: true,
    });

    // Check written content
    const expectedContent = expect.stringContaining(`toolName = "test_tool"`);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expectedContent,
      'utf-8',
    );
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      path.join(userPoliciesDir, 'auto-saved.toml'),
    );
  });

  it('should not persist policy when persist flag is false or undefined', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it('should persist policy with commandPrefix when provided', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(userPoliciesDir);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
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
    expect(addedRule?.priority).toBe(2.95);
    expect(addedRule?.argsPattern).toEqual(
      new RegExp(`"command":"git\\ status(?:[\\s"]|\\\\")`),
    );

    // Verify file written
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expect.stringContaining(`commandPrefix = "git status"`),
      'utf-8',
    );
  });

  it('should persist policy with mcpName and toolName when provided', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(userPoliciesDir);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
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
    const writeCall = (fs.writeFile as unknown as Mock).mock.calls[0];
    const writtenContent = writeCall[1] as string;
    expect(writtenContent).toContain(`mcpName = "${mcpName}"`);
    expect(writtenContent).toContain(`toolName = "${simpleToolName}"`);
    expect(writtenContent).toContain('priority = 200');
  });

  it('should escape special characters in toolName and mcpName', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(userPoliciesDir);
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
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

    const writeCall = (fs.writeFile as unknown as Mock).mock.calls[0];
    const writtenContent = writeCall[1] as string;

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
});
