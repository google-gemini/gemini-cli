/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modelCommand } from './modelCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('modelCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  describe('main command behavior', () => {
    it('should show list of models when no arguments are provided', () => {
      if (!modelCommand.action) {
        throw new Error('The model command must have an action.');
      }

      const getModelSpy = vi.fn(() => 'gemini-2.5-pro');
      mockContext.services.config = {
        ...mockContext.services.config,
        getModel: getModelSpy,
      } as any;

      const result = modelCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Available Gemini models:'),
      });
      expect((result as any).content).toContain('gemini-2.5-pro (current)');
      expect((result as any).content).toContain('gemini-2.5-flash');
      expect((result as any).content).toContain('[thinking]');
      expect((result as any).content).toContain('Supports thinking capability');
      // flash-lite should not have [thinking] indicator
      expect((result as any).content).toContain('gemini-2.5-flash-lite');
      expect((result as any).content).not.toContain('gemini-2.5-flash-lite [thinking]');
    });

    it('should show list of models when "list" argument is provided', () => {
      if (!modelCommand.action) {
        throw new Error('The model command must have an action.');
      }

      const getModelSpy = vi.fn(() => 'gemini-2.5-flash');
      mockContext.services.config = {
        ...mockContext.services.config,
        getModel: getModelSpy,
      } as any;

      const result = modelCommand.action(mockContext, 'list');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Available Gemini models:'),
      });
      expect((result as any).content).toContain('gemini-2.5-flash (current)');
      expect((result as any).content).toContain('[thinking]');
      // flash-lite should not have [thinking] indicator
      expect((result as any).content).not.toContain('gemini-2.5-flash-lite [thinking]');
    });

    it('should change the model when a valid model name is provided directly', () => {
      if (!modelCommand.action) {
        throw new Error('The model command must have an action.');
      }

      const setModelSpy = vi.fn();
      mockContext.services.config = {
        ...mockContext.services.config,
        setModel: setModelSpy,
      } as any;

      const newModel = 'gemini-2.5-flash';
      const result = modelCommand.action(mockContext, newModel);

      expect(setModelSpy).toHaveBeenCalledWith(newModel);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Model changed to \u001b[36m${newModel}\u001b[0m`,
      });
    });

    it('should return error for invalid model name', () => {
      if (!modelCommand.action) {
        throw new Error('The model command must have an action.');
      }

      const result = modelCommand.action(mockContext, 'invalid-model');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Unknown model: invalid-model\n\nUse /model list to see available models',
      });
    });

    it('should show thinking capability and descriptions in model list', () => {
      if (!modelCommand.action) {
        throw new Error('The model command must have an action.');
      }

      const getModelSpy = vi.fn(() => 'gemini-2.5-pro');
      mockContext.services.config = {
        ...mockContext.services.config,
        getModel: getModelSpy,
      } as any;

      const result = modelCommand.action(mockContext, '');

      expect((result as any).content).toContain('Most capable model with thinking support');
      expect((result as any).content).toContain('Fast model with thinking support');
      expect((result as any).content).toContain('Lightweight model (limited thinking support)');
      expect((result as any).content).toContain('[thinking] = Supports thinking capability');
    });
  });

  describe('subcommands', () => {
    it('should have list and set subcommands', () => {
      expect(modelCommand.subCommands).toHaveLength(2);
      expect(modelCommand.subCommands?.[0].name).toBe('list');
      expect(modelCommand.subCommands?.[1].name).toBe('set');
    });

    it('should handle set subcommand with valid model', () => {
      const setSubCommand = modelCommand.subCommands?.find(cmd => cmd.name === 'set');
      if (!setSubCommand?.action) {
        throw new Error('The set subcommand must have an action.');
      }

      const setModelSpy = vi.fn();
      mockContext.services.config = {
        ...mockContext.services.config,
        setModel: setModelSpy,
      } as any;

      const result = setSubCommand.action(mockContext, 'gemini-2.5-pro');

      expect(setModelSpy).toHaveBeenCalledWith('gemini-2.5-pro');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Model changed to \u001b[36mgemini-2.5-pro\u001b[0m',
      });
    });

    it('should handle set subcommand with no arguments', () => {
      const setSubCommand = modelCommand.subCommands?.find(cmd => cmd.name === 'set');
      if (!setSubCommand?.action) {
        throw new Error('The set subcommand must have an action.');
      }

      const result = setSubCommand.action(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Usage: /model set <model-name>\n\nUse /model list to see available models',
      });
    });
  });

  describe('completion', () => {
    it('should provide model name completion', async () => {
      if (!modelCommand.completion) {
        throw new Error('The model command must have completion.');
      }

      const completions = await modelCommand.completion(mockContext, 'gemini-2.5');
      
      expect(completions).toContain('gemini-2.5-pro');
      expect(completions).toContain('gemini-2.5-flash');
      expect(completions).toContain('gemini-2.5-flash-lite');
    });

    it('should filter completions based on partial input', async () => {
      if (!modelCommand.completion) {
        throw new Error('The model command must have completion.');
      }

      const completions = await modelCommand.completion(mockContext, 'gemini-2.5-f');
      
      expect(completions).toContain('gemini-2.5-flash');
      expect(completions).toContain('gemini-2.5-flash-lite');
      expect(completions).not.toContain('gemini-2.5-pro');
    });

    it('set subcommand should provide model name completion', async () => {
      const setSubCommand = modelCommand.subCommands?.find(cmd => cmd.name === 'set');
      if (!setSubCommand?.completion) {
        throw new Error('The set subcommand must have completion.');
      }

      const completions = await setSubCommand.completion(mockContext, 'gemini-2.5');
      
      expect(completions).toContain('gemini-2.5-pro');
      expect(completions).toContain('gemini-2.5-flash');
      expect(completions).toContain('gemini-2.5-flash-lite');
    });
  });

  it('should have the correct name and description', () => {
    expect(modelCommand.name).toBe('model');
    expect(modelCommand.description).toBe('Manage the active Gemini model');
  });
});