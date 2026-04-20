/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SandboxDriver } from './sandboxDriver.js';
import type { SandboxConfig, SandboxDiagnostic } from './types.js';
import { SandboxDriverType, SandboxStatus } from './types.js';
import { NoopDriver } from './drivers/noopDriver.js';
import { DockerDriver } from './drivers/dockerDriver.js';
import { PodmanDriver } from './drivers/podmanDriver.js';
import { SeatbeltDriver } from './drivers/seatbeltDriver.js';
import { AppContainerDriver } from './drivers/appContainerDriver.js';

export interface DriverDiscoveryResult {
  type: SandboxDriverType;
  available: boolean;
  name: string;
}

export class SandboxLifecycleManager {
  private readonly drivers: Map<SandboxDriverType, SandboxDriver> = new Map();
  private activeDriver: SandboxDriver | null = null;

  constructor() {
    this.registerDriver(new NoopDriver());
    this.registerDriver(new DockerDriver());
    this.registerDriver(new PodmanDriver());
    this.registerDriver(new SeatbeltDriver());
    this.registerDriver(new AppContainerDriver());
  }

  registerDriver(driver: SandboxDriver): void {
    this.drivers.set(driver.type, driver);
  }

  getDriver(type: SandboxDriverType): SandboxDriver | undefined {
    return this.drivers.get(type);
  }

  getActiveDriver(): SandboxDriver | null {
    return this.activeDriver;
  }

  async discoverDrivers(): Promise<DriverDiscoveryResult[]> {
    const results: DriverDiscoveryResult[] = [];

    for (const driver of this.drivers.values()) {
      const available = await driver.isAvailable();
      results.push({
        type: driver.type,
        available,
        name: driver.name,
      });
    }

    return results;
  }

  async selectDriver(preference?: SandboxDriverType): Promise<SandboxDriver> {
    // If preference specified and available, use it
    if (preference) {
      const driver = this.drivers.get(preference);
      if (driver && (await driver.isAvailable())) {
        return driver;
      }
    }

    // Auto-select: prefer strongest isolation first
    const priority: SandboxDriverType[] = [
      SandboxDriverType.Docker,
      SandboxDriverType.Podman,
      SandboxDriverType.Seatbelt,
      SandboxDriverType.Bubblewrap,
      SandboxDriverType.AppContainer,
      SandboxDriverType.NoOp,
    ];

    for (const type of priority) {
      const driver = this.drivers.get(type);
      if (driver && (await driver.isAvailable())) {
        return driver;
      }
    }

    // Fallback to NoOp (always available)
    return this.drivers.get(SandboxDriverType.NoOp)!;
  }

  async initializeAndStart(
    config: SandboxConfig,
    preference?: SandboxDriverType,
  ): Promise<{ driver: SandboxDriver; diagnostics: SandboxDiagnostic[] }> {
    const driver = await this.selectDriver(preference);
    const diagnostics = await driver.initialize(config);

    if (driver.status === SandboxStatus.Failed) {
      return { driver, diagnostics };
    }

    await driver.start();
    this.activeDriver = driver;

    return { driver, diagnostics };
  }

  async stopActive(): Promise<void> {
    if (this.activeDriver) {
      await this.activeDriver.stop();
      await this.activeDriver.cleanup();
      this.activeDriver = null;
    }
  }

  async diagnoseAll(): Promise<Map<SandboxDriverType, SandboxDiagnostic[]>> {
    const results = new Map<SandboxDriverType, SandboxDiagnostic[]>();

    for (const [type, driver] of this.drivers) {
      const diagnostics = await driver.diagnose();
      results.set(type, diagnostics);
    }

    return results;
  }
}
