/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { themeInstaller } from './themeInstaller.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('themeInstaller', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should match URLs', () => {
    expect(themeInstaller.matches('https://example.com')).toBe(true);
    expect(themeInstaller.matches('http://example.com')).toBe(true);
    expect(themeInstaller.matches('no url here')).toBe(false);
  });

  it('should reject non-marketplace URLs', async () => {
    const result = await themeInstaller.run(mockContext, 'https://example.com');

    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining(
        "doesn't appear to be a valid VS Code marketplace URL",
      ),
    });
  });

  it('should reject marketplace URLs without itemName parameter', async () => {
    const result = await themeInstaller.run(
      mockContext,
      'https://marketplace.visualstudio.com/items',
    );

    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining('missing the itemName parameter'),
    });
  });

  it('should reject marketplace URLs with invalid itemName format', async () => {
    const result = await themeInstaller.run(
      mockContext,
      'https://marketplace.visualstudio.com/items?itemName=invalid',
    );

    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining("doesn't follow the expected format"),
    });
  });

  it('should accept valid marketplace URLs', async () => {
    const result = await themeInstaller.run(
      mockContext,
      'https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code',
    );

    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining("I'll help you install a VS Code theme"),
    });
  });

  it('should accept marketplace URLs with additional parameters', async () => {
    const result = await themeInstaller.run(
      mockContext,
      'https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code&utm_source=example',
    );

    expect(result).toEqual({
      type: 'submit_prompt',
      content: expect.stringContaining("I'll help you install a VS Code theme"),
    });
  });

  it('should have the correct name', () => {
    expect(themeInstaller.name).toBe('theme');
  });
});
