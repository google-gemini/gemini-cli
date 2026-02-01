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
import { AuthType, type Config } from '@google/gemini-cli-core';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import {
  SessionSelector,
  convertSessionToHistoryFormats,
} from '../utils/sessionUtils.js';
import type { LoadedSettings } from '../config/settings.js';

vi.mock('../config/config.js', () => ({
  loadCliConfig: vi.fn(),
}));

vi.mock('../utils/sessionUtils.js', () => ({
  SessionSelector: vi.fn(),
  convertSessionToHistoryFormats: vi.fn(),
}));

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

  it('should load an existing session and stream history', async () => {
    const sessionId = 'existing-session-id';
    const sessionData = {
      sessionId,
      messages: [
        { type: 'user', content: [{ text: 'Hello' }] },
        {
          type: 'gemini',
          content: [{ text: 'Hi there' }],
          thoughts: [{ subject: 'Thinking', description: 'about greeting' }],
        },
      ],
    };

    (SessionSelector as unknown as Mock).mockImplementation(() => ({
      resolveSession: vi.fn().mockResolvedValue({
        sessionData,
        sessionPath: '/path/to/session.json',
      }),
    }));

    (convertSessionToHistoryFormats as unknown as Mock).mockReturnValue({
      clientHistory: [],
      uiHistory: [],
    });

    const response = await agent.loadSession({
      sessionId,
      cwd: '/tmp',
      mcpServers: [],
    });

    expect(response).toEqual({});
    expect(mockConfig.getGeminiClient().resumeChat).toHaveBeenCalled();

    // Verify history streaming (it's called async, so we might need to wait or use a spy on Session)
    // In this case, we can verify mockConnection.sessionUpdate calls.
    // Since it's not awaited in loadSession, we might need a small delay or use vi.waitFor

    await vi.waitFor(() => {
      expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'user_message_chunk',
            content: expect.objectContaining({ text: 'Hello' }),
          }),
        }),
      );
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
      expect(mockConnection.sessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'agent_message_chunk',
            content: expect.objectContaining({ text: 'Hi there' }),
          }),
        }),
      );
    });
  });
});
