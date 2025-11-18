/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { ICommandLoader } from './types.js';
import type { SlashCommand } from '../ui/commands/types.js';

describe('services types', () => {
  describe('ICommandLoader interface', () => {
    it('should accept implementation with loadCommands method', () => {
      const loader: ICommandLoader = {
        loadCommands: vi.fn().mockResolvedValue([]),
      };

      expect(loader.loadCommands).toBeDefined();
      expect(typeof loader.loadCommands).toBe('function');
    });

    it('should loadCommands return Promise<SlashCommand[]>', async () => {
      const mockCommands: SlashCommand[] = [
        { name: 'test', action: vi.fn() } as never,
      ];

      const loader: ICommandLoader = {
        loadCommands: vi.fn().mockResolvedValue(mockCommands),
      };

      const result = await loader.loadCommands(new AbortController().signal);
      expect(result).toEqual(mockCommands);
    });

    it('should loadCommands accept AbortSignal parameter', async () => {
      const loader: ICommandLoader = {
        loadCommands: vi.fn().mockResolvedValue([]),
      };

      const controller = new AbortController();
      await loader.loadCommands(controller.signal);

      expect(loader.loadCommands).toHaveBeenCalledWith(controller.signal);
    });

    it('should loadCommands return empty array when no commands', async () => {
      const loader: ICommandLoader = {
        loadCommands: vi.fn().mockResolvedValue([]),
      };

      const result = await loader.loadCommands(new AbortController().signal);
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should loadCommands return multiple commands', async () => {
      const commands: SlashCommand[] = [
        { name: 'cmd1' } as SlashCommand,
        { name: 'cmd2' } as SlashCommand,
        { name: 'cmd3' } as SlashCommand,
      ];

      const loader: ICommandLoader = {
        loadCommands: vi.fn().mockResolvedValue(commands),
      };

      const result = await loader.loadCommands(new AbortController().signal);
      expect(result).toHaveLength(3);
    });

    it('should be async and return Promise', () => {
      const loader: ICommandLoader = {
        loadCommands: vi.fn().mockResolvedValue([]),
      };

      const result = loader.loadCommands(new AbortController().signal);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should handle aborted signal', async () => {
      const loader: ICommandLoader = {
        loadCommands: vi
          .fn()
          .mockImplementation((signal: AbortSignal) =>
            signal.aborted
              ? Promise.reject(new Error('Aborted'))
              : Promise.resolve([]),
          ),
      };

      const controller = new AbortController();
      controller.abort();

      await expect(loader.loadCommands(controller.signal)).rejects.toThrow(
        'Aborted',
      );
    });

    it('should respect signal during load', async () => {
      const loadFn = vi.fn().mockResolvedValue([]);
      const loader: ICommandLoader = {
        loadCommands: loadFn,
      };

      const controller = new AbortController();
      await loader.loadCommands(controller.signal);

      expect(loadFn).toHaveBeenCalledWith(controller.signal);
    });
  });
});
