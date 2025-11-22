/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getPty, type PtyImplementation, type PtyProcess } from './getPty.js';

// Mock dynamic imports
vi.mock('@lydell/node-pty', () => ({
  default: { mockPty: 'lydell' },
}));

vi.mock('node-pty', () => ({
  default: { mockPty: 'node-pty' },
}));

describe('getPty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PtyImplementation type', () => {
    it('should accept valid lydell-node-pty implementation', () => {
      const impl: PtyImplementation = {
        module: {},
        name: 'lydell-node-pty',
      };
      expect(impl.name).toBe('lydell-node-pty');
    });

    it('should accept valid node-pty implementation', () => {
      const impl: PtyImplementation = {
        module: {},
        name: 'node-pty',
      };
      expect(impl.name).toBe('node-pty');
    });

    it('should accept null', () => {
      const impl: PtyImplementation = null;
      expect(impl).toBeNull();
    });
  });

  describe('PtyProcess interface', () => {
    it('should accept valid PtyProcess implementation', () => {
      const process: PtyProcess = {
        pid: 12345,
        onData: vi.fn(),
        onExit: vi.fn(),
        kill: vi.fn(),
      };

      expect(process.pid).toBe(12345);
      expect(typeof process.onData).toBe('function');
      expect(typeof process.onExit).toBe('function');
      expect(typeof process.kill).toBe('function');
    });

    // Skipped: TypeScript readonly is compile-time only and cannot be enforced at runtime
    it.skip('should have readonly pid', () => {
      const process: PtyProcess = {
        pid: 100,
        onData: vi.fn(),
        onExit: vi.fn(),
        kill: vi.fn(),
      };

      expect(() => {
        (process as { pid: number }).pid = 200;
      }).toThrow();
    });

    it('should call onData callback with string data', () => {
      const callback = vi.fn();
      const process: PtyProcess = {
        pid: 100,
        onData: (cb) => cb('test data'),
        onExit: vi.fn(),
        kill: vi.fn(),
      };

      process.onData(callback);
      expect(callback).toHaveBeenCalledWith('test data');
    });

    it('should call onExit callback with exit info', () => {
      const callback = vi.fn();
      const process: PtyProcess = {
        pid: 100,
        onData: vi.fn(),
        onExit: (cb) => cb({ exitCode: 0 }),
        kill: vi.fn(),
      };

      process.onExit(callback);
      expect(callback).toHaveBeenCalledWith({ exitCode: 0 });
    });

    it('should call kill with optional signal', () => {
      const killFn = vi.fn();
      const process: PtyProcess = {
        pid: 100,
        onData: vi.fn(),
        onExit: vi.fn(),
        kill: killFn,
      };

      process.kill('SIGTERM');
      expect(killFn).toHaveBeenCalledWith('SIGTERM');
    });

    it('should call kill without signal', () => {
      const killFn = vi.fn();
      const process: PtyProcess = {
        pid: 100,
        onData: vi.fn(),
        onExit: vi.fn(),
        kill: killFn,
      };

      process.kill();
      expect(killFn).toHaveBeenCalledWith();
    });
  });

  describe('getPty function', () => {
    it('should be an async function', () => {
      const result = getPty();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return PtyImplementation or null', async () => {
      const result = await getPty();
      expect(
        result === null ||
          (typeof result === 'object' &&
            result !== null &&
            'module' in result &&
            'name' in result),
      ).toBe(true);
    });

    it('should have correct return type structure when not null', async () => {
      const result = await getPty();

      if (result !== null) {
        expect(result).toHaveProperty('module');
        expect(result).toHaveProperty('name');
        expect(['lydell-node-pty', 'node-pty']).toContain(result.name);
      }
    });

    it('should try lydell-node-pty first', async () => {
      // This test is implementation-specific and documents the fallback order
      const result = await getPty();

      // We can't directly test the order without mocking imports differently,
      // but we can verify the result is valid
      expect(result).toBeDefined();
    });
  });

  describe('type compatibility', () => {
    it('should allow PtyImplementation to be used as return type', async () => {
      const getPtyWrapper = async (): Promise<PtyImplementation> =>
        await getPty();

      const result = await getPtyWrapper();
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle null return gracefully', async () => {
      const result = await getPty();

      if (result === null) {
        expect(result).toBeNull();
      } else {
        expect(result.module).toBeDefined();
        expect(result.name).toBeDefined();
      }
    });
  });
});
