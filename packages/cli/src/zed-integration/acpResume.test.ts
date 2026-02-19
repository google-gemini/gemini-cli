/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mocked,
  type Mock,
} from 'vitest';
import { GeminiAgent } from './zedIntegration.js';
import * as acp from '@agentclientprotocol/sdk';
import {
  ApprovalMode,
  AuthType,
  type Config,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import {
  SessionSelector,
  convertSessionToHistoryFormats,
} from '../utils/sessionUtils.js';
import type { LoadedSettings } from '../config/settings.js';

vi.mock('../config/config.js', () => ({
  loadCliConfig: vi.fn(),
}));

vi.mock('../utils/sessionUtils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/sessionUtils.js')>();
  return {
    ...actual,
    SessionSelector: vi.fn(),
    convertSessionToHistoryFormats: vi.fn(),
  };
});

describe('GeminiAgent Session Resume', () => {
  let mockConfig: Mocked<Config>;
  let mockSettings: Mocked<LoadedSettings>;
  let mockArgv: CliArgs;
  let mockConnection: Mocked<acp.AgentSideConnection>;
  let agent: GeminiAgent;

  beforeEach(() => {
    mockConfig = {
      refreshAuth: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
      getFileSystemService: vi.fn(),
      setFileSystemService: vi.fn(),
      getGeminiClient: vi.fn().mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        resumeChat: vi.fn().mockResolvedValue(undefined),
        getChat: vi.fn().mockReturnValue({}),
      }),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
      getApprovalMode: vi.fn().mockReturnValue('default'),
      isPlanEnabled: vi.fn().mockReturnValue(false),
    } as unknown as Mocked<Config>;
    mockSettings = {
      merged: {
        security: { auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE } },
        mcpServers: {},
      },
      setValue: vi.fn(),
    } as unknown as Mocked<LoadedSettings>;
    mockArgv = {} as unknown as CliArgs;
    mockConnection = {
      sessionUpdate: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<acp.AgentSideConnection>;

    (loadCliConfig as Mock).mockResolvedValue(mockConfig);

    agent = new GeminiAgent(mockConfig, mockSettings, mockArgv, mockConnection);
  });

  it('should advertise loadSession capability', async () => {
    const response = await agent.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
    });
    expect(response.agentCapabilities?.loadSession).toBe(true);
  });

  it('should load a session, resume chat, and stream all message types', async () => {
    const sessionId = 'existing-session-id';
    const sessionData = {
      sessionId,
      messages: [
        { type: 'user', content: [{ text: 'Hello' }] },
        {
          type: 'gemini',
          content: [{ text: 'Hi there' }],
          thoughts: [{ subject: 'Thinking', description: 'about greeting' }],
          toolCalls: [
            {
              id: 'call-1',
              name: 'test_tool',
              displayName: 'Test Tool',
              status: CoreToolCallStatus.Success,
              resultDisplay: 'Tool output',
            },
          ],
        },
        {
          type: 'gemini',
          content: [{ text: 'Trying a write' }],
          toolCalls: [
            {
              id: 'call-2',
              name: 'write_file',
              displayName: 'Write File',
              status: CoreToolCallStatus.Error,
              resultDisplay: 'Permission denied',
            },
          ],
        },
      ],
    };

    mockConfig.getToolRegistry = vi.fn().mockReturnValue({
      getTool: vi.fn().mockReturnValue({ kind: 'read' }),
    });

    (SessionSelector as unknown as Mock).mockImplementation(() => ({
      resolveSession: vi.fn().mockResolvedValue({
        sessionData,
        sessionPath: '/path/to/session.json',
      }),
    }));

    const mockClientHistory = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];
    (convertSessionToHistoryFormats as unknown as Mock).mockReturnValue({
      clientHistory: mockClientHistory,
      uiHistory: [],
    });

    const response = await agent.loadSession({
      sessionId,
      cwd: '/tmp',
      mcpServers: [],
    });

    expect(response).toEqual({
      modes: {
        availableModes: [
          {
            id: ApprovalMode.DEFAULT,
            name: 'Default',
            description: 'Prompts for approval',
          },
          {
            id: ApprovalMode.AUTO_EDIT,
            name: 'Auto Edit',
            description: 'Auto-approves edit tools',
          },
          {
            id: ApprovalMode.YOLO,
            name: 'YOLO',
            description: 'Auto-approves all tools',
          },
        ],
        currentModeId: ApprovalMode.DEFAULT,
      },
    });

    // Verify resumeChat received the correct arguments
    expect(mockConfig.getGeminiClient().resumeChat).toHaveBeenCalledWith(
      mockClientHistory,
      expect.objectContaining({
        conversation: sessionData,
        filePath: '/path/to/session.json',
      }),
    );

    await vi.waitFor(() => {
      // User message
      expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'user_message_chunk',
            content: expect.objectContaining({ text: 'Hello' }),
          }),
        }),
      );

      // Agent thought
      expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'agent_thought_chunk',
            content: expect.objectContaining({
              text: '**Thinking**\nabout greeting',
            }),
          }),
        }),
      );

      // Agent message
      expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'agent_message_chunk',
            content: expect.objectContaining({ text: 'Hi there' }),
          }),
        }),
      );

      // Successful tool call → 'completed'
      expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'tool_call',
            toolCallId: 'call-1',
            status: 'completed',
            title: 'Test Tool',
            kind: 'read',
            content: [
              {
                type: 'content',
                content: { type: 'text', text: 'Tool output' },
              },
            ],
          }),
        }),
      );

      // Failed tool call → 'failed'
      expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'tool_call',
            toolCallId: 'call-2',
            status: 'failed',
            title: 'Write File',
          }),
        }),
      );
    });
  });
});
