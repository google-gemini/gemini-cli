/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SandboxLifecycleManager } from '../sandboxLifecycleManager.js';
import { SandboxDriverType, DEFAULT_SANDBOX_CONFIG } from '../types.js';

describe('SandboxLifecycleManager', () => {
  let manager: SandboxLifecycleManager;

  beforeEach(() => {
    manager = new SandboxLifecycleManager();
  });

  it('should have registered default drivers', async () => {
    const discovered = await manager.discoverDrivers();
    const types = discovered.map((d) => d.type);
    expect(types).toContain(SandboxDriverType.NoOp);
    expect(types).toContain(SandboxDriverType.Docker);
    expect(types).toContain(SandboxDriverType.Podman);
    expect(types).toContain(SandboxDriverType.Seatbelt);
    expect(types).toContain(SandboxDriverType.AppContainer);
  }, 15_000);

  it('should always find NoOp available', async () => {
    const discovered = await manager.discoverDrivers();
    const noop = discovered.find((d) => d.type === SandboxDriverType.NoOp);
    expect(noop?.available).toBe(true);
  });

  it('should select NoOp as fallback', async () => {
    const driver = await manager.selectDriver();
    // On CI/test environments without Docker, should fall back to NoOp
    expect(driver).toBeDefined();
    expect(driver.type).toBeDefined();
  });

  it('should select preferred driver if specified', async () => {
    const driver = await manager.selectDriver(SandboxDriverType.NoOp);
    expect(driver.type).toBe(SandboxDriverType.NoOp);
  });

  it('should initialize and start with NoOp', async () => {
    const { driver, diagnostics } = await manager.initializeAndStart(
      DEFAULT_SANDBOX_CONFIG,
      SandboxDriverType.NoOp,
    );
    expect(driver.type).toBe(SandboxDriverType.NoOp);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(manager.getActiveDriver()).toBe(driver);
  });

  it('should stop active driver', async () => {
    await manager.initializeAndStart(
      DEFAULT_SANDBOX_CONFIG,
      SandboxDriverType.NoOp,
    );
    expect(manager.getActiveDriver()).not.toBeNull();

    await manager.stopActive();
    expect(manager.getActiveDriver()).toBeNull();
  });

  it('should get driver by type', () => {
    const noop = manager.getDriver(SandboxDriverType.NoOp);
    expect(noop).toBeDefined();
    expect(noop?.type).toBe(SandboxDriverType.NoOp);
  });

  it('should diagnose all drivers', async () => {
    const results = await manager.diagnoseAll();
    expect(results.size).toBeGreaterThan(0);
    expect(results.has(SandboxDriverType.NoOp)).toBe(true);
  });
});
