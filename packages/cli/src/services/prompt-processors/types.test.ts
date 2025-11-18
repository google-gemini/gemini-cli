/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  type PromptPipelineContent,
  type IPromptProcessor,
  SHORTHAND_ARGS_PLACEHOLDER,
  SHELL_INJECTION_TRIGGER,
  AT_FILE_INJECTION_TRIGGER,
} from './types.js';
import type { CommandContext } from '../../ui/commands/types.js';

describe('prompt-processors types', () => {
  describe('PromptPipelineContent type', () => {
    it('should be an array type', () => {
      const content: PromptPipelineContent = [];

      expect(Array.isArray(content)).toBe(true);
    });

    it('should accept text parts', () => {
      const content: PromptPipelineContent = [{ text: 'Hello' }];

      expect(content).toHaveLength(1);
      expect(content[0]).toHaveProperty('text');
    });

    it('should accept multiple parts', () => {
      const content: PromptPipelineContent = [
        { text: 'Hello' },
        { text: 'World' },
      ];

      expect(content).toHaveLength(2);
    });

    it('should accept empty array', () => {
      const content: PromptPipelineContent = [];

      expect(content).toHaveLength(0);
    });

    it('should be compatible with part union types', () => {
      const content: PromptPipelineContent = [
        { text: 'text content' },
        { inlineData: { mimeType: 'image/png', data: 'base64data' } },
      ];

      expect(content).toHaveLength(2);
    });
  });

  describe('IPromptProcessor interface', () => {
    it('should define process method', () => {
      const processor: IPromptProcessor = {
        process: vi.fn().mockResolvedValue([]),
      };

      expect(processor.process).toBeDefined();
      expect(typeof processor.process).toBe('function');
    });

    it('should accept prompt and context parameters', async () => {
      const mockProcess = vi.fn().mockResolvedValue([]);
      const processor: IPromptProcessor = {
        process: mockProcess,
      };

      const prompt: PromptPipelineContent = [{ text: 'test' }];
      const context = {} as CommandContext;

      await processor.process(prompt, context);

      expect(mockProcess).toHaveBeenCalledWith(prompt, context);
    });

    it('should return Promise of PromptPipelineContent', async () => {
      const processor: IPromptProcessor = {
        process: async () => [{ text: 'processed' }],
      };

      const result = processor.process([], {} as CommandContext);

      expect(result).toBeInstanceOf(Promise);
      const resolved = await result;
      expect(Array.isArray(resolved)).toBe(true);
    });

    it('should allow transformation of content', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => [...prompt, { text: 'added' }],
      };

      const input: PromptPipelineContent = [{ text: 'original' }];
      const output = await processor.process(input, {} as CommandContext);

      expect(output).toHaveLength(2);
      expect(output[1]).toEqual({ text: 'added' });
    });

    it('should access context in process method', async () => {
      const processor: IPromptProcessor = {
        process: async (_prompt, context) => [{ text: `Context: ${context}` }],
      };

      const mockContext = { invocation: { raw: 'test' } } as never;
      await processor.process([], mockContext);

      expect(processor.process).toBeDefined();
    });

    it('should handle empty prompt', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => prompt,
      };

      const result = await processor.process([], {} as CommandContext);

      expect(result).toEqual([]);
    });

    it('should be chainable in pipeline', async () => {
      const processor1: IPromptProcessor = {
        process: async (prompt) => [...prompt, { text: 'step1' }],
      };

      const processor2: IPromptProcessor = {
        process: async (prompt) => [...prompt, { text: 'step2' }],
      };

      let result: PromptPipelineContent = [];
      result = await processor1.process(result, {} as CommandContext);
      result = await processor2.process(result, {} as CommandContext);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'step1' });
      expect(result[1]).toEqual({ text: 'step2' });
    });

    it('should handle async operations', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [...prompt, { text: 'async result' }];
        },
      };

      const result = await processor.process([], {} as CommandContext);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: 'async result' });
    });
  });

  describe('SHORTHAND_ARGS_PLACEHOLDER', () => {
    it('should be defined', () => {
      expect(SHORTHAND_ARGS_PLACEHOLDER).toBeDefined();
    });

    it('should be a string', () => {
      expect(typeof SHORTHAND_ARGS_PLACEHOLDER).toBe('string');
    });

    it('should equal "{{args}}"', () => {
      expect(SHORTHAND_ARGS_PLACEHOLDER).toBe('{{args}}');
    });

    it('should have double braces', () => {
      expect(SHORTHAND_ARGS_PLACEHOLDER).toMatch(/^\{\{.*\}\}$/);
    });

    it('should contain "args"', () => {
      expect(SHORTHAND_ARGS_PLACEHOLDER).toContain('args');
    });

    it('should be usable in string replacement', () => {
      const template = `Command with ${SHORTHAND_ARGS_PLACEHOLDER}`;
      const result = template.replace(SHORTHAND_ARGS_PLACEHOLDER, 'value');

      expect(result).toBe('Command with value');
    });
  });

  describe('SHELL_INJECTION_TRIGGER', () => {
    it('should be defined', () => {
      expect(SHELL_INJECTION_TRIGGER).toBeDefined();
    });

    it('should be a string', () => {
      expect(typeof SHELL_INJECTION_TRIGGER).toBe('string');
    });

    it('should equal "!{"', () => {
      expect(SHELL_INJECTION_TRIGGER).toBe('!{');
    });

    it('should start with exclamation mark', () => {
      expect(SHELL_INJECTION_TRIGGER).toMatch(/^!/);
    });

    it('should end with opening brace', () => {
      expect(SHELL_INJECTION_TRIGGER).toMatch(/\{$/);
    });

    it('should be detectable in strings', () => {
      const text = 'Some text !{command} more text';

      expect(text.includes(SHELL_INJECTION_TRIGGER)).toBe(true);
    });

    it('should have length 2', () => {
      expect(SHELL_INJECTION_TRIGGER.length).toBe(2);
    });
  });

  describe('AT_FILE_INJECTION_TRIGGER', () => {
    it('should be defined', () => {
      expect(AT_FILE_INJECTION_TRIGGER).toBeDefined();
    });

    it('should be a string', () => {
      expect(typeof AT_FILE_INJECTION_TRIGGER).toBe('string');
    });

    it('should equal "@{"', () => {
      expect(AT_FILE_INJECTION_TRIGGER).toBe('@{');
    });

    it('should start with at symbol', () => {
      expect(AT_FILE_INJECTION_TRIGGER).toMatch(/^@/);
    });

    it('should end with opening brace', () => {
      expect(AT_FILE_INJECTION_TRIGGER).toMatch(/\{$/);
    });

    it('should be detectable in strings', () => {
      const text = 'Include @{file.txt} content';

      expect(text.includes(AT_FILE_INJECTION_TRIGGER)).toBe(true);
    });

    it('should have length 2', () => {
      expect(AT_FILE_INJECTION_TRIGGER.length).toBe(2);
    });
  });

  describe('constants comparison', () => {
    it('should have different values for each trigger', () => {
      expect(SHELL_INJECTION_TRIGGER).not.toBe(AT_FILE_INJECTION_TRIGGER);
      expect(SHELL_INJECTION_TRIGGER).not.toBe(SHORTHAND_ARGS_PLACEHOLDER);
      expect(AT_FILE_INJECTION_TRIGGER).not.toBe(SHORTHAND_ARGS_PLACEHOLDER);
    });

    it('should all be strings', () => {
      expect(typeof SHELL_INJECTION_TRIGGER).toBe('string');
      expect(typeof AT_FILE_INJECTION_TRIGGER).toBe('string');
      expect(typeof SHORTHAND_ARGS_PLACEHOLDER).toBe('string');
    });

    it('should all use braces', () => {
      expect(SHELL_INJECTION_TRIGGER).toContain('{');
      expect(AT_FILE_INJECTION_TRIGGER).toContain('{');
      expect(SHORTHAND_ARGS_PLACEHOLDER).toContain('{');
    });
  });

  describe('practical usage', () => {
    it('should support processor that adds args placeholder', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => [...prompt, { text: SHORTHAND_ARGS_PLACEHOLDER }],
      };

      const result = await processor.process([], {} as CommandContext);

      expect(result[0].text).toBe('{{args}}');
    });

    it('should support processor that detects shell injection', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => {
          const hasShellInjection = prompt.some(
            (part) =>
              'text' in part && part.text?.includes(SHELL_INJECTION_TRIGGER),
          );
          return hasShellInjection ? [] : prompt;
        },
      };

      const withInjection: PromptPipelineContent = [{ text: 'test !{cmd}' }];
      const withoutInjection: PromptPipelineContent = [{ text: 'safe text' }];

      const result1 = await processor.process(
        withInjection,
        {} as CommandContext,
      );
      const result2 = await processor.process(
        withoutInjection,
        {} as CommandContext,
      );

      expect(result1).toEqual([]);
      expect(result2).toEqual(withoutInjection);
    });

    it('should support processor that handles file injection', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => prompt.map((part) => {
            if (
              'text' in part &&
              part.text?.includes(AT_FILE_INJECTION_TRIGGER)
            ) {
              return {
                text: part.text.replace(
                  `${AT_FILE_INJECTION_TRIGGER}file}`,
                  'file content',
                ),
              };
            }
            return part;
          }),
      };

      const input: PromptPipelineContent = [{ text: 'Load @{file} here' }];
      const result = await processor.process(input, {} as CommandContext);

      expect(result[0].text).toBe('Load file content here');
    });

    it('should support multi-modal content processing', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => [
            ...prompt,
            {
              inlineData: {
                mimeType: 'image/png',
                data: 'base64encodedimage',
              },
            },
          ],
      };

      const input: PromptPipelineContent = [{ text: 'Describe this image:' }];
      const result = await processor.process(input, {} as CommandContext);

      expect(result).toHaveLength(2);
      expect(result[1]).toHaveProperty('inlineData');
    });

    it('should support filtering content', async () => {
      const processor: IPromptProcessor = {
        process: async (prompt) => prompt.filter((part) => 'text' in part && part.text),
      };

      const input: PromptPipelineContent = [
        { text: 'keep this' },
        { text: '' },
        { text: 'keep this too' },
      ];
      const result = await processor.process(input, {} as CommandContext);

      expect(result).toHaveLength(2);
    });
  });

  describe('type safety', () => {
    it('should enforce async return type', () => {
      const processor: IPromptProcessor = {
        process: async () => [],
      };

      const result = processor.process([], {} as CommandContext);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should require both parameters', () => {
      const processor: IPromptProcessor = {
        process: async (prompt, context) => {
          expect(prompt).toBeDefined();
          expect(context).toBeDefined();
          return prompt;
        },
      };

      processor.process([], {} as CommandContext);
    });

    it('should return array from process', async () => {
      const processor: IPromptProcessor = {
        process: async () => [{ text: 'result' }],
      };

      const result = await processor.process([], {} as CommandContext);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
