/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config, createWorkingStdio } from '@google/gemini-cli-core';
import { runExitCleanup } from '../utils/cleanup.js';
import * as acp from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';
import type { LoadedSettings } from '../config/settings.js';
import type { CliArgs } from '../config/config.js';
import { GeminiAgent } from './acpRpcDispatcher.js';

export async function runAcpClient(
  config: Config,
  settings: LoadedSettings,
  argv: CliArgs,
) {
  const { stdout: workingStdout } = createWorkingStdio();
  const stdout = Writable.toWeb(workingStdout) as WritableStream;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const stdin = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;

  const stream = acp.ndJsonStream(stdout, stdin);
  const connection = new acp.AgentSideConnection(
    (connection) => new GeminiAgent(config, settings, argv, connection),
    stream,
  );

  // SIGTERM/SIGINT handlers (in sdk.ts) don't fire when stdin closes.
  // We must explicitly await the connection close to flush telemetry.
  // Use finally() to ensure cleanup runs even on stream errors.
  await connection.closed.finally(runExitCleanup);
}
