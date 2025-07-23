/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DefaultArgumentProcessor,
  ShorthandArgumentProcessor,
} from './argumentProcessor.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('Argument Processors', () => {
  describe('ShorthandArgumentProcessor', () => {
    const processor = new ShorthandArgumentProcessor();

    it('should replace a single {{args}} instance', async () => {
      const prompt = 'Refactor the following code: {{args}}';
      const context = createMockCommandContext({
        invocation: {
          raw: '/refactor make it faster',
          name: 'refactor',
          args: 'make it faster',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toBe('Refactor the following code: make it faster');
    });

    it('should replace multiple {{args}} instances', async () => {
      const prompt = 'User said: {{args}}. I repeat: {{args}}!';
      const context = createMockCommandContext({
        invocation: {
          raw: '/repeat hello world',
          name: 'repeat',
          args: 'hello world',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toBe('User said: hello world. I repeat: hello world!');
    });

    it('should handle an empty args string', async () => {
      const prompt = 'The user provided no input: {{args}}.';
      const context = createMockCommandContext({
        invocation: {
          raw: '/input',
          name: 'input',
          args: '',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toBe('The user provided no input: .');
    });

    it('should not change the prompt if {{args}} is not present', async () => {
      const prompt = 'This is a static prompt.';
      const context = createMockCommandContext({
        invocation: {
          raw: '/static some arguments',
          name: 'static',
          args: 'some arguments',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toBe('This is a static prompt.');
    });
  });

  describe('DefaultArgumentProcessor', () => {
    const processor = new DefaultArgumentProcessor();

    it('should append the full command if args are provided', async () => {
      const prompt = 'Parse the command.';
      const context = createMockCommandContext({
        invocation: {
          raw: '/mycommand arg1 "arg two"',
          name: 'mycommand',
          args: 'arg1 "arg two"',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toBe('Parse the command.\n\n/mycommand arg1 "arg two"');
    });

    it('should NOT append the full command if no args are provided', async () => {
      const prompt = 'Parse the command.';
      const context = createMockCommandContext({
        invocation: {
          raw: '/mycommand',
          name: 'mycommand',
          args: '',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toBe('Parse the command.');
    });
  });
});
