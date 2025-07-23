/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ModelLedArgumentProcessor,
  ShorthandArgumentProcessor,
} from './argumentProcessor.js';

describe('Argument Processors', () => {
  describe('ShorthandArgumentProcessor', () => {
    const processor = new ShorthandArgumentProcessor();
    const DUMMY_FULL_COMMAND = '';

    it('should replace a single {{args}} instance', async () => {
      const prompt = 'Refactor the following code: {{args}}';
      const args = 'make it faster';
      const result = await processor.process(prompt, args, DUMMY_FULL_COMMAND);
      expect(result).toBe('Refactor the following code: make it faster');
    });

    it('should replace multiple {{args}} instances', async () => {
      const prompt = 'User said: {{args}}. I repeat: {{args}}!';
      const args = 'hello world';
      const result = await processor.process(prompt, args, DUMMY_FULL_COMMAND);
      expect(result).toBe('User said: hello world. I repeat: hello world!');
    });

    it('should handle an empty args string', async () => {
      const prompt = 'The user provided no input: {{args}}.';
      const args = '';
      const result = await processor.process(prompt, args, DUMMY_FULL_COMMAND);
      expect(result).toBe('The user provided no input: .');
    });

    it('should not change the prompt if {{args}} is not present', async () => {
      const prompt = 'This is a static prompt.';
      const args = 'some arguments';
      const result = await processor.process(prompt, args, DUMMY_FULL_COMMAND);
      expect(result).toBe('This is a static prompt.');
    });
  });

  describe('ModelLedArgumentProcessor', () => {
    const processor = new ModelLedArgumentProcessor();

    it('should prepend the full command and separator', async () => {
      const prompt = 'Parse the command.';
      const args = 'arg1 "arg two"';
      const fullCommand = '/mycommand arg1 "arg two"';
      const result = await processor.process(prompt, args, fullCommand);
      expect(result).toBe(
        '/mycommand arg1 "arg two"\n\n---\n\nParse the command.',
      );
    });

    it('should handle commands with no arguments', async () => {
      const prompt = 'Parse the command.';
      const args = '';
      const fullCommand = '/mycommand';
      const result = await processor.process(prompt, args, fullCommand);
      expect(result).toBe('/mycommand\n\n---\n\nParse the command.');
    });
  });
});
