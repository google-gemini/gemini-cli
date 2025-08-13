/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { addProgrammingLanguageToEvent } from './telemetry-utils.js';
import { ToolCallEvent } from './types.js';

describe('addProgrammingLanguageToEvent', () => {
  const baseEvent: Omit<ToolCallEvent, 'function_args'> = {
    'event.name': 'tool_call',
    'event.timestamp': '2025-08-12T00:00:00.000Z',
    function_name: 'test_function',
    duration_ms: 100,
    success: true,
    prompt_id: 'test_prompt_id',
  };

  it('should add the programming language when file_path is present', () => {
    const event: ToolCallEvent = {
      ...baseEvent,
      function_args: {
        file_path: 'src/test.ts',
      },
    };
    const updatedEvent = addProgrammingLanguageToEvent(event);
    expect(updatedEvent.programming_language).toBe('TypeScript');
  });

  it('should add the programming language when absolute_path is present', () => {
    const event: ToolCallEvent = {
      ...baseEvent,
      function_args: {
        absolute_path: 'src/test.py',
      },
    };
    const updatedEvent = addProgrammingLanguageToEvent(event);
    expect(updatedEvent.programming_language).toBe('Python');
  });

  it('should not add the programming language when no file path is present', () => {
    const event: ToolCallEvent = {
      ...baseEvent,
      function_args: {},
    };
    const updatedEvent = addProgrammingLanguageToEvent(event);
    expect(updatedEvent.programming_language).toBeUndefined();
  });

  it('should handle unknown file extensions gracefully', () => {
    const event: ToolCallEvent = {
      ...baseEvent,
      function_args: {
        file_path: 'src/test.unknown',
      },
    };
    const updatedEvent = addProgrammingLanguageToEvent(event);
    expect(updatedEvent.programming_language).toBeUndefined();
  });

  it('should handle files with no extension', () => {
    const event: ToolCallEvent = {
      ...baseEvent,
      function_args: {
        file_path: 'src/test',
      },
    };
    const updatedEvent = addProgrammingLanguageToEvent(event);
    expect(updatedEvent.programming_language).toBeUndefined();
  });

  it('should not modify the event if function_args is not present', () => {
    const event: ToolCallEvent = {
      ...baseEvent,
      function_args: undefined as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const updatedEvent = addProgrammingLanguageToEvent(event);
    expect(updatedEvent.programming_language).toBeUndefined();
  });
});
