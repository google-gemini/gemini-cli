/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdapterRegistry } from '../adapterRegistry.js';
import {
  IDECapability,
  type IDEAdapter,
  type IDEConnectionConfig,
} from '../types.js';

/**
 * Create a minimal mock IDE adapter for testing.
 */
function createMockAdapter(
  name: string,
  opts?: { connectShouldFail?: boolean },
): IDEAdapter & { _connected: boolean } {
  const adapter: IDEAdapter & { _connected: boolean } = {
    _connected: false,
    name,
    capabilities: new Set([IDECapability.OpenFile, IDECapability.GoToLine]),
    async connect(_config: IDEConnectionConfig): Promise<void> {
      if (opts?.connectShouldFail) {
        throw new Error('Connection failed');
      }
      adapter._connected = true;
    },
    async disconnect(): Promise<void> {
      adapter._connected = false;
    },
    isConnected(): boolean {
      return adapter._connected;
    },
    async openFile(): Promise<void> {},
    async goToLine(): Promise<void> {},
    async showDiff(): Promise<void> {},
    async applyEdit(): Promise<void> {},
    async getSelection() {
      return undefined;
    },
    async showNotification(): Promise<void> {},
  };
  return adapter;
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe('registerAdapter', () => {
    it('should register an adapter and retrieve it by name', () => {
      const adapter = createMockAdapter('vscode');
      registry.registerAdapter(adapter);

      expect(registry.getAdapter('vscode')).toBe(adapter);
    });

    it('should replace an existing adapter with the same name', () => {
      const adapter1 = createMockAdapter('vscode');
      const adapter2 = createMockAdapter('vscode');
      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);

      expect(registry.getAdapter('vscode')).toBe(adapter2);
    });
  });

  describe('getAdapter', () => {
    it('should return undefined for an unregistered name', () => {
      expect(registry.getAdapter('nonexistent')).toBeUndefined();
    });
  });

  describe('getAvailableAdapters', () => {
    it('should return an empty array when no adapters are registered', () => {
      expect(registry.getAvailableAdapters()).toEqual([]);
    });

    it('should return all registered adapters', () => {
      const vscode = createMockAdapter('vscode');
      const jetbrains = createMockAdapter('jetbrains');
      registry.registerAdapter(vscode);
      registry.registerAdapter(jetbrains);

      const adapters = registry.getAvailableAdapters();
      expect(adapters).toHaveLength(2);
      expect(adapters).toContain(vscode);
      expect(adapters).toContain(jetbrains);
    });
  });

  describe('removeAdapter', () => {
    it('should remove a registered adapter', () => {
      const adapter = createMockAdapter('vscode');
      registry.registerAdapter(adapter);
      expect(registry.removeAdapter('vscode')).toBe(true);
      expect(registry.getAdapter('vscode')).toBeUndefined();
    });

    it('should return false when removing a non-existent adapter', () => {
      expect(registry.removeAdapter('nonexistent')).toBe(false);
    });
  });

  describe('detectRunningIDEs', () => {
    it('should return adapters whose IDE processes are running', async () => {
      const vscode = createMockAdapter('vscode');
      const jetbrains = createMockAdapter('jetbrains');
      registry.registerAdapter(vscode);
      registry.registerAdapter(jetbrains);

      // Mock the process detection
      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['code', 'node', 'bash']);

      const detected = await registry.detectRunningIDEs();
      expect(detected).toHaveLength(1);
      expect(detected[0]).toBe(vscode);
    });

    it('should return an empty array when no IDE processes are detected', async () => {
      const vscode = createMockAdapter('vscode');
      registry.registerAdapter(vscode);

      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['node', 'bash', 'npm']);

      const detected = await registry.detectRunningIDEs();
      expect(detected).toHaveLength(0);
    });

    it('should detect JetBrains IDEs by process name patterns', async () => {
      const jetbrains = createMockAdapter('jetbrains');
      registry.registerAdapter(jetbrains);

      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['idea', 'java', 'node']);

      const detected = await registry.detectRunningIDEs();
      expect(detected).toHaveLength(1);
      expect(detected[0]).toBe(jetbrains);
    });

    it('should detect Neovim by process name', async () => {
      const neovim = createMockAdapter('neovim');
      registry.registerAdapter(neovim);

      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['nvim', 'bash']);

      const detected = await registry.detectRunningIDEs();
      expect(detected).toHaveLength(1);
      expect(detected[0]).toBe(neovim);
    });
  });

  describe('autoConnect', () => {
    it('should connect to the first running IDE adapter', async () => {
      const vscode = createMockAdapter('vscode');
      registry.registerAdapter(vscode);

      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['code']);

      const configProvider = vi.fn().mockReturnValue({
        transport: 'tcp',
        host: '127.0.0.1',
        port: 18900,
      } satisfies IDEConnectionConfig);

      const connected = await registry.autoConnect(configProvider);

      expect(connected).toBe(vscode);
      expect(vscode._connected).toBe(true);
      expect(configProvider).toHaveBeenCalledWith('vscode');
    });

    it('should return undefined when no IDEs are running', async () => {
      const vscode = createMockAdapter('vscode');
      registry.registerAdapter(vscode);

      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['bash', 'node']);

      const connected = await registry.autoConnect();
      expect(connected).toBeUndefined();
    });

    it('should skip adapters that fail to connect and try the next one', async () => {
      const failingAdapter = createMockAdapter('vscode', {
        connectShouldFail: true,
      });
      const successAdapter = createMockAdapter('jetbrains');
      registry.registerAdapter(failingAdapter);
      registry.registerAdapter(successAdapter);

      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['code', 'idea']);

      const configProvider = vi.fn().mockReturnValue({
        transport: 'tcp',
        host: '127.0.0.1',
        port: 63342,
      } satisfies IDEConnectionConfig);

      const connected = await registry.autoConnect(configProvider);

      expect(connected).toBe(successAdapter);
      expect(successAdapter._connected).toBe(true);
    });

    it('should return undefined when config provider returns undefined', async () => {
      const vscode = createMockAdapter('vscode');
      registry.registerAdapter(vscode);

      vi.spyOn(
        registry as unknown as {
          getRunningProcessNames: () => Promise<string[]>;
        },
        'getRunningProcessNames',
      ).mockResolvedValue(['code']);

      const configProvider = vi.fn().mockReturnValue(undefined);
      const connected = await registry.autoConnect(configProvider);

      expect(connected).toBeUndefined();
      expect(vscode._connected).toBe(false);
    });
  });
});
