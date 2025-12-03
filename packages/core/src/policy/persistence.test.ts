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

vi.mock('node:fs/promises');
vi.mock('../config/storage.js');

describe('createPolicyUpdater', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;

  beforeEach(() => {
    policyEngine = new PolicyEngine({ rules: [], checkers: [] });
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
    (fs.appendFile as unknown as Mock).mockResolvedValue(undefined);

    const toolName = 'test_tool';
    messageBus.publish({
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
    expect(fs.appendFile).toHaveBeenCalledWith(
      path.join(userPoliciesDir, 'auto-saved.toml'),
      expect.stringContaining(`toolName = "${toolName}"`),
    );
    expect(fs.appendFile).toHaveBeenCalledWith(
      path.join(userPoliciesDir, 'auto-saved.toml'),
      expect.stringContaining(`priority = 100`),
    );
  });

  it('should not persist policy when persist flag is false or undefined', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fs.appendFile).not.toHaveBeenCalled();
  });
});
