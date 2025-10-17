/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { McpStatus } from './McpStatus.js';
import { MCPServerStatus } from '@google/gemini-cli-core';
import { MessageType } from '../../types.js';

describe('McpStatus', () => {
  const baseProps = {
    type: MessageType.MCP_STATUS,
    servers: {
      'server-1': {
        url: 'http://localhost:8080',
        name: 'server-1',
        description: 'A test server',
      },
    },
    tools: [
      {
        serverName: 'server-1',
        name: 'tool-1',
        description: 'A test tool',
        schema: {
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
            },
          },
        },
      },
    ],
    prompts: [],
    blockedServers: [],
    serverStatus: () => MCPServerStatus.CONNECTED,
    authStatus: {},
    discoveryInProgress: false,
    connectingServers: [],
    showDescriptions: true,
    showSchema: false,
    showTips: false,
  };

  it('renders correctly with a connected server', () => {
    const { lastFrame } = render(<McpStatus {...baseProps} />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with authenticated OAuth status', () => {
    const { lastFrame } = render(
      <McpStatus {...baseProps} authStatus={{ 'server-1': 'authenticated' }} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with expired OAuth status', () => {
    const { lastFrame } = render(
      <McpStatus {...baseProps} authStatus={{ 'server-1': 'expired' }} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with unauthenticated OAuth status', () => {
    const { lastFrame } = render(
      <McpStatus
        {...baseProps}
        authStatus={{ 'server-1': 'unauthenticated' }}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with a disconnected server', async () => {
    vi.spyOn(
      await import('@google/gemini-cli-core'),
      'getMCPServerStatus',
    ).mockReturnValue(MCPServerStatus.DISCONNECTED);
    const { lastFrame } = render(<McpStatus {...baseProps} />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly when discovery is in progress', () => {
    const { lastFrame } = render(
      <McpStatus {...baseProps} discoveryInProgress={true} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with schema enabled', () => {
    const { lastFrame } = render(
      <McpStatus {...baseProps} showSchema={true} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with parametersJsonSchema', () => {
    const { lastFrame } = render(
      <McpStatus
        {...baseProps}
        tools={[
          {
            serverName: 'server-1',
            name: 'tool-1',
            description: 'A test tool',
            schema: {
              parametersJsonSchema: {
                type: 'object',
                properties: {
                  param1: { type: 'string' },
                },
              },
            },
          },
        ]}
        showSchema={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with tips enabled', () => {
    const { lastFrame } = render(<McpStatus {...baseProps} showTips={true} />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with prompts', () => {
    const { lastFrame } = render(
      <McpStatus
        {...baseProps}
        prompts={[
          {
            serverName: 'server-1',
            name: 'prompt-1',
            description: 'A test prompt',
          },
        ]}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with a blocked server', () => {
    const { lastFrame } = render(
      <McpStatus
        {...baseProps}
        blockedServers={[{ name: 'server-1', extensionName: 'test-extension' }]}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with a connecting server', () => {
    const { lastFrame } = render(
      <McpStatus {...baseProps} connectingServers={['server-1']} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
