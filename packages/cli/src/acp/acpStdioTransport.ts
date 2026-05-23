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

type AcpMessage =
  acp.Stream['readable'] extends ReadableStream<infer Message>
    ? Message
    : never;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceProtocolVersion(protocolVersion: string): number {
  const trimmedProtocolVersion = protocolVersion.trim();

  if (/^\d+$/.test(trimmedProtocolVersion)) {
    const numericProtocolVersion = Number(trimmedProtocolVersion);
    if (numericProtocolVersion <= 65535) {
      return numericProtocolVersion;
    }
  }

  return acp.PROTOCOL_VERSION;
}

export function normalizeIncomingInitializeProtocolVersion(
  message: AcpMessage,
): AcpMessage {
  if (
    !('method' in message) ||
    message.method !== acp.AGENT_METHODS.initialize
  ) {
    return message;
  }

  const params = message.params;
  if (!isRecord(params)) {
    return message;
  }

  const protocolVersion = params['protocolVersion'];
  if (typeof protocolVersion === 'string') {
    params['protocolVersion'] = coerceProtocolVersion(protocolVersion);
  }

  return message;
}

export function normalizeIncomingInitializeProtocolVersionStream(
  stream: acp.Stream,
): acp.Stream {
  return {
    writable: stream.writable,
    readable: stream.readable.pipeThrough(
      new TransformStream<AcpMessage, AcpMessage>({
        transform(message, controller) {
          controller.enqueue(
            normalizeIncomingInitializeProtocolVersion(message),
          );
        },
      }),
    ),
  };
}

export function createAcpStream(
  output: WritableStream<Uint8Array>,
  input: ReadableStream<Uint8Array>,
): acp.Stream {
  return normalizeIncomingInitializeProtocolVersionStream(
    acp.ndJsonStream(output, input),
  );
}

export async function runAcpClient(
  config: Config,
  settings: LoadedSettings,
  argv: CliArgs,
) {
  const { stdout: workingStdout } = createWorkingStdio();
  const stdout = Writable.toWeb(workingStdout) as WritableStream;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const stdin = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;

  const stream = createAcpStream(stdout, stdin);
  const connection = new acp.AgentSideConnection(
    (connection) => new GeminiAgent(config, settings, argv, connection),
    stream,
  );

  // SIGTERM/SIGINT handlers (in sdk.ts) don't fire when stdin closes.
  // We must explicitly await the connection close to flush telemetry.
  // Use finally() to ensure cleanup runs even on stream errors.
  await connection.closed.finally(runExitCleanup);
}
