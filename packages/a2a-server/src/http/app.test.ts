/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import {
  GeminiEventType,
  ApprovalMode,
  type ToolCallConfirmationDetails,
} from '@google/gemini-cli-core';
import type {
  TaskStatusUpdateEvent,
  SendStreamingMessageSuccessResponse,
} from '@a2a-js/sdk';
import type express from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from './app.js';
import { commandRegistry } from '../commands/command-registry.js';
import {
  assertUniqueFinalEventIsLast,
  assertTaskCreationAndWorkingStatus,
  createStreamMessageRequest,
  createMockConfig,
} from '../utils/testing_utils.js';
import { MockTool } from '@google/gemini-cli-core';
import type { Command } from '../commands/types.js';

const mockToolConfirmationFn = async () =>
  ({}) as unknown as ToolCallConfirmationDetails;

const streamToSSEEvents = (
  stream: string,
): SendStreamingMessageSuccessResponse[] =>
  stream
    .split('\n\n')
    .filter(Boolean) // Remove empty strings from trailing newlines
    .map((chunk) => {
      const dataLine = chunk
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (!dataLine) {
        throw new Error(`Invalid SSE chunk found: "${chunk}"`);
      }
      return JSON.parse(dataLine.substring(6));
    });

// Mock the logger to avoid polluting test output
// Comment out to debug tests
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let config: Config;
const getToolRegistrySpy = vi.fn().mockReturnValue(ApprovalMode.DEFAULT);
const getApprovalModeSpy = vi.fn();
const getShellExecutionConfigSpy = vi.fn();
const getExtensionsSpy = vi.fn();

vi.mock('../config/config.js', async () => {
  const actual = await vi.importActual('../config/config.js');
  return {
    ...actual,
    loadConfig: vi.fn().mockImplementation(async () => {
      const mockConfig = createMockConfig({
        getToolRegistry: getToolRegistrySpy,
        getApprovalMode: getApprovalModeSpy,
        getShellExecutionConfig: getShellExecutionConfigSpy,
        getExtensions: getExtensionsSpy,
      });
      config = mockConfig as Config;
      return config;
    }),
  };
});

// Mock the GeminiClient to avoid actual API calls
const sendMessageStreamSpy = vi.fn();
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    GeminiClient: vi.fn().mockImplementation(() => ({
      sendMessageStream: sendMessageStreamSpy,
      getUserTier: vi.fn().mockReturnValue('free'),
      initialize: vi.fn(),
    })),
  };
});

