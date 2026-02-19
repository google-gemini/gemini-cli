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
    discoveryInProgress: false,
    connectingServers: [],
    showDescriptions: true,
    showSchema: false,
  };

  it('renders correctly with a connected server', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with authenticated OAuth status', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} authStatus={{ 'server-1': 'authenticated' }} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with expired OAuth status', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} authStatus={{ 'server-1': 'expired' }} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with unauthenticated OAuth status', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus
        {...baseProps}
        authStatus={{ 'server-1': 'unauthenticated' }}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with a disconnected server', async () => {
    vi.spyOn(
      await import('@google/gemini-cli-core'),
      'getMCPServerStatus',
    ).mockReturnValue(MCPServerStatus.DISCONNECTED);
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly when discovery is in progress', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} discoveryInProgress={true} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with schema enabled', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} showSchema={true} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with parametersJsonSchema', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
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
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with prompts', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
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
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with resources', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
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
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with a blocked server', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus
        {...baseProps}
        blockedServers={[{ name: 'server-1', extensionName: 'test-extension' }]}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders correctly with a connecting server', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} connectingServers={['server-1']} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('truncates resources when exceeding limit', async () => {
    const manyResources = Array.from({ length: 25 }, (_, i) => ({
      serverName: 'server-1',
      name: `resource-${i + 1}`,
      uri: `file:///tmp/resource-${i + 1}.txt`,
    }));

    const { lastFrame, unmount, waitUntilReady } = render(
      <McpStatus {...baseProps} resources={manyResources} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('15 resources hidden');
    unmount();
  });
});
