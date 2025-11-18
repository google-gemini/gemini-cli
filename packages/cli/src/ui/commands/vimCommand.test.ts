/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { vimCommand } from './vimCommand.js';
import { CommandKind } from './types.js';
import type { CommandContext } from './types.js';

describe('vimCommand', () => {
  describe('command properties', () => {
    it('should have name "vim"', () => {
      expect(vimCommand.name).toBe('vim');
    });

    it('should have correct description', () => {
      expect(vimCommand.description).toBe('toggle vim mode on/off');
    });

    it('should be a built-in command', () => {
      expect(vimCommand.kind).toBe(CommandKind.BUILT_IN);
    });

    it('should have an action function', () => {
      expect(typeof vimCommand.action).toBe('function');
    });
  });

  describe('action behavior', () => {
    it('should return info message when entering vim mode', async () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(true),
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, []);

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Entered Vim mode. Run /vim again to exit.',
      });
    });

    it('should return info message when exiting vim mode', async () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(false),
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, []);

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Exited Vim mode.',
      });
    });

    it('should call toggleVimEnabled on context', async () => {
      const toggleVimEnabled = vi.fn().mockResolvedValue(true);
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled,
        } as never,
      } as never;

      await vimCommand.action(mockContext, []);

      expect(toggleVimEnabled).toHaveBeenCalledOnce();
    });

    it('should ignore arguments passed to action', async () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(true),
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, [
        'arg1',
        'arg2',
      ] as never);

      expect(result.content).toBe('Entered Vim mode. Run /vim again to exit.');
    });

    it('should return message with type "message"', async () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(true),
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, []);

      expect(result.type).toBe('message');
    });

    it('should return message with messageType "info"', async () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(true),
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, []);

      expect(result.messageType).toBe('info');
    });
  });

  describe('toggle behavior', () => {
    it('should show different messages based on vim state', async () => {
      const toggleVimEnabled = vi.fn();
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled,
        } as never,
      } as never;

      // First call - enable vim
      toggleVimEnabled.mockResolvedValueOnce(true);
      const result1 = await vimCommand.action(mockContext, []);
      expect(result1.content).toContain('Entered Vim mode');

      // Second call - disable vim
      toggleVimEnabled.mockResolvedValueOnce(false);
      const result2 = await vimCommand.action(mockContext, []);
      expect(result2.content).toBe('Exited Vim mode.');
    });

    it('should include toggle instruction when entering vim mode', async () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(true),
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, []);

      expect(result.content).toContain('Run /vim again to exit');
    });

    it('should not include toggle instruction when exiting vim mode', async () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(false),
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, []);

      expect(result.content).not.toContain('Run /vim again');
      expect(result.content).toBe('Exited Vim mode.');
    });
  });

  describe('async behavior', () => {
    it('should be an async function', () => {
      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled: vi.fn().mockResolvedValue(true),
        } as never,
      } as never;

      const result = vimCommand.action(mockContext, []);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should handle async toggle correctly', async () => {
      const toggleVimEnabled = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(true), 10)),
        );

      const mockContext: CommandContext = {
        ui: {
          toggleVimEnabled,
        } as never,
      } as never;

      const result = await vimCommand.action(mockContext, []);
      expect(result.content).toBe('Entered Vim mode. Run /vim again to exit.');
    });
  });

  describe('command structure', () => {
    it('should be a valid SlashCommand', () => {
      expect(vimCommand).toHaveProperty('name');
      expect(vimCommand).toHaveProperty('description');
      expect(vimCommand).toHaveProperty('kind');
      expect(vimCommand).toHaveProperty('action');
    });

    it('should have string name', () => {
      expect(typeof vimCommand.name).toBe('string');
    });

    it('should have string description', () => {
      expect(typeof vimCommand.description).toBe('string');
    });

    it('should have non-empty description', () => {
      expect(vimCommand.description.length).toBeGreaterThan(0);
    });
  });
});
