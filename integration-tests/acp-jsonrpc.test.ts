/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('ACP JSON-RPC Protocol', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = new TestRig();
    await rig.setup('acp-jsonrpc-test');
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should return valid JSON-RPC 2.0 response for initialize method', async () => {
    // Prepare the JSON-RPC initialize request
    const initializeRequest = {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {
          fs: {
            readTextFile: false,
            writeTextFile: false,
          },
          terminal: false,
        },
      },
    };

    // Send the request via stdin with --experimental-acp flag
    const result = await rig.run(
      {
        stdin: JSON.stringify(initializeRequest) + '\n',
        yolo: false,
      },
      '--experimental-acp',
    );

    // Extract JSON lines from output (filter out debug/log output)
    const jsonLines = result
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{') && line.includes('"jsonrpc"'));

    // Should have at least one JSON-RPC response
    expect(jsonLines.length).toBeGreaterThanOrEqual(1);

    // Parse the first JSON-RPC response
    const parsed = JSON.parse(jsonLines[0]);

    // Verify it's a valid JSON-RPC 2.0 response
    expect(parsed).toHaveProperty('jsonrpc');
    expect(parsed.jsonrpc).toBe('2.0');

    // Verify response structure
    expect(parsed).toHaveProperty('id');
    expect(parsed.id).toBe(0);

    // Should have either 'result' or 'error', but not both
    const hasResult = 'result' in parsed;
    const hasError = 'error' in parsed;
    expect(hasResult || hasError).toBe(true);
    expect(hasResult && hasError).toBe(false);

    // For a successful initialize, we expect a result
    if (hasResult) {
      expect(parsed.result).toBeDefined();
      expect(typeof parsed.result).toBe('object');
    }
  });
});
