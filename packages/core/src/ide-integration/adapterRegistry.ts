/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import type { IDEAdapter, IDEConnectionConfig } from './types.js';

const execAsync = promisify(exec);

/**
 * Process signature patterns used to detect running IDE instances.
 * Each entry maps an adapter name to a list of process-name substrings that
 * indicate the IDE is running.
 */
const IDE_PROCESS_SIGNATURES: ReadonlyMap<string, readonly string[]> = new Map([
  ['vscode', ['code', 'Code']],
  [
    'jetbrains',
    [
      'idea',
      'webstorm',
      'pycharm',
      'goland',
      'clion',
      'phpstorm',
      'rustrover',
      'datagrip',
      'studio64',
    ],
  ],
  ['neovim', ['nvim']],
  ['generic-lsp', []],
]);

/**
 * Registry that manages IDE adapter instances, handles adapter lookup,
 * running-IDE detection, and auto-connection logic.
 */
export class AdapterRegistry {
  private adapters = new Map<string, IDEAdapter>();

  /**
   * Register an IDE adapter. If an adapter with the same name is already
   * registered it will be replaced.
   *
   * @param adapter The adapter to register.
   */
  registerAdapter(adapter: IDEAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Retrieve a registered adapter by name.
   *
   * @param name The adapter name.
   * @returns The adapter, or undefined if not registered.
   */
  getAdapter(name: string): IDEAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Return all registered adapters.
   */
  getAvailableAdapters(): IDEAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Remove an adapter from the registry by name.
   *
   * @param name The adapter name to remove.
   * @returns True if the adapter was found and removed.
   */
  removeAdapter(name: string): boolean {
    return this.adapters.delete(name);
  }

  /**
   * Detect which of the registered IDEs currently have running processes.
   * Returns adapters whose corresponding IDE process was found on the system.
   */
  async detectRunningIDEs(): Promise<IDEAdapter[]> {
    const runningProcesses = await this.getRunningProcessNames();
    const detected: IDEAdapter[] = [];

    for (const adapter of this.adapters.values()) {
      const signatures = IDE_PROCESS_SIGNATURES.get(adapter.name);
      if (!signatures || signatures.length === 0) {
        continue;
      }

      const isRunning = signatures.some((sig) =>
        runningProcesses.some((proc) =>
          proc.toLowerCase().includes(sig.toLowerCase()),
        ),
      );

      if (isRunning) {
        detected.push(adapter);
      }
    }

    return detected;
  }

  /**
   * Detect running IDEs and attempt to connect to the first one found.
   * Tries adapters in registration order, filtered to those whose process
   * is currently running.
   *
   * @param configProvider Optional function that provides connection config
   *   for a given adapter name. If not supplied, a default TCP config
   *   targeting localhost is used.
   * @returns The connected adapter, or undefined if none could connect.
   */
  async autoConnect(
    configProvider?: (adapterName: string) => IDEConnectionConfig | undefined,
  ): Promise<IDEAdapter | undefined> {
    const running = await this.detectRunningIDEs();

    for (const adapter of running) {
      const config = configProvider
        ? configProvider(adapter.name)
        : this.defaultConfigForAdapter(adapter.name);

      if (!config) {
        continue;
      }

      try {
        await adapter.connect(config);
        if (adapter.isConnected()) {
          return adapter;
        }
      } catch {
        // Try the next adapter
      }
    }

    return undefined;
  }

  /**
   * Get a list of process names currently running on the system.
   */
  private async getRunningProcessNames(): Promise<string[]> {
    try {
      const os = platform();
      let command: string;

      if (os === 'win32') {
        command = 'tasklist /FO CSV /NH';
      } else {
        command = 'ps -eo comm=';
      }

      const { stdout } = await execAsync(command, {
        timeout: 5000,
        maxBuffer: 5 * 1024 * 1024,
      });

      if (os === 'win32') {
        // Parse CSV format: "process.exe","PID",...
        return stdout
          .split('\n')
          .map((line) => {
            const match = line.match(/^"([^"]+)"/);
            return match ? match[1] : '';
          })
          .filter(Boolean);
      }

      return stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Provide a sensible default connection configuration for well-known adapters.
   */
  private defaultConfigForAdapter(
    adapterName: string,
  ): IDEConnectionConfig | undefined {
    switch (adapterName) {
      case 'vscode':
        return {
          transport: 'tcp',
          host: '127.0.0.1',
          port: 18900,
        };
      case 'jetbrains':
        return {
          transport: 'tcp',
          host: '127.0.0.1',
          port: 63342,
        };
      case 'neovim':
        return {
          transport: 'named-pipe',
          pipeName: this.getNeovimDefaultSocket(),
        };
      default:
        return undefined;
    }
  }

  /**
   * Determine the default Neovim listen socket path.
   */
  private getNeovimDefaultSocket(): string {
    const nvimListenAddress =
      process.env['NVIM_LISTEN_ADDRESS'] ?? process.env['NVIM'];
    if (nvimListenAddress) {
      return nvimListenAddress;
    }
    if (platform() === 'win32') {
      return '\\\\.\\pipe\\nvim';
    }
    return '/tmp/nvim.sock';
  }
}

/**
 * Shared singleton registry instance.
 */
export const adapterRegistry = new AdapterRegistry();
