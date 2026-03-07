/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ChildProcess } from 'node:child_process';
import { type SandboxConfig } from '../config/config.js';
import { MacOSSeatbeltDriver } from './drivers/MacOSSeatbeltDriver.js';
import { DockerDriver, PodmanDriver } from './drivers/ContainerDriver.js';
import { LXCDriver } from './drivers/LXCDriver.js';
import { NoOpDriver } from './drivers/NoOpDriver.js';

/**
 * Metadata provided by a sandbox driver about its configuration and state.
 */
export interface SandboxMetadata {
  driverName: string;
  isSupported: boolean;
  image?: string;
  command?: string;
  platform?: string;
  [key: string]: unknown;
}

/**
 * Interface for a plugin-based sandbox driver.
 */
export interface SandboxDriver {
  /** The unique name of the driver (e.g., 'docker', 'sandbox-exec'). */
  readonly name: string;

  /** Checks if the driver is supported on the current platform and environment. */
  isSupported(): Promise<boolean>;

  /** Performs any necessary setup, such as pulling a Docker image. */
  prepare(config: SandboxConfig): Promise<void>;

  /** Spawns the CLI process within the sandbox. */
  spawn(config: SandboxConfig, nodeArgs: string[], cliArgs: string[]): Promise<ChildProcess>;

  /** Returns diagnostic metadata about the driver. */
  getMetadata(config?: SandboxConfig): Promise<SandboxMetadata>;
}

/**
 * Manages the lifecycle and discovery of sandbox drivers.
 */
export class SandboxManager {
  private static instance: SandboxManager;
  private readonly drivers = new Map<string, SandboxDriver>();

  private constructor() {
    this.registerDriver(new MacOSSeatbeltDriver());
    this.registerDriver(new DockerDriver());
    this.registerDriver(new PodmanDriver());
    this.registerDriver(new LXCDriver());
    this.registerDriver(new NoOpDriver());
  }

  public static getInstance(): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager();
    }
    return SandboxManager.instance;
  }

  /** Registers a new sandbox driver. */
  registerDriver(driver: SandboxDriver): void {
    this.drivers.set(driver.name, driver);
  }

  /** Gets a registered driver by name. */
  getDriver(name: string): SandboxDriver | undefined {
    return this.drivers.get(name);
  }

  /** Returns all registered drivers. */
  getAllDrivers(): SandboxDriver[] {
    return Array.from(this.drivers.values());
  }

  /**
   * Discovers the best available driver based on the host OS and configuration.
   */
  async discoverBestDriver(preferredName?: string): Promise<SandboxDriver | undefined> {
    if (preferredName) {
      const driver = this.getDriver(preferredName);
      if (driver && await driver.isSupported()) {
        return driver;
      }
    }

    // Default discovery order
    for (const driver of this.getAllDrivers()) {
      if (driver.name === 'none') continue; // Skip NoOp unless explicitly requested
      if (await driver.isSupported()) {
        return driver;
      }
    }

    return this.getDriver('none');
  }
}
