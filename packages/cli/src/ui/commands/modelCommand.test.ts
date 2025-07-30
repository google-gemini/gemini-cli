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

  it('should change the model and return success message', () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const setModelSpy = vi.fn();
    mockContext.services.config = {
      ...mockContext.services.config,
      setModel: setModelSpy,
    } as any;

    const newModel = 'new-model-name';
    const result = modelCommand.action(mockContext, newModel);

    expect(setModelSpy).toHaveBeenCalledWith(newModel);
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: `Model changed to ${newModel}`,
    });
  });

  it('should change the model with spaces in the name and return success message', () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const setModelSpy = vi.fn();
    mockContext.services.config = {
      ...mockContext.services.config,
      setModel: setModelSpy,
    } as any;

    const newModel = 'my custom model';
    const result = modelCommand.action(mockContext, newModel);

    expect(setModelSpy).toHaveBeenCalledWith(newModel);
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: `Model changed to ${newModel}`,
    });
  });

  it('should return error message when no model name is provided', () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const result = modelCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /model <model-name>',
    });
  });

  it('should return error message when only whitespace is provided', () => {
    if (!modelCommand.action) {
      throw new Error('The model command must have an action.');
    }

    const result = modelCommand.action(mockContext, '   ');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /model <model-name>',
    });
  });

  it('should have the correct name and description', () => {
    expect(modelCommand.name).toBe('model');
    expect(modelCommand.description).toBe('change the model. Usage: /model <model-name>');
  });
});