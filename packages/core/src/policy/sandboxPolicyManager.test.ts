/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SandboxPolicyManager } from './sandboxPolicyManager.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('SandboxPolicyManager', () => {
  const tempDir = path.join(os.tmpdir(), 'gemini-test-sandbox-policy');
  const configPath = path.join(tempDir, 'sandbox.toml');

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should add and retrieve session approvals', () => {
    const manager = new SandboxPolicyManager(configPath);
    manager.addSessionApproval('ls', {
      fileSystem: { read: ['/tmp'], write: [] },
      network: false,
    });

    const perms = manager.getCommandPermissions('ls');
    expect(perms.fileSystem?.read).toContain('/tmp');
  });

  it('should protect against prototype pollution (session)', () => {
    const manager = new SandboxPolicyManager(configPath);
    manager.addSessionApproval('__proto__', {
      fileSystem: { read: ['/POLLUTED'], write: [] },
      network: true,
    });

    const perms = manager.getCommandPermissions('any-command');
    expect(perms.fileSystem?.read).not.toContain('/POLLUTED');
  });

  it('should protect against prototype pollution (persistent)', () => {
    const manager = new SandboxPolicyManager(configPath);
    manager.addPersistentApproval('constructor', {
      fileSystem: { read: ['/POLLUTED_PERSISTENT'], write: [] },
      network: true,
    });

    const perms = manager.getCommandPermissions('constructor');
    expect(perms.fileSystem?.read).not.toContain('/POLLUTED_PERSISTENT');
  });

  it('should lowercase command names for normalization', () => {
    const manager = new SandboxPolicyManager(configPath);
    manager.addSessionApproval('NPM', {
      fileSystem: { read: ['/node_modules'], write: [] },
      network: true,
    });

    const perms = manager.getCommandPermissions('npm');
    expect(perms.fileSystem?.read).toContain('/node_modules');
  });
});
