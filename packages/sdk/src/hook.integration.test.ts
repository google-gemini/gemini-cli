/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { GeminiCliAgent } from './agent.js';
import { hook, type EventInputMap, type EventOutputMap } from './hook.js';
import { HookEventName, SessionEndReason } from '@google/gemini-cli-core';
import { tool } from './tool.js';
import type { SessionContext } from './types.js';
import { z } from 'zod';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getGoldenPath = (name: string) =>
  path.resolve(__dirname, '../test-data', `${name}.json`);

// Set this to true locally when you need to update snapshots
const RECORD_MODE = process.env['RECORD_NEW_RESPONSES'] === 'true';

describe('GeminiCliAgent Hook Integration', () => {
  it('executes BeforeTool and AfterTool hooks', async () => {
    const goldenFile = getGoldenPath('hook-tool-test');

    const beforeAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.BeforeTool],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.BeforeTool] | void>
      >()
      .mockResolvedValue(undefined);

    const afterAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.AfterTool],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.AfterTool] | void>
      >()
      .mockResolvedValue({
        hookSpecificOutput: {
          hookEventName: 'AfterTool',
          additionalContext: 'Hook added this context',
        },
      });

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
      tools: [
        tool(
          {
            name: 'add',
            description: 'Adds two numbers',
            inputSchema: z.object({ a: z.number(), b: z.number() }),
          },
          async ({ a, b }) => a + b,
        ),
      ],
      hooks: [
        hook(
          { event: HookEventName.BeforeTool, name: 'before', matcher: 'add' },
          beforeAction,
        ),
        hook(
          { event: HookEventName.AfterTool, name: 'after', matcher: 'add' },
          afterAction,
        ),
      ],
    });

    const stream = agent.session().sendStream('What is 5 + 3?');
    for await (const _ of stream) {
      // consume stream
    }

    expect(beforeAction).toHaveBeenCalled();
    expect(afterAction).toHaveBeenCalled();

    const beforeInput = beforeAction.mock.calls[0][0];
    expect(beforeInput.tool_name).toBe('add');
    expect(beforeInput.tool_input).toEqual({ a: 5, b: 3 });

    const afterInput = afterAction.mock.calls[0][0];
    expect(afterInput.tool_name).toBe('add');
    expect(afterInput.tool_response).toEqual({
      llmContent: '8',
      returnDisplay: '8',
      error: undefined,
    });

    const context = afterAction.mock.calls[0][1];
    expect(context.sessionId).toBeDefined();
    expect(context.fs).toBeDefined();
    expect(context.shell).toBeDefined();
  }, 10000);

  it('executes BeforeAgent and AfterAgent hooks', async () => {
    const goldenFile = getGoldenPath('hook-agent-test');

    const beforeAgentAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.BeforeAgent],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.BeforeAgent] | void>
      >()
      .mockResolvedValue(undefined);

    const afterAgentAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.AfterAgent],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.AfterAgent] | void>
      >()
      .mockResolvedValue(undefined);

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
      hooks: [
        hook(
          { event: HookEventName.BeforeAgent, name: 'beforeAgent' },
          beforeAgentAction,
        ),
        hook(
          { event: HookEventName.AfterAgent, name: 'afterAgent' },
          afterAgentAction,
        ),
      ],
    });

    const stream = agent.session().sendStream('hi');
    for await (const _ of stream) {
      /* consume */
    }

    expect(beforeAgentAction).toHaveBeenCalled();
    expect(afterAgentAction).toHaveBeenCalled();
  });

  it('executes BeforeModel, AfterModel, and BeforeToolSelection hooks', async () => {
    const goldenFile = getGoldenPath('hook-model-test');

    const beforeModelAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.BeforeModel],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.BeforeModel] | void>
      >()
      .mockResolvedValue(undefined);

    const afterModelAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.AfterModel],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.AfterModel] | void>
      >()
      .mockResolvedValue(undefined);

    const beforeToolSelectionAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.BeforeToolSelection],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.BeforeToolSelection] | void>
      >()
      .mockResolvedValue(undefined);

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
      tools: [
        tool(
          {
            name: 'add',
            description: 'Adds two numbers',
            inputSchema: z.object({ a: z.number(), b: z.number() }),
          },
          async ({ a, b }) => a + b,
        ),
      ],
      hooks: [
        hook(
          { event: HookEventName.BeforeModel, name: 'beforeModel' },
          beforeModelAction,
        ),
        hook(
          { event: HookEventName.AfterModel, name: 'afterModel' },
          afterModelAction,
        ),
        hook(
          {
            event: HookEventName.BeforeToolSelection,
            name: 'beforeToolSelection',
          },
          beforeToolSelectionAction,
        ),
      ],
    });

    const stream = agent.session().sendStream('What is 5 + 3?');
    for await (const _ of stream) {
      /* consume */
    }

    expect(beforeModelAction).toHaveBeenCalled();
    expect(afterModelAction).toHaveBeenCalled();
    expect(beforeToolSelectionAction).toHaveBeenCalled();
  });

  it('executes SessionStart and SessionEnd hooks', async () => {
    const goldenFile = getGoldenPath('hook-agent-test');
    const sessionStartAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.SessionStart],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.SessionStart] | void>
      >()
      .mockResolvedValue(undefined);
    const sessionEndAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.SessionEnd],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.SessionEnd] | void>
      >()
      .mockResolvedValue(undefined);

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      fakeResponses: goldenFile,
      hooks: [
        hook(
          { event: HookEventName.SessionStart, name: 'sessionStart' },
          sessionStartAction,
        ),
        hook(
          { event: HookEventName.SessionEnd, name: 'sessionEnd' },
          sessionEndAction,
        ),
      ],
    });

    const session = agent.session();
    await session.initialize();

    expect(sessionStartAction).toHaveBeenCalled();

    await session.close(SessionEndReason.Exit);
    expect(sessionEndAction).toHaveBeenCalled();
  });

  it('executes Notification and PreCompress hooks when triggered', async () => {
    const goldenFile = getGoldenPath('hook-agent-test');
    const notificationAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.Notification],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.Notification] | void>
      >()
      .mockResolvedValue(undefined);
    const preCompressAction = vi
      .fn<
        (
          input: EventInputMap[HookEventName.PreCompress],
          context: SessionContext,
        ) => Promise<EventOutputMap[HookEventName.PreCompress] | void>
      >()
      .mockResolvedValue(undefined);

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      fakeResponses: goldenFile,
      hooks: [
        hook(
          { event: HookEventName.Notification, name: 'notification' },
          notificationAction,
        ),
        hook(
          { event: HookEventName.PreCompress, name: 'preCompress' },
          preCompressAction,
        ),
      ],
    });

    const session = agent.session();
    await session.initialize();

    // Reaching into private state for testing purposes to trigger events that are hard to hit naturally
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookSystem = (session as any).config.getHookSystem();

    // Trigger notification via fireToolNotificationEvent
    await hookSystem.fireToolNotificationEvent({
      title: 'Permission',
      message: 'Allow tool?',
    });
    expect(notificationAction).toHaveBeenCalled();

    await hookSystem.firePreCompressEvent('Manual');
    expect(preCompressAction).toHaveBeenCalled();
  });
});
