/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AgentResponsePayload,
  AgentResponseChunkPayload,
  StatusUpdatePayload,
  ErrorPayload,
  RemoteControlMessage,
} from '../protocol/types.js';
import { RemoteControlMessageType } from '../protocol/types.js';
import type { RelayClient } from '../client/RelayClient.js';

/**
 * Helper that wraps a RelayClient and provides typed send methods
 * for each message category.
 */
export class MessageRelay {
  constructor(
    private readonly relay: RelayClient,
    private readonly sessionId: string,
  ) {}

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async sendStatus(
    status: StatusUpdatePayload['status'],
    message?: string,
    clientId?: string,
  ): Promise<void> {
    await this.send(
      RemoteControlMessageType.STATUS_UPDATE,
      { status, message } satisfies StatusUpdatePayload,
      clientId,
    );
  }

  // ---------------------------------------------------------------------------
  // Response streaming
  // ---------------------------------------------------------------------------

  async sendResponseChunk(
    text: string,
    isComplete: boolean,
    clientId?: string,
  ): Promise<void> {
    await this.send(
      RemoteControlMessageType.AGENT_RESPONSE_CHUNK,
      { text, isComplete } satisfies AgentResponseChunkPayload,
      clientId,
    );
  }

  async sendResponse(
    text: string,
    usage?: AgentResponsePayload['usage'],
    clientId?: string,
  ): Promise<void> {
    await this.send(
      RemoteControlMessageType.AGENT_RESPONSE,
      { text, usage } satisfies AgentResponsePayload,
      clientId,
    );
  }

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  async sendError(
    code: string,
    message: string,
    clientId?: string,
  ): Promise<void> {
    await this.send(
      RemoteControlMessageType.ERROR,
      { code, message } satisfies ErrorPayload,
      clientId,
    );
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async send(
    type: RemoteControlMessageType,
    payload: unknown,
    clientId?: string,
  ): Promise<void> {
    const msg: RemoteControlMessage = {
      type,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      messageId: uuidv4(),
      payload,
    };
    if (clientId) {
      await this.relay.send(msg, clientId);
    } else {
      await this.relay.broadcast(msg);
    }
  }
}
