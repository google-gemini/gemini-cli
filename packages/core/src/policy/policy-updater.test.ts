/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { createPolicyUpdater, ALWAYS_ALLOW_PRIORITY } from './config.js';
import { PolicyEngine } from './policy-engine.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { Storage } from '../config/storage.js';
import toml from '@iarna/toml';
import { ShellToolInvocation } from '../tools/shell.js';
import { type Config } from '../config/config.js';
import {
  ToolConfirmationOutcome,
  type PolicyUpdateOptions,
} from '../tools/tools.js';
import * as shellUtils from '../utils/shell-utils.js';

vi.mock('node:fs/promises');
vi.mock('../config/storage.js');
vi.mock('../utils/shell-utils.js', () => ({
  getCommandRoots: vi.fn(),
  stripShellWrapper: vi.fn(),
}));
interface ParsedPolicy {
  rule?: Array<{
    commandPrefix?: string | string[];
  }>;
}

interface TestableShellToolInvocation {
  getPolicyUpdateOptions(
    outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined;
}

describe('createPolicyUpdater', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;
  let mockStorage: Storage;

  beforeEach(() => {
    vi.resetAllMocks();
    policyEngine = new PolicyEngine({});
    vi.spyOn(policyEngine, 'addRule');

    messageBus = new MessageBus(policyEngine);
    mockStorage = new Storage('/mock/project');
    vi.spyOn(mockStorage, 'getWorkspacePoliciesDir').mockReturnValue(
      '/mock/project/.gemini/policies',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add multiple rules when commandPrefix is an array', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'run_shell_command',
      commandPrefix: ['echo', 'ls'],
      persist: false,
    });

    expect(policyEngine.addRule).toHaveBeenCalledTimes(2);
    expect(policyEngine.addRule).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolName: 'run_shell_command',
        priority: ALWAYS_ALLOW_PRIORITY,
        argsPattern: new RegExp('"command":"echo(?:[\\s"]|\\\\")'),
      }),
    );
    expect(policyEngine.addRule).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolName: 'run_shell_command',
        priority: ALWAYS_ALLOW_PRIORITY,
        argsPattern: new RegExp('"command":"ls(?:[\\s"]|\\\\")'),
      }),
    );
  });

  it('should add a single rule when commandPrefix is a string', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'run_shell_command',
      commandPrefix: 'git',
      persist: false,
    });

    expect(policyEngine.addRule).toHaveBeenCalledTimes(1);
    expect(policyEngine.addRule).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'run_shell_command',
        priority: ALWAYS_ALLOW_PRIORITY,
        argsPattern: new RegExp('"command":"git(?:[\\s"]|\\\\")'),
      }),
    );
  });

  it('should persist multiple rules correctly to TOML', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);
    vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);

    const mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(fs.open).mockResolvedValue(
      mockFileHandle as unknown as fs.FileHandle,
    );
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'run_shell_command',
      commandPrefix: ['echo', 'ls'],
      persist: true,
    });

    // Wait for the async listener to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fs.open).toHaveBeenCalled();
    const [content] = mockFileHandle.writeFile.mock.calls[0] as [
      string,
      string,
    ];
    const parsed = toml.parse(content) as unknown as ParsedPolicy;

    expect(parsed.rule).toHaveLength(1);
    expect(parsed.rule![0].commandPrefix).toEqual(['echo', 'ls']);
  });

  it('should reject unsafe regex patterns', async () => {
    createPolicyUpdater(policyEngine, messageBus, mockStorage);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
      argsPattern: '(a+)+',
      persist: false,
    });

    expect(policyEngine.addRule).not.toHaveBeenCalled();
  });
});

describe('ShellToolInvocation Policy Update', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    vi.resetAllMocks();
    mockConfig = {} as Config;
    mockMessageBus = {} as MessageBus;

    vi.mocked(shellUtils.stripShellWrapper).mockImplementation(
      (c: string) => c,
    );
  });

  it('should extract multiple root commands for chained commands', () => {
    vi.mocked(shellUtils.getCommandRoots).mockReturnValue(['git', 'npm']);

    const invocation = new ShellToolInvocation(
      mockConfig,
      { command: 'git status && npm test' },
      mockMessageBus,
      'run_shell_command',
      'Shell',
    );

    // Accessing protected method for testing
    const options = (
      invocation as unknown as TestableShellToolInvocation
    ).getPolicyUpdateOptions(ToolConfirmationOutcome.ProceedAlways);
    expect(options!.commandPrefix).toEqual(['git', 'npm']);
    expect(shellUtils.getCommandRoots).toHaveBeenCalledWith(
      'git status && npm test',
    );
  });

  it('should extract a single root command', () => {
    vi.mocked(shellUtils.getCommandRoots).mockReturnValue(['ls']);

    const invocation = new ShellToolInvocation(
      mockConfig,
      { command: 'ls -la /tmp' },
      mockMessageBus,
      'run_shell_command',
      'Shell',
    );

    // Accessing protected method for testing
    const options = (
      invocation as unknown as TestableShellToolInvocation
    ).getPolicyUpdateOptions(ToolConfirmationOutcome.ProceedAlways);
    expect(options!.commandPrefix).toEqual(['ls']);
    expect(shellUtils.getCommandRoots).toHaveBeenCalledWith('ls -la /tmp');
  });
});
