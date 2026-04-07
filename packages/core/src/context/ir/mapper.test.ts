/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { IrMapper } from './mapper.js';
import { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { Content } from '@google/genai';
import type { UserPrompt, ToolExecution, AgentThought } from './types.js';

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

    const tokenCalculator = new ContextTokenCalculator(4);
    const episodes = IrMapper.toIr(rawHistory, tokenCalculator);

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
    // Reconstituted history is identical except tool IDs will be reassigned because IrMapper discards string IDs in favor of deterministic object hash IDs
    expect(reconstituted[1].parts![0]).toEqual(rawHistory[1].parts![0]);

    // The exact structural equivalence isn't mathematically perfect because Gemini allows mixing text and calls
    // in one Content block, but the flat representation is semantically identical.
  });

  it('should correctly handle multi-tool-calls grouped within a single turn without dropping observations', () => {
    const rawHistory: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'Examine both of these tools please.' }],
      },
      {
        role: 'model',
        parts: [
          { text: 'I will call them concurrently.' },
          {
            functionCall: {
              id: 'c1',
              name: 'tool_one',
              args: { p: 1 },
            },
          },
          {
            functionCall: {
              id: 'c2',
              name: 'tool_two',
              args: { p: 2 },
            },
          },
        ],
      },
      // Gemini forces the user turn to contain ALL function responses for that model turn
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'c1',
              name: 'tool_one',
              response: { r: 1 },
            },
          },
          {
            functionResponse: {
              id: 'c2',
              name: 'tool_two',
              response: { r: 2 },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [{ text: 'Both complete.' }],
      },
    ];

    const tokenCalculator = new ContextTokenCalculator(4);
    const episodes = IrMapper.toIr(rawHistory, tokenCalculator);

    // It should collapse into a single episode
    expect(episodes).toHaveLength(1);
    const ep = episodes[0];

    expect(ep.trigger.type).toBe('USER_PROMPT');

    // The steps array should contain:
    // 0: AgentThought ("I will call them concurrently")
    // 1: ToolExecution(tool_one)
    // 2: ToolExecution(tool_two)

    expect(ep.steps).toHaveLength(3);

    expect(ep.steps[0].type).toBe('AGENT_THOUGHT');
    expect((ep.steps[0] as AgentThought).text).toBe(
      'I will call them concurrently.',
    );

    expect(ep.steps[1].type).toBe('TOOL_EXECUTION');
    expect((ep.steps[1] as ToolExecution).toolName).toBe('tool_one');
    expect((ep.steps[1] as ToolExecution).intent).toEqual({ p: 1 });
    expect((ep.steps[1] as ToolExecution).observation).toEqual({ r: 1 });

    expect(ep.steps[2].type).toBe('TOOL_EXECUTION');
    expect((ep.steps[2] as ToolExecution).toolName).toBe('tool_two');
    expect((ep.steps[2] as ToolExecution).intent).toEqual({ p: 2 });
    expect((ep.steps[2] as ToolExecution).observation).toEqual({ r: 2 });

    // The final model turn should become the yield
    expect(ep.yield).toBeDefined();
    expect(ep.yield?.type).toBe('AGENT_YIELD');
    expect(ep.yield?.text).toBe('Both complete.');

    // Now verify we can reconstitute it without dropping the multiple calls
    const reconstituted = IrMapper.fromIr(episodes);

    // The reconstituted history should have exactly 4 turns, same as original
    expect(reconstituted).toHaveLength(4);

    // Check that the Model turn has both function calls
    expect(reconstituted[1].role).toBe('model');
    expect(reconstituted[1].parts).toHaveLength(3); // text + call1 + call2
    expect(reconstituted[1].parts![1].functionCall?.name).toBe('tool_one');
    expect(reconstituted[1].parts![2].functionCall?.name).toBe('tool_two');

    // Check that the User turn has both function responses
    expect(reconstituted[2].role).toBe('user');
    expect(reconstituted[2].parts).toHaveLength(2); // response1 + response2
    expect(reconstituted[2].parts![0].functionResponse?.name).toBe('tool_one');
    expect(reconstituted[2].parts![1].functionResponse?.name).toBe('tool_two');
  });

  it('should guarantee WeakMap ID stability across continuous mapping', () => {
    // 1. Initial history
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];

    const tokenCalculator = new ContextTokenCalculator(4);
    const initialIr = IrMapper.toIr(history, tokenCalculator);
    expect(initialIr).toHaveLength(1);

    // Save the uniquely generated deterministic ID for the first episode
    const episodeId = initialIr[0].id;
    const triggerId = initialIr[0].trigger.id;

    // 2. Push new history (simulating a continuing conversation)
    history.push({ role: 'user', parts: [{ text: 'How are you?' }] });
    history.push({ role: 'model', parts: [{ text: 'I am an AI.' }] });

    const updatedIr = IrMapper.toIr(history, tokenCalculator);
    expect(updatedIr).toHaveLength(2);

    // 3. Verify ID Stability
    // The exact same ID must be generated for the first episode because the underlying Content object reference hasn't changed.
    // This proves the WeakMap successfully pinned the reference!
    expect(updatedIr[0].id).toBe(episodeId);
    expect(updatedIr[0].trigger.id).toBe(triggerId);

    // Ensure the new episode has a different ID
    expect(updatedIr[1].id).not.toBe(episodeId);
  });
});
