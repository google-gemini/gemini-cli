/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { FinishTool } from './finish.js';
import { Kind } from './tools.js';

describe('FinishTool', () => {
  it('should have the correct properties', () => {
    const tool = new FinishTool();
    expect(tool.name).toBe('finish');
    expect(tool.displayName).toBe('Finish');
    expect(tool.description).toBe('Signals that the AI has finished its turn.');
    expect(tool.kind).toBe(Kind.Other);
    expect(
      (tool.schema.parametersJsonSchema as { properties: unknown }).properties,
    ).toHaveProperty('summary');
  });

  it('should create a valid invocation', () => {
    const tool = new FinishTool();
    const params = { summary: 'All tasks are complete.' };
    const invocation = tool.build(params);
    expect(invocation).toBeDefined();
    expect(invocation.params).toEqual(params);
  });

  describe('FinishToolInvocation', () => {
    it('should have a correct description', () => {
      const tool = new FinishTool();
      const params = { summary: 'The task is done.' };
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(
        'Finishing turn with summary: The task is done.',
      );
    });

    it('should execute and return the summary', async () => {
      const tool = new FinishTool();
      const params = { summary: 'Successfully refactored the component.' };
      const invocation = tool.build(params);
      const signal = new AbortController().signal;
      const result = await invocation.execute(signal);
      expect(result.llmContent).toBe(
        'Finished: Successfully refactored the component.',
      );
      expect(result.returnDisplay).toBe(
        'Finished: Successfully refactored the component.',
      );
    });
  });
});
