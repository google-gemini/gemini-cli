/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { HumanLoopTool } from './human-loop.js';

describe('HumanLoopTool', () => {
  it('validates presence of prompt', () => {
    const tool = new HumanLoopTool();
    // @ts-expect-error testing invalid params
    expect(tool.validateToolParams({})).toMatch(/prompt/);
    expect(tool.validateToolParams({ prompt: 'hi' })).toBeNull();
  });

  it('returns provided response without prompting', async () => {
    const tool = new HumanLoopTool();
    const result = await tool.execute({ prompt: 'Say', response: 'hello' });
    expect(result.llmContent).toBe('hello');
    expect(result.returnDisplay).toBe('hello');
  });
});
