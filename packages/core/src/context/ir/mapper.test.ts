/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { IrMapper } from './mapper.js';
import type { Content } from '@google/genai';
import type { UserPrompt, ToolExecution } from './types.js';

describe('IrMapper', () => {
  it('should correctly map a complex conversation into Episodes and back', () => {
    const rawHistory: Content[] = [
      { role: 'user', parts: [{ text: 'Can you read file A and B?' }] },
      {
        role: 'model',
        parts: [
          { text: 'Let me check those files.' },
          {
            functionCall: {
              id: 'call_1',
              name: 'read_file',
              args: { filepath: 'A.txt' },
            },
          },
          {
            functionCall: {
              id: 'call_2',
              name: 'read_file',
              args: { filepath: 'B.txt' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_1',
              name: 'read_file',
              response: { output: 'Contents of A' },
            },
          },
          {
            functionResponse: {
              id: 'call_2',
              name: 'read_file',
              response: { output: 'Contents of B' },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          { text: 'Thanks. Now I will compile.' },
          {
            functionCall: {
              id: 'call_3',
              name: 'shell',
              args: { cmd: 'make' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_3',
              name: 'shell',
              response: { output: 'success' },
            },
          },
        ],
      },
      { role: 'model', parts: [{ text: 'Everything is done!' }] },
    ];

    const episodes = IrMapper.toIr(rawHistory);

    expect(episodes).toHaveLength(1);
    const ep = episodes[0];

    expect(ep.trigger.type).toBe('USER_PROMPT');
    expect(
      ((ep.trigger as UserPrompt).semanticParts[0] as { text: string }).text,
    ).toBe('Can you read file A and B?');

    // Steps should be: Thought, ToolExecution(A), ToolExecution(B), Thought, ToolExecution(make)
    expect(ep.steps).toHaveLength(5);
    expect(ep.steps[0].type).toBe('AGENT_THOUGHT');
    expect(ep.steps[1].type).toBe('TOOL_EXECUTION');
    expect((ep.steps[1] as ToolExecution).toolName).toBe('read_file');
    expect((ep.steps[1] as ToolExecution).intent).toEqual({
      filepath: 'A.txt',
    });
    expect((ep.steps[1] as ToolExecution).observation).toEqual({
      output: 'Contents of A',
    });

    expect(ep.steps[2].type).toBe('TOOL_EXECUTION');
    expect((ep.steps[2] as ToolExecution).intent).toEqual({
      filepath: 'B.txt',
    });

    expect(ep.steps[3].type).toBe('AGENT_THOUGHT');

    expect(ep.steps[4].type).toBe('TOOL_EXECUTION');
    expect((ep.steps[4] as ToolExecution).toolName).toBe('shell');

    expect(ep.yield?.type).toBe('AGENT_YIELD');
    expect(ep.yield?.text).toBe('Everything is done!');

    // Test Re-serialization
    const reconstituted = IrMapper.fromIr(episodes);

    // Compare basic structure (the reconstituted version might have slightly different grouping of calls/responses
    // based on flush logic, but semantically equivalent)
    expect(reconstituted[0]).toEqual(rawHistory[0]);
    expect(reconstituted[1]).toEqual({
      role: 'model',
      parts: [{ text: 'Let me check those files.' }],
    }); // We flushed after thought

    // The exact structural equivalence isn't mathematically perfect because Gemini allows mixing text and calls
    // in one Content block, but the flat representation is semantically identical.
  });
});
