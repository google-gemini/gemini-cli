/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NoopDriver } from '../drivers/noopDriver.js';
import {
  SandboxStatus,
  IsolationLevel,
  DEFAULT_SANDBOX_CONFIG,
} from '../types.js';

describe('NoopDriver', () => {
  let driver: NoopDriver;

  beforeEach(() => {
    driver = new NoopDriver();
  });

  it('should always be available', async () => {
    expect(await driver.isAvailable()).toBe(true);
  });

  it('should report no isolation capabilities', () => {
    const caps = driver.getCapabilities();
    expect(caps.fileSystemIsolation).toBe(false);
    expect(caps.networkIsolation).toBe(false);
    expect(caps.processIsolation).toBe(false);
    expect(caps.isolationLevels).toContain(IsolationLevel.None);
  });

  it('should initialize with warning diagnostic', async () => {
    const diagnostics = await driver.initialize(DEFAULT_SANDBOX_CONFIG);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.level).toBe('warning');
    expect(diagnostics[0]?.code).toBe('NOOP_NO_ISOLATION');
    expect(driver.status).toBe(SandboxStatus.Ready);
  });

  it('should execute commands on the host', async () => {
    await driver.initialize(DEFAULT_SANDBOX_CONFIG);
    await driver.start();

    const result = await driver.execute('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.timedOut).toBe(false);
  });

  it('should handle command errors', async () => {
    await driver.initialize(DEFAULT_SANDBOX_CONFIG);
    await driver.start();

    const result = await driver.execute('exit 42');
    expect(result.exitCode).toBe(42);
  });

  it('should stop and cleanup', async () => {
    await driver.initialize(DEFAULT_SANDBOX_CONFIG);
    await driver.stop();
    expect(driver.status).toBe(SandboxStatus.Stopped);

    await driver.cleanup();
    expect(driver.status).toBe(SandboxStatus.Uninitialized);
  });

  it('should return diagnostics', async () => {
    const diagnostics = await driver.diagnose();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('NOOP_STATUS');
  });

  it('should throw if started when not ready', async () => {
    await expect(driver.start()).rejects.toThrow('Cannot start');
  });
});
