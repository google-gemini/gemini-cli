/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
} from 'vitest';
import * as fs from 'node:fs/promises';
import { createPolicyUpdater } from './config.js';
import {
  MessageBusType,
  type UpdatePolicy,
} from '../confirmation-bus/types.js';
import { coreEvents } from '../utils/events.js';
import type { PolicyEngine } from './policy-engine.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Storage } from '../config/storage.js';

vi.mock('node:fs/promises');
vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
}));

describe('Policy Auto-add Safeguards', () => {
  let policyEngine: Mocked<PolicyEngine>;
  let messageBus: Mocked<MessageBus>;
  let storage: Mocked<Storage>;
  let updateCallback: (msg: UpdatePolicy) => Promise<void>;

  beforeEach(() => {
    policyEngine = {
      addRule: vi.fn(),
    } as unknown as Mocked<PolicyEngine>;
    messageBus = {
      subscribe: vi.fn((type, cb) => {
        if (type === MessageBusType.UPDATE_POLICY) {
          updateCallback = cb;
        }
      }),
      publish: vi.fn(),
    } as unknown as Mocked<MessageBus>;
    storage = {
      getWorkspacePoliciesDir: vi.fn().mockReturnValue('/tmp/policies'),
      getAutoSavedPolicyPath: vi
        .fn()
        .mockReturnValue('/tmp/policies/autosaved.toml'),
    } as unknown as Mocked<Storage>;

    const enoent = new Error('ENOENT');
    (enoent as NodeJS.ErrnoException).code = 'ENOENT';

    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockRejectedValue(enoent);
    vi.mocked(fs.open).mockResolvedValue({
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as fs.FileHandle);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip persistence for wildcard toolName', async () => {
    createPolicyUpdater(policyEngine, messageBus, storage);
    expect(updateCallback).toBeDefined();

    await updateCallback({
      type: MessageBusType.UPDATE_POLICY,
      toolName: '*',
      persist: true,
    });

    expect(fs.open).not.toHaveBeenCalled();
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('Policy for all tools was not auto-saved'),
    );
  });

  it('should skip persistence for broad argsPattern (.*)', async () => {
    createPolicyUpdater(policyEngine, messageBus, storage);

    await updateCallback({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test-tool',
      argsPattern: '.*',
      persist: true,
    });

    expect(fs.open).not.toHaveBeenCalled();
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('was not auto-saved for safety reasons'),
    );
  });

  it('should allow persistence for specific argsPattern', async () => {
    createPolicyUpdater(policyEngine, messageBus, storage);

    await updateCallback({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test-tool',
      argsPattern: '.*"file_path":"test.txt".*',
      persist: true,
    });

    await vi.waitFor(() => {
      expect(fs.open).toHaveBeenCalled();
    });
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringContaining('autosaved.toml'),
      '/tmp/policies/autosaved.toml',
    );
  });

  it('should skip persistence for sensitive tool with no pattern', async () => {
    createPolicyUpdater(policyEngine, messageBus, storage);

    await updateCallback({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'sensitive-tool',
      isSensitive: true,
      persist: true,
    });

    await vi.waitFor(() => {
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'Broad approval for "sensitive-tool" was not auto-saved',
        ),
      );
    });

    expect(fs.open).not.toHaveBeenCalled();
  });

  it('should skip persistence for MCP tool with no pattern', async () => {
    createPolicyUpdater(policyEngine, messageBus, storage);

    const mcpToolName = 'mcp-server__sensitive-tool';
    await updateCallback({
      type: MessageBusType.UPDATE_POLICY,
      toolName: mcpToolName,
      mcpName: 'mcp-server',
      persist: true,
    });

    await vi.waitFor(() => {
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          `Broad approval for "${mcpToolName}" was not auto-saved`,
        ),
      );
    });

    expect(fs.open).not.toHaveBeenCalled();
  });

  it('should de-duplicate identical rules when auto-saving', async () => {
    createPolicyUpdater(policyEngine, messageBus, storage);

    // First call: file doesn't exist (ENOENT already mocked in beforeEach)
    await updateCallback({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'read_file',
      argsPattern: '.*"file_path":"test.txt".*',
      persist: true,
      isSensitive: true,
    });

    await vi.waitFor(() => {
      expect(fs.open).toHaveBeenCalledTimes(1);
    });

    // Mock file existing with the rule for the second call
    vi.mocked(fs.readFile).mockResolvedValue(
      '[[rule]]\ntoolName = "read_file"\ndecision = "allow"\npriority = 100\nargsPattern = \'.*"file_path":"test.txt".*\'\n',
    );

    // Second call: should skip persistence because it's a duplicate
    await updateCallback({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'read_file',
      argsPattern: '.*"file_path":"test.txt".*',
      persist: true,
      isSensitive: true,
    });

    // Still only 1 call to fs.open
    expect(fs.open).toHaveBeenCalledTimes(1);
  });
});
