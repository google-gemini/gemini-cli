/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This test verifies that MCP resource tools (list_resources, read_resource)
 * are only sent to the model when MCP resources actually exist.
 *
 * The test directly inspects the API request telemetry to confirm which tools
 * were included in the request sent to the Gemini model.
 *
 * Three scenarios are tested:
 * 1. No resources capability declared → resource tools NOT sent to model
 * 2. Resources capability declared but empty list → resource tools NOT sent to model
 * 3. Resources capability with actual resources → resource tools ARE sent to model
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, poll, getDefaultTimeout } from './test-helper.js';
import { TestMcpServer } from './test-mcp-server.js';

/**
 * Reads the semantic API request events which contain tool names.
 * These have event.name = 'gen_ai.client.inference.operation.details'
 */
function readSemanticApiRequests(
  rig: TestRig,
): Array<{ attributes?: Record<string, unknown> }> {
  const logs = (
    rig as unknown as {
      _readAndParseTelemetryLog: () => Array<{
        attributes?: Record<string, unknown>;
      }>;
    }
  )._readAndParseTelemetryLog();
  return logs.filter(
    (logData) =>
      logData.attributes &&
      logData.attributes['event.name'] ===
        'gen_ai.client.inference.operation.details',
  );
}

/**
 * Extracts tool names from the semantic API request telemetry.
 * The tool names are logged in the 'gen_ai.request.tool_names' attribute.
 */
function getToolNamesFromApiRequest(
  apiRequest: { attributes?: Record<string, unknown> } | null,
): string[] {
  if (!apiRequest?.attributes) {
    return [];
  }
  const toolNames = apiRequest.attributes['gen_ai.request.tool_names'];
  if (Array.isArray(toolNames)) {
    return toolNames.filter((name): name is string => typeof name === 'string');
  }
  return [];
}

async function runUntilToolsAvailable(
  rig: TestRig,
  prompt: string,
  requiredTools: string[],
  maxAttempts = 2,
): Promise<string[]> {
  let toolNames: string[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const initialCount = readSemanticApiRequests(rig).length;
    await rig.run({ args: prompt });
    const timeout = getDefaultTimeout();
    const hasNewRequest = await poll(
      () => readSemanticApiRequests(rig).length > initialCount,
      timeout,
      100,
    );
    expect(
      hasNewRequest,
      `Expected a new semantic API request within ${timeout}ms`,
    ).toBe(true);
    const semanticRequests = readSemanticApiRequests(rig);
    const latestRequest =
      semanticRequests.length > 0
        ? semanticRequests[semanticRequests.length - 1]
        : null;
    toolNames = getToolNamesFromApiRequest(latestRequest);
    if (requiredTools.every((tool) => toolNames.includes(tool))) {
      break;
    }
  }
  return toolNames;
}

describe('mcp-resources-tools', () => {
  let rig: TestRig;
  let mcpServer: TestMcpServer;

  beforeEach(() => {
    rig = new TestRig();
    mcpServer = new TestMcpServer();
  });

  afterEach(async () => {
    await mcpServer.stop();
    await rig.cleanup();
  });

  it('does not send resource tools to model when MCP server has no resources capability', async () => {
    // Start MCP server with only tools (no resources)
    const port = await mcpServer.start({
      tools: {
        ping: () => ({ content: [{ type: 'text', text: 'pong' }] }),
      },
    });

    rig.setup('no-resources-capability', {
      settings: {
        mcpServers: {
          'resources-test-server': {
            httpUrl: `http://127.0.0.1:${port}/mcp`,
          },
        },
      },
    });

    const toolNames = await runUntilToolsAvailable(
      rig,
      'What tools are available?',
      ['ping'],
    );

    // Resource tools should NOT be sent to the model
    expect(toolNames).not.toContain('list_resources');
    expect(toolNames).not.toContain('read_resource');

    // But other tools should still be available (sanity check)
    expect(toolNames).toContain('ping');
  });

  it('does not send resource tools to model when MCP server has resources capability but empty list', async () => {
    // Start MCP server with tools and empty resources
    const port = await mcpServer.start({
      tools: {
        ping: () => ({ content: [{ type: 'text', text: 'pong' }] }),
      },
      resources: [], // Empty resources list - capability declared but no actual resources
    });

    rig.setup('empty-resources-list', {
      settings: {
        mcpServers: {
          'resources-test-server': {
            httpUrl: `http://127.0.0.1:${port}/mcp`,
          },
        },
      },
    });

    const toolNames = await runUntilToolsAvailable(
      rig,
      'What tools are available?',
      ['ping'],
    );

    // Resource tools should NOT be sent to the model
    expect(toolNames).not.toContain('list_resources');
    expect(toolNames).not.toContain('read_resource');

    // But other tools should still be available (sanity check)
    expect(toolNames).toContain('ping');
  });

  it('sends resource tools to model when MCP server has resources', async () => {
    // Start MCP server with tools and actual resources
    const port = await mcpServer.start({
      tools: {
        ping: () => ({ content: [{ type: 'text', text: 'pong' }] }),
      },
      resources: [
        {
          uri: 'test://example/doc.txt',
          name: 'example-doc',
          description: 'An example document for testing',
          mimeType: 'text/plain',
          readCallback: () => ({
            contents: [
              {
                uri: 'test://example/doc.txt',
                mimeType: 'text/plain',
                text: 'Hello from the test resource!',
              },
            ],
          }),
        },
      ],
    });

    rig.setup('with-resources', {
      settings: {
        mcpServers: {
          'resources-test-server': {
            httpUrl: `http://127.0.0.1:${port}/mcp`,
          },
        },
      },
    });

    const toolNames = await runUntilToolsAvailable(
      rig,
      'What tools are available?',
      ['ping', 'list_resources', 'read_resource'],
    );

    // Resource tools SHOULD be sent to the model when resources exist
    expect(toolNames).toContain('list_resources');
    expect(toolNames).toContain('read_resource');

    // And other tools should still be available
    expect(toolNames).toContain('ping');
  });
});
