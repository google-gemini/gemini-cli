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
import { createApp } from './agent.js';
import {
  assertUniqueFinalEventIsLast,
  assertTaskCreationAndWorkingStatus,
  createStreamMessageRequest,
  MockTool,
} from './testing_utils.js';

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
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let config: Config;
const getToolRegistrySpy = vi.fn().mockReturnValue(ApprovalMode.DEFAULT);
const getApprovalModeSpy = vi.fn();
vi.mock('./config.js', async () => {
  const actual = await vi.importActual('./config.js');
  return {
    ...actual,
    loadConfig: vi.fn().mockImplementation(async () => {
      config = {
        getToolRegistry: getToolRegistrySpy,
        getApprovalMode: getApprovalModeSpy,
        getIdeMode: vi.fn().mockReturnValue(false),
        getAllowedTools: vi.fn().mockReturnValue([]),
        getIdeClient: vi.fn(),
        getWorkspaceContext: vi.fn().mockReturnValue({
          isPathWithinWorkspace: () => true,
        }),
        getTargetDir: () => '/test',
        getGeminiClient: vi.fn(),
        getDebugMode: vi.fn().mockReturnValue(false),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ model: 'gemini-pro' }),
        getModel: vi.fn().mockReturnValue('gemini-pro'),
        getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
        setFlashFallbackHandler: vi.fn(),
        initialize: vi.fn().mockResolvedValue(undefined),
      } as unknown as Config;
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

    const mockTool = new MockTool(
      'test-tool',
      'Test Tool',
      true,
      false,
      mockToolConfirmationFn,
    );

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

    const mockTool1 = new MockTool(
      'test-tool-1',
      'Test Tool 1',
      false,
      false,
      mockToolConfirmationFn,
    );
    const mockTool2 = new MockTool(
      'test-tool-2',
      'Test Tool 2',
      false,
      false,
      mockToolConfirmationFn,
    );

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

    // State Update: Validate each tool call
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
    const toolCallValidateEvent2 = events[4].result as TaskStatusUpdateEvent;
    expect(toolCallValidateEvent2.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-update',
    });
    expect(toolCallValidateEvent2.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'validating',
          request: { callId: 'test-call-id-2' },
        },
      },
    ]);

    // State Update: Set each tool call to awaiting
    const toolCallAwaitEvent1 = events[5].result as TaskStatusUpdateEvent;
    expect(toolCallAwaitEvent1.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-confirmation',
    });
    expect(toolCallAwaitEvent1.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'awaiting_approval',
          request: { callId: 'test-call-id-1' },
        },
      },
    ]);
    const toolCallAwaitEvent2 = events[6].result as TaskStatusUpdateEvent;
    expect(toolCallAwaitEvent2.metadata?.['coderAgent']).toMatchObject({
      kind: 'tool-call-confirmation',
    });
    expect(toolCallAwaitEvent2.status.message?.parts).toMatchObject([
      {
        data: {
          status: 'awaiting_approval',
          request: { callId: 'test-call-id-2' },
        },
      },
    ]);

    assertUniqueFinalEventIsLast(events);
    expect(events.length).toBe(8);
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

    const mockTool = new MockTool(
      'test-tool-no-approval',
      'Test Tool No Approval',
    );
    mockTool.execute.mockResolvedValue({
      llmContent: 'Tool executed successfully.',
      returnDisplay: 'Tool executed successfully.',
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

    const mockTool = new MockTool(
      'test-tool-yolo',
      'Test Tool YOLO',
      false,
      false,
    );
    mockTool.execute.mockResolvedValue({
      llmContent: 'Tool executed successfully.',
      returnDisplay: 'Tool executed successfully.',
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
});
