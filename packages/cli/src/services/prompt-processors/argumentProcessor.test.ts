/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultArgumentProcessor } from './argumentProcessor.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { describe, it, expect } from 'vitest';

describe('Argument Processors', () => {
  describe('DefaultArgumentProcessor', () => {
    const processor = new DefaultArgumentProcessor();

    it('should append the full command if args are provided', async () => {
      const prompt = [{ text: 'Parse the command.' }];
      const context = createMockCommandContext({
        invocation: {
          raw: '/mycommand arg1 "arg two"',
          name: 'mycommand',
          args: 'arg1 "arg two"',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toEqual([
        { text: 'Parse the command.\n\n/mycommand arg1 "arg two"' },
      ]);
    });

    it('should NOT append the full command if no args are provided', async () => {
      const prompt = [{ text: 'Parse the command.' }];
      const context = createMockCommandContext({
        invocation: {
          raw: '/mycommand',
          name: 'mycommand',
          args: '',
        },
      });
      const result = await processor.process(prompt, context);
      expect(result).toEqual([{ text: 'Parse the command.' }]);
    });
  });
});
