/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
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
    resources: [],
    blockedServers: [],
    serverStatus: () => MCPServerStatus.CONNECTED,
    authStatus: {},
    enablementState: {
      'server-1': {
        enabled: true,
        isSessionDisabled: false,
        isPersistentDisabled: false,
      },
    },
    errors: {},
    discoveryInProgress: false,
    connectingServers: [],
    showDescriptions: true,
    showSchema: false,
  };

  it('renders correctly with a connected server', async () => {
    const { lastFrame, unmount } = await render(<McpStatus {...baseProps} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with authenticated OAuth status', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus {...baseProps} authStatus={{ 'server-1': 'authenticated' }} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with expired OAuth status', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus {...baseProps} authStatus={{ 'server-1': 'expired' }} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with unauthenticated OAuth status', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus
        {...baseProps}
        authStatus={{ 'server-1': 'unauthenticated' }}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with a disconnected server', async () => {
    vi.spyOn(
      await import('@google/gemini-cli-core'),
      'getMCPServerStatus',
    ).mockReturnValue(MCPServerStatus.DISCONNECTED);
    const { lastFrame, unmount } = await render(<McpStatus {...baseProps} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly when discovery is in progress', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus {...baseProps} discoveryInProgress={true} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with schema enabled', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus {...baseProps} showSchema={true} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with parametersJsonSchema', async () => {
    const { lastFrame, unmount } = await render(
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
    unmount();
  });

  it('renders correctly with prompts', async () => {
    const { lastFrame, unmount } = await render(
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
    unmount();
  });

  it('renders correctly with resources', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus
        {...baseProps}
        resources={[
          {
            serverName: 'server-1',
            name: 'resource-1',
            uri: 'file:///tmp/resource-1.txt',
            description: 'A test resource',
          },
        ]}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with a blocked server', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus
        {...baseProps}
        blockedServers={[{ name: 'server-1', extensionName: 'test-extension' }]}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with both blocked and unblocked servers', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus
        {...baseProps}
        servers={{
          ...baseProps.servers,
          'server-2': {
            url: 'http://localhost:8081',
            description: 'A blocked server',
          },
        }}
        blockedServers={[{ name: 'server-2', extensionName: 'test-extension' }]}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders only blocked servers when no configured servers exist', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus
        {...baseProps}
        servers={{}}
        blockedServers={[{ name: 'server-1', extensionName: 'test-extension' }]}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with a connecting server', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus {...baseProps} connectingServers={['server-1']} />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with a server error', async () => {
    const { lastFrame, unmount } = await render(
      <McpStatus
        {...baseProps}
        errors={{ 'server-1': 'Failed to connect to server' }}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('truncates resources when exceeding limit', async () => {
    const manyResources = Array.from({ length: 25 }, (_, i) => ({
      serverName: 'server-1',
      name: `resource-${i + 1}`,
      uri: `file:///tmp/resource-${i + 1}.txt`,
    }));

    const { lastFrame, unmount } = await render(
      <McpStatus {...baseProps} resources={manyResources} />,
    );
    expect(lastFrame()).toContain('15 resources hidden');
    unmount();
  });
});
