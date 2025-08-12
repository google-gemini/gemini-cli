/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { installCommand } from './installCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('installCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return help message when no args provided', async () => {
    const result = await installCommand.action!(mockContext, '');
    
    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining('I need help installing a VS Code theme'),
    });
  });

  it('should return error message when no valid URL found', async () => {
    const result = await installCommand.action!(mockContext, 'invalid input');
    
    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining("I couldn't find a valid URL"),
    });
  });

  it('should return success message when valid marketplace URL provided', async () => {
    const result = await installCommand.action!(
      mockContext, 
      'https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code'
    );
    
    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining('I\'ll help you install a VS Code theme'),
    });
  });

  it('should have the correct name and description', () => {
    expect(installCommand.name).toBe('install');
    expect(installCommand.description).toBe('install VS Code themes from marketplace URLs');
  });
}); 