describe('E2E Tests', () => {
  let app: express.Express;
  let server: Server;

  beforeAll(async () => {
    app = await createApp();
    server = app.listen(0); // Listen on a random available port
  });

  beforeEach(() => {
    getApprovalModeSpy.mockReturnValue(ApprovalMode.DEFAULT);
  });

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new task and stream status updates (text-content) via POST /', async () => {
    sendMessageStreamSpy.mockImplementation(async function* () {
      yield* [{ type: 'content', value: 'Hello how are you?' }];
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/')
      .send(createStreamMessageRequest('hello', 'a2a-test-message'))
      .set('Content-Type', 'application/json')
      .expect(200);

    const events = streamToSSEEvents(res.text);

    assertTaskCreationAndWorkingStatus(events);

    // Status update: text-content
    const textContentEvent = events[2].result as TaskStatusUpdateEvent;
    expect(textContentEvent.kind).toBe('status-update');
    expect(textContentEvent.status.state).toBe('working');
    expect(textContentEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'text-content',
    });
    expect(textContentEvent.status.message?.parts).toMatchObject([
      { kind: 'text', text: 'Hello how are you?' },
    ]);

    // Status update: input-required (final)
    const finalEvent = events[3].result as TaskStatusUpdateEvent;
    expect(finalEvent.kind).toBe('status-update');
    expect(finalEvent.status?.state).toBe('input-required');
    expect(finalEvent.final).toBe(true);

    assertUniqueFinalEventIsLast(events);
    expect(events.length).toBe(4);
  });

  it('should create a new task, schedule a tool call, and wait for approval', async () => {
    // First call yields the tool request
    sendMessageStreamSpy.mockImplementationOnce(async function* () {
      yield* [
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'test-call-id',
            name: 'test-tool',
            args: {},
          },
        },
      ];
    });
    // Subsequent calls yield nothing
    sendMessageStreamSpy.mockImplementation(async function* () {
      yield* [];
    });

    const mockTool = new MockTool({
      name: 'test-tool',
      shouldConfirmExecute: vi.fn(mockToolConfirmationFn),
    });

    getToolRegistrySpy.mockReturnValue({
      getAllTools: vi.fn().mockReturnValue([mockTool]),
      getToolsByServer: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(mockTool),
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/')
      .send(createStreamMessageRequest('run a tool', 'a2a-tool-test-message'))
      .set('Content-Type', 'application/json')
      .expect(200);

    const events = streamToSSEEvents(res.text);
    assertTaskCreationAndWorkingStatus(events);

    // Status update: working
    const workingEvent2 = events[2].result as TaskStatusUpdateEvent;
    expect(workingEvent2.kind).toBe('status-update');
    expect(workingEvent2.status.state).toBe('working');
    expect(workingEvent2.metadata?.['coderAgent']).toMatchObject({
      kind: 'state-change',
    });

    // Status update: tool-call-update
    const toolCallUpdateEvent = events[3].result as TaskStatusUpdateEvent;
    expect(toolCallUpdateEvent.kind).toBe('status-update');
    expect(toolCallUpdateEvent.status.state).toBe('working');
    expect(toolCallUpdateEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(toolCallUpdateEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'validating',
          request: { callId: 'test-call-id' },
        },
      },
    ]);

    // State update: awaiting_approval update
    const toolCallConfirmationEvent = events[4].result as TaskStatusUpdateEvent;
    expect(toolCallConfirmationEvent.kind).toBe('status-update');
    expect(toolCallConfirmationEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-confirmation',
    });
    expect(toolCallConfirmationEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'awaiting_approval',
          request: { callId: 'test-call-id' },
        },
      },
    ]);
    expect(toolCallConfirmationEvent.status?.state).toBe('working');

    assertUniqueFinalEventIsLast(events);
    expect(events.length).toBe(6);
  });

  it('should handle multiple tool calls in a single turn', async () => {
    // First call yields the tool request
    sendMessageStreamSpy.mockImplementationOnce(async function* () {
      yield* [
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'test-call-id-1',
            name: 'test-tool-1',
            args: {},
          },
        },
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'test-call-id-2',
            name: 'test-tool-2',
            args: {},
          },
        },
      ];
    });
    // Subsequent calls yield nothing
    sendMessageStreamSpy.mockImplementation(async function* () {
      yield* [];
    });

    const mockTool1 = new MockTool({
      name: 'test-tool-1',
      displayName: 'Test Tool 1',
      shouldConfirmExecute: vi.fn(mockToolConfirmationFn),
    });
    const mockTool2 = new MockTool({
      name: 'test-tool-2',
      displayName: 'Test Tool 2',
      shouldConfirmExecute: vi.fn(mockToolConfirmationFn),
    });

    getToolRegistrySpy.mockReturnValue({
      getAllTools: vi.fn().mockReturnValue([mockTool1, mockTool2]),
      getToolsByServer: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockImplementation((name: string) => {
        if (name === 'test-tool-1') return mockTool1;
        if (name === 'test-tool-2') return mockTool2;
        return undefined;
      }),
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/')
      .send(
        createStreamMessageRequest(
          'run two tools',
          'a2a-multi-tool-test-message',
        ),
      )
      .set('Content-Type', 'application/json')
      .expect(200);

    const events = streamToSSEEvents(res.text);
    assertTaskCreationAndWorkingStatus(events);

    // Second working update
    const workingEvent = events[2].result as TaskStatusUpdateEvent;
    expect(workingEvent.kind).toBe('status-update');
    expect(workingEvent.status.state).toBe('working');

    // State Update: Validate the first tool call
    const toolCallValidateEvent1 = events[3].result as TaskStatusUpdateEvent;
    expect(toolCallValidateEvent1.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(toolCallValidateEvent1.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'validating',
          request: { callId: 'test-call-id-1' },
        },
      },
    ]);

    // --- Assert the event stream ---
    // 1. Initial "submitted" status.
    expect((events[0].result as TaskStatusUpdateEvent).status.state).toBe(
      'submitted',
    );

    // 2. "working" status after receiving the user prompt.
    expect((events[1].result as TaskStatusUpdateEvent).status.state).toBe(
      'working',
    );

    // 3. A "state-change" event from the agent.
    expect(events[2].result.metadata?.['coderAgent']).toMatchObject({
      kind: 'state-change',
    });

    // 4. Tool 1 is validating.
    const toolCallUpdate1 = events[3].result as TaskStatusUpdateEvent;
    expect(toolCallUpdate1.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(toolCallUpdate1.status.message?.parts).toMatchObject([
      {
        data: {
          request: { callId: 'test-call-id-1' },
          status: 'validating',
        },
      },
    ]);

    // 5. Tool 2 is validating.
    const toolCallUpdate2 = events[4].result as TaskStatusUpdateEvent;
    expect(toolCallUpdate2.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(toolCallUpdate2.status.message?.parts).toMatchObject([
      {
        data: {
          request: { callId: 'test-call-id-2' },
          status: 'validating',
        },
      },
    ]);

    // 6. Tool 1 is awaiting approval.
    const toolCallAwaitEvent = events[5].result as TaskStatusUpdateEvent;
    expect(toolCallAwaitEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-confirmation',
    });
    expect(toolCallAwaitEvent.status.message?.parts).toMatchObject([
      {
        data: {
          request: { callId: 'test-call-id-1' },
          status: 'awaiting_approval',
        },
      },
    ]);

    // 7. The final event is "input-required".
    const finalEvent = events[6].result as TaskStatusUpdateEvent;
    expect(finalEvent.final).toBe(true);
    expect(finalEvent.status.state).toBe('input-required');

    // The scheduler now waits for approval, so no more events are sent.
    assertUniqueFinalEventIsLast(events);
    expect(events.length).toBe(7);
  });

  it('should handle multiple tool calls sequentially in YOLO mode', async () => {
    // Set YOLO mode to auto-approve tools and test sequential execution.
    getApprovalModeSpy.mockReturnValue(ApprovalMode.YOLO);

    // First call yields the tool request
    sendMessageStreamSpy.mockImplementationOnce(async function* () {
      yield* [
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'test-call-id-1',
            name: 'test-tool-1',
            args: {},
          },
        },
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'test-call-id-2',
            name: 'test-tool-2',
            args: {},
          },
        },
      ];
    });
    // Subsequent calls yield nothing, as the tools will "succeed".
    sendMessageStreamSpy.mockImplementation(async function* () {
      yield* [{ type: 'content', value: 'All tools executed.' }];
    });

    const mockTool1 = new MockTool({
      name: 'test-tool-1',
      displayName: 'Test Tool 1',
      shouldConfirmExecute: vi.fn(mockToolConfirmationFn),
      execute: vi
        .fn()
        .mockResolvedValue({ llmContent: 'tool 1 done', returnDisplay: '' }),
    });
    const mockTool2 = new MockTool({
      name: 'test-tool-2',
      displayName: 'Test Tool 2',
      shouldConfirmExecute: vi.fn(mockToolConfirmationFn),
      execute: vi
        .fn()
        .mockResolvedValue({ llmContent: 'tool 2 done', returnDisplay: '' }),
    });

    getToolRegistrySpy.mockReturnValue({
      getAllTools: vi.fn().mockReturnValue([mockTool1, mockTool2]),
      getToolsByServer: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockImplementation((name: string) => {
        if (name === 'test-tool-1') return mockTool1;
        if (name === 'test-tool-2') return mockTool2;
        return undefined;
      }),
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/')
      .send(
        createStreamMessageRequest(
          'run two tools',
          'a2a-multi-tool-test-message',
        ),
      )
      .set('Content-Type', 'application/json')
      .expect(200);

    const events = streamToSSEEvents(res.text);
    assertTaskCreationAndWorkingStatus(events);

    // --- Assert the sequential execution flow ---
    const eventStream = events.slice(2).map((e) => {
      const update = e.result as TaskStatusUpdateEvent;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentData = update.metadata?.['coderAgent'] as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolData = update.status.message?.parts[0] as any;
      if (!toolData) {
        return { kind: agentData.kind };
      }
      return {
        kind: agentData.kind,
        status: toolData.data?.status,
        callId: toolData.data?.request.callId,
      };
    });

    const expectedFlow = [
      // Initial state change
      { kind: 'state-change', status: undefined, callId: undefined },
      // Tool 1 Lifecycle
      {
        kind: 'tool-call-update',
        status: 'validating',
        callId: 'test-call-id-1',
      },
      {
        kind: 'tool-call-update',
        status: 'scheduled',
        callId: 'test-call-id-1',
      },
      {
        kind: 'tool-call-update',
        status: 'executing',
        callId: 'test-call-id-1',
      },
      {
        kind: 'tool-call-update',
        status: 'success',
        callId: 'test-call-id-1',
      },
      // Tool 2 Lifecycle
      {
        kind: 'tool-call-update',
        status: 'validating',
        callId: 'test-call-id-2',
      },
      {
        kind: 'tool-call-update',
        status: 'scheduled',
        callId: 'test-call-id-2',
      },
      {
        kind: 'tool-call-update',
        status: 'executing',
        callId: 'test-call-id-2',
      },
      {
        kind: 'tool-call-update',
        status: 'success',
        callId: 'test-call-id-2',
      },
      // Final updates
      { kind: 'state-change', status: undefined, callId: undefined },
      { kind: 'text-content', status: undefined, callId: undefined },
    ];

    // Use `toContainEqual` for flexibility if other events are interspersed.
    expect(eventStream).toEqual(expect.arrayContaining(expectedFlow));

    assertUniqueFinalEventIsLast(events);
  });

  it('should handle tool calls that do not require approval', async () => {
    // First call yields the tool request
    sendMessageStreamSpy.mockImplementationOnce(async function* () {
      yield* [
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'test-call-id-no-approval',
            name: 'test-tool-no-approval',
            args: {},
          },
        },
      ];
    });
    // Second call, after the tool runs, yields the final text
    sendMessageStreamSpy.mockImplementationOnce(async function* () {
      yield* [{ type: 'content', value: 'Tool executed successfully.' }];
    });

    const mockTool = new MockTool({
      name: 'test-tool-no-approval',
      displayName: 'Test Tool No Approval',
      execute: vi.fn().mockResolvedValue({
        llmContent: 'Tool executed successfully.',
        returnDisplay: 'Tool executed successfully.',
      }),
    });

    getToolRegistrySpy.mockReturnValue({
      getAllTools: vi.fn().mockReturnValue([mockTool]),
      getToolsByServer: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(mockTool),
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/')
      .send(
        createStreamMessageRequest(
          'run a tool without approval',
          'a2a-no-approval-test-message',
        ),
      )
      .set('Content-Type', 'application/json')
      .expect(200);

    const events = streamToSSEEvents(res.text);
    assertTaskCreationAndWorkingStatus(events);

    // Status update: working
    const workingEvent2 = events[2].result as TaskStatusUpdateEvent;
    expect(workingEvent2.kind).toBe('status-update');
    expect(workingEvent2.status.state).toBe('working');

    // Status update: tool-call-update (validating)
    const validatingEvent = events[3].result as TaskStatusUpdateEvent;
    expect(validatingEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(validatingEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'validating',
          request: { callId: 'test-call-id-no-approval' },
        },
      },
    ]);

    // Status update: tool-call-update (scheduled)
    const scheduledEvent = events[4].result as TaskStatusUpdateEvent;
    expect(scheduledEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(scheduledEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'scheduled',
          request: { callId: 'test-call-id-no-approval' },
        },
      },
    ]);

    // Status update: tool-call-update (executing)
    const executingEvent = events[5].result as TaskStatusUpdateEvent;
    expect(executingEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(executingEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'executing',
          request: { callId: 'test-call-id-no-approval' },
        },
      },
    ]);

    // Status update: tool-call-update (success)
    const successEvent = events[6].result as TaskStatusUpdateEvent;
    expect(successEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(successEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'success',
          request: { callId: 'test-call-id-no-approval' },
        },
      },
    ]);

    // Status update: working (before sending tool result to LLM)
    const workingEvent3 = events[7].result as TaskStatusUpdateEvent;
    expect(workingEvent3.kind).toBe('status-update');
    expect(workingEvent3.status.state).toBe('working');

    // Status update: text-content (final LLM response)
    const textContentEvent = events[8].result as TaskStatusUpdateEvent;
    expect(textContentEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'text-content',
    });
    expect(textContentEvent.status.message?.parts).toMatchObject([
      { text: 'Tool executed successfully.' },
    ]);

    assertUniqueFinalEventIsLast(events);
    expect(events.length).toBe(10);
  });

  it('should bypass tool approval in YOLO mode', async () => {
    // First call yields the tool request
    sendMessageStreamSpy.mockImplementationOnce(async function* () {
      yield* [
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'test-call-id-yolo',
            name: 'test-tool-yolo',
            args: {},
          },
        },
      ];
    });
    // Second call, after the tool runs, yields the final text
    sendMessageStreamSpy.mockImplementationOnce(async function* () {
      yield* [{ type: 'content', value: 'Tool executed successfully.' }];
    });

    // Set approval mode to yolo
    getApprovalModeSpy.mockReturnValue(ApprovalMode.YOLO);

    const mockTool = new MockTool({
      name: 'test-tool-yolo',
      displayName: 'Test Tool YOLO',
      execute: vi.fn().mockResolvedValue({
        llmContent: 'Tool executed successfully.',
        returnDisplay: 'Tool executed successfully.',
      }),
    });

    getToolRegistrySpy.mockReturnValue({
      getAllTools: vi.fn().mockReturnValue([mockTool]),
      getToolsByServer: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(mockTool),
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/')
      .send(
        createStreamMessageRequest(
          'run a tool in yolo mode',
          'a2a-yolo-mode-test-message',
        ),
      )
      .set('Content-Type', 'application/json')
      .expect(200);

    const events = streamToSSEEvents(res.text);
    assertTaskCreationAndWorkingStatus(events);

    // Status update: working
    const workingEvent2 = events[2].result as TaskStatusUpdateEvent;
    expect(workingEvent2.kind).toBe('status-update');
    expect(workingEvent2.status.state).toBe('working');

    // Status update: tool-call-update (validating)
    const validatingEvent = events[3].result as TaskStatusUpdateEvent;
    expect(validatingEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(validatingEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'validating',
          request: { callId: 'test-call-id-yolo' },
        },
      },
    ]);

    // Status update: tool-call-update (scheduled)
    const awaitingEvent = events[4].result as TaskStatusUpdateEvent;
    expect(awaitingEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(awaitingEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'scheduled',
          request: { callId: 'test-call-id-yolo' },
        },
      },
    ]);

    // Status update: tool-call-update (executing)
    const executingEvent = events[5].result as TaskStatusUpdateEvent;
    expect(executingEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(executingEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'executing',
          request: { callId: 'test-call-id-yolo' },
        },
      },
    ]);

    // Status update: tool-call-update (success)
    const successEvent = events[6].result as TaskStatusUpdateEvent;
    expect(successEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(successEvent.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'success',
          request: { callId: 'test-call-id-yolo' },
        },
      },
    ]);

    // Status update: working (before sending tool result to LLM)
    const workingEvent3 = events[7].result as TaskStatusUpdateEvent;
    expect(workingEvent3.kind).toBe('status-update');
    expect(workingEvent3.status.state).toBe('working');

    // Status update: text-content (final LLM response)
    const textContentEvent = events[8].result as TaskStatusUpdateEvent;
    expect(textContentEvent.metadata?.['coderAgent']).toMatchObject({
      kind: 'text-content',
    });
    expect(textContentEvent.status.message?.parts).toMatchObject([
      { text: 'Tool executed successfully.' },
    ]);

    assertUniqueFinalEventIsLast(events);
    expect(events.length).toBe(10);
  });

  it('should include traceId in status updates when available', async () => {
    const traceId = 'test-trace-id';
    sendMessageStreamSpy.mockImplementation(async function* () {
      yield* [
        { type: 'content', value: 'Hello', traceId },
        { type: 'thought', value: { subject: 'Thinking...' }, traceId },
      ];
    });

    const agent = request.agent(app);
    const res = await agent
      .post('/')
      .send(createStreamMessageRequest('hello', 'a2a-trace-id-test'))
      .set('Content-Type', 'application/json')
      .expect(200);

    const events = streamToSSEEvents(res.text);

    // The first two events are task-creation and working status
    const textContentEvent = events[2].result as TaskStatusUpdateEvent;
    expect(textContentEvent.kind).toBe('status-update');
    expect(textContentEvent.metadata?.['traceId']).toBe(traceId);

    const thoughtEvent = events[3].result as TaskStatusUpdateEvent;
    expect(thoughtEvent.kind).toBe('status-update');
    expect(thoughtEvent.metadata?.['traceId']).toBe(traceId);
  });

  describe('/listCommands', () => {
    it('should return a list of top-level commands', async () => {
      const mockCommands = [
        {
          name: 'test-command',
          description: 'A test command',
          topLevel: true,
          arguments: [{ name: 'arg1', description: 'Argument 1' }],
          subCommands: [
            {
              name: 'sub-command',
              description: 'A sub command',
              topLevel: false,
              execute: vi.fn(),
            },
          ],
          execute: vi.fn(),
        },
        {
          name: 'another-command',
          description: 'Another test command',
          topLevel: true,
          execute: vi.fn(),
        },
        {
          name: 'not-top-level',
          description: 'Not a top level command',
          topLevel: false,
          execute: vi.fn(),
        },
      ];

      const getAllCommandsSpy = vi
        .spyOn(commandRegistry, 'getAllCommands')
        .mockReturnValue(mockCommands);

      const agent = request.agent(app);
      const res = await agent.get('/listCommands').expect(200);

      expect(res.body).toEqual({
        commands: [
          {
            name: 'test-command',
            description: 'A test command',
            arguments: [{ name: 'arg1', description: 'Argument 1' }],
            subCommands: [
              {
                name: 'sub-command',
                description: 'A sub command',
                arguments: [],
                subCommands: [],
              },
            ],
          },
          {
            name: 'another-command',
            description: 'Another test command',
            arguments: [],
            subCommands: [],
          },
        ],
      });

      expect(getAllCommandsSpy).toHaveBeenCalledOnce();
      getAllCommandsSpy.mockRestore();
    });

    it('should handle cyclic commands gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const cyclicCommand: Command = {
        name: 'cyclic-command',
        description: 'A cyclic command',
        topLevel: true,
        execute: vi.fn(),
        subCommands: [],
      };
      cyclicCommand.subCommands?.push(cyclicCommand); // Create cycle

      const getAllCommandsSpy = vi
        .spyOn(commandRegistry, 'getAllCommands')
        .mockReturnValue([cyclicCommand]);

      const agent = request.agent(app);
      const res = await agent.get('/listCommands').expect(200);

      expect(res.body.commands[0].name).toBe('cyclic-command');
      expect(res.body.commands[0].subCommands).toEqual([]);

      expect(warnSpy).toHaveBeenCalledWith(
        'Command cyclic-command already inserted in the response, skipping',
      );

      getAllCommandsSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('/executeCommand', () => {
    const mockExtensions = [{ name: 'test-extension', version: '0.0.1' }];

    beforeEach(() => {
      getExtensionsSpy.mockReturnValue(mockExtensions);
    });

    afterEach(() => {
      getExtensionsSpy.mockClear();
    });

    it('should return extensions for valid command', async () => {
      const agent = request.agent(app);
      const res = await agent
        .post('/executeCommand')
        .send({ command: 'extensions list', args: [] })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(res.body).toEqual({
        name: 'extensions list',
        data: mockExtensions,
      });
      expect(getExtensionsSpy).toHaveBeenCalled();
    });

    it('should return 404 for invalid command', async () => {
      const agent = request.agent(app);
      const res = await agent
        .post('/executeCommand')
        .send({ command: 'invalid command' })
        .set('Content-Type', 'application/json')
        .expect(404);

      expect(res.body.error).toBe('Command not found: invalid command');
      expect(getExtensionsSpy).not.toHaveBeenCalled();
    });

    it('should return 400 for missing command', async () => {
      const agent = request.agent(app);
      await agent
        .post('/executeCommand')
        .send({ args: [] })
        .set('Content-Type', 'application/json')
        .expect(400);
      expect(getExtensionsSpy).not.toHaveBeenCalled();
    });

    it('should return 400 if args is not an array', async () => {
      const agent = request.agent(app);
      const res = await agent
        .post('/executeCommand')
        .send({ command: 'extensions.list', args: 'not-an-array' })
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(res.body.error).toBe('"args" field must be an array.');
      expect(getExtensionsSpy).not.toHaveBeenCalled();
    });
  });
});
