/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * A wrapper transport that handles sandbox environment cleanup.
 */
export class SandboxedTransport implements Transport {
  constructor(
    private readonly transport: Transport,
    private readonly cleanup: () => void,
  ) {
    this.transport.onmessage = (message) => this.onmessage?.(message);
    this.transport.onerror = (error) => this.onerror?.(error);
    this.transport.onclose = () => {
      this.cleanup();
      this.onclose?.();
    };
  }

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    await this.transport.start();
  }

  async close(): Promise<void> {
    try {
      await this.transport.close();
    } finally {
      this.cleanup();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await this.transport.send(message);
  }
}
