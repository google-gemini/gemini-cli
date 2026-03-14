/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseImageArgs, imageCommand } from './imageCommand.js';

describe('parseImageArgs', () => {
  it('should parse a simple prompt with no flags', () => {
    const result = parseImageArgs('a sunset over the ocean');
    expect(result.prompt).toBe('a sunset over the ocean');
    expect(result.flags).toEqual({});
  });

  it('should parse prompt with a space-separated flag value', () => {
    const result = parseImageArgs('a sunset --ratio 16:9');
    expect(result.prompt).toBe('a sunset');
    expect(result.flags['ratio']).toBe('16:9');
  });

  it('should parse --return as boolean flag', () => {
    const result = parseImageArgs('a cat --return');
    expect(result.prompt).toBe('a cat');
    expect(result.flags['return']).toBe(true);
  });

  it('should parse inline flag values with =', () => {
    const result = parseImageArgs('a cat --ratio=16:9 --size=4K');
    expect(result.prompt).toBe('a cat');
    expect(result.flags['ratio']).toBe('16:9');
    expect(result.flags['size']).toBe('4K');
  });

  it('should handle multiple flags', () => {
    const result = parseImageArgs(
      'abstract wallpaper --ratio 21:9 --size 4K --count 2 --return',
    );
    expect(result.prompt).toBe('abstract wallpaper');
    expect(result.flags['ratio']).toBe('21:9');
    expect(result.flags['size']).toBe('4K');
    expect(result.flags['count']).toBe('2');
    expect(result.flags['return']).toBe(true);
  });

  it('should return empty prompt when input starts with flags', () => {
    const result = parseImageArgs('--ratio 16:9');
    expect(result.prompt).toBe('');
    expect(result.flags['ratio']).toBe('16:9');
  });

  it('should handle empty input', () => {
    const result = parseImageArgs('');
    expect(result.prompt).toBe('');
    expect(result.flags).toEqual({});
  });
});

describe('imageCommand', () => {
  const mockContext = {} as Parameters<
    NonNullable<typeof imageCommand.action>
  >[0];

  it('should return error for empty args', () => {
    const result = imageCommand.action!(mockContext, '');
    expect(result).toEqual(
      expect.objectContaining({
        type: 'message',
        messageType: 'error',
      }),
    );
  });

  it('should return error when prompt is empty (only flags)', () => {
    const result = imageCommand.action!(mockContext, '--ratio 16:9');
    expect(result).toEqual(
      expect.objectContaining({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('No prompt provided'),
      }),
    );
  });

  it('should return tool action for valid prompt', () => {
    const result = imageCommand.action!(mockContext, 'a sunset over the ocean');
    expect(result).toEqual({
      type: 'tool',
      toolName: 'generate_image',
      toolArgs: { prompt: 'a sunset over the ocean' },
    });
  });

  it('should map all flags to tool args correctly', () => {
    const result = imageCommand.action!(
      mockContext,
      'a cat --ratio 16:9 --size 2K --count 3 --model gemini-3-pro-image-preview --edit ./img.png --output ./out --return',
    );
    expect(result).toEqual({
      type: 'tool',
      toolName: 'generate_image',
      toolArgs: {
        prompt: 'a cat',
        aspect_ratio: '16:9',
        size: '2K',
        count: 3,
        model: 'gemini-3-pro-image-preview',
        input_image: './img.png',
        output_path: './out',
        return_to_context: true,
      },
    });
  });

  it('should have correct metadata', () => {
    expect(imageCommand.name).toBe('image');
    expect(imageCommand.altNames).toContain('img');
    expect(imageCommand.kind).toBe('built-in');
    expect(imageCommand.autoExecute).toBe(false);
  });

  it('should provide flag completions', () => {
    const completions = imageCommand.completion!(mockContext, '--ra');
    expect(completions).toContain('--ratio');
  });

  it('should return empty completions for non-flag input', () => {
    const completions = imageCommand.completion!(mockContext, 'some');
    expect(completions).toEqual([]);
  });
});
