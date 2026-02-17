/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SdkTool, tool, ModelVisibleError } from './tool.js';
import type { MessageBus } from '@google/gemini-cli-core';

// Mock MessageBus
const mockMessageBus = {} as unknown as MessageBus;

describe('tool()', () => {
  it('creates a tool definition with defaults', () => {
    const definition = tool(
      {
        name: 'testTool',
        description: 'A test tool',
        inputSchema: z.object({ foo: z.string() }),
      },
      async () => 'result',
    );

    expect(definition.name).toBe('testTool');
    expect(definition.description).toBe('A test tool');
    expect(definition.sendErrorsToModel).toBeUndefined();
  });

  it('creates a tool definition with explicit configuration', () => {
    const definition = tool(
      {
        name: 'testTool',
        description: 'A test tool',
        inputSchema: z.object({ foo: z.string() }),
        sendErrorsToModel: true,
      },
      async () => 'result',
    );

    expect(definition.sendErrorsToModel).toBe(true);
  });
});

describe('SdkTool Execution', () => {
  it('executes successfully', async () => {
    const definition = tool(
      {
        name: 'successTool',
        description: 'Always succeeds',
        inputSchema: z.object({ val: z.string() }),
      },
      async ({ val }) => `Success: ${val}`,
    );

    const sdkTool = new SdkTool(definition, mockMessageBus);
    const invocation = sdkTool.createInvocationWithContext(
      { val: 'test' },
      mockMessageBus,
      undefined,
    );
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toBe('Success: test');
    expect(result.error).toBeUndefined();
  });

  it('throws standard Error by default', async () => {
    const definition = tool(
      {
        name: 'failTool',
        description: 'Always fails',
        inputSchema: z.object({}),
      },
      async () => {
        throw new Error('Standard error');
      },
    );

    const sdkTool = new SdkTool(definition, mockMessageBus);
    const invocation = sdkTool.createInvocationWithContext(
      {},
      mockMessageBus,
      undefined,
    );

    await expect(
      invocation.execute(new AbortController().signal),
    ).rejects.toThrow('Standard error');
  });

  it('catches ModelVisibleError and returns ToolResult error', async () => {
    const definition = tool(
      {
        name: 'visibleErrorTool',
        description: 'Fails with visible error',
        inputSchema: z.object({}),
      },
      async () => {
        throw new ModelVisibleError('Visible error');
      },
    );

    const sdkTool = new SdkTool(definition, mockMessageBus);
    const invocation = sdkTool.createInvocationWithContext(
      {},
      mockMessageBus,
      undefined,
    );
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Visible error');
    expect(result.llmContent).toContain('Error: Visible error');
  });

  it('catches standard Error when sendErrorsToModel is true', async () => {
    const definition = tool(
      {
        name: 'catchAllTool',
        description: 'Catches all errors',
        inputSchema: z.object({}),
        sendErrorsToModel: true,
      },
      async () => {
        throw new Error('Standard error');
      },
    );

    const sdkTool = new SdkTool(definition, mockMessageBus);
    const invocation = sdkTool.createInvocationWithContext(
      {},
      mockMessageBus,
      undefined,
    );
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Standard error');
    expect(result.llmContent).toContain('Error: Standard error');
  });
});
