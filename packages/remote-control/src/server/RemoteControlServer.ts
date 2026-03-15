/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';
import type {
  RemoteControlMessage,
  RemoteControlOptions,
  SessionInfo,
} from '../protocol/types.js';
import { RemoteControlMessageType } from '../protocol/types.js';
import { LocalWebSocketRelayClient } from '../client/RelayClient.js';
import { SessionManager } from './SessionManager.js';
import { MessageRelay } from './MessageRelay.js';
import { parseUserMessagePayload } from '../protocol/validators.js';

// ---------------------------------------------------------------------------
// Message handler contract
// ---------------------------------------------------------------------------

/**
 * A function that the host CLI provides to process an incoming user message.
 *
 * @param userMessage   Plain-text content sent by the remote client.
 * @param onChunk       Called with each streamed text fragment as it arrives.
 * @returns             Full response text (same as the concatenation of all chunks).
 */
export type MessageHandler = (
  userMessage: string,
  onChunk: (text: string) => Promise<void> | void,
) => Promise<string>;

// ---------------------------------------------------------------------------
// RemoteControlServer
// ---------------------------------------------------------------------------

/**
 * Manages a remote-control session for a local Gemini CLI process.
 *
 * Lifecycle:
 *   1. Construct with options.
 *   2. Set a `MessageHandler` via `setMessageHandler()`.
 *   3. Call `start()` – receives back a `SessionInfo` with the connection URL.
 *   4. Remote clients connect over WebSocket and exchange messages.
 *   5. Call `stop()` to tear down gracefully.
 */
export class RemoteControlServer extends EventEmitter {
  private readonly relay: LocalWebSocketRelayClient;
  private readonly sessionManager: SessionManager;
  private messageRelay: MessageRelay | null = null;
  private sessionInfo: SessionInfo | null = null;
  private messageHandler: MessageHandler | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /** Interval between server-initiated pings (ms). */
  private static readonly HEARTBEAT_MS = 30_000;

  constructor(private readonly options: RemoteControlOptions = {}) {
    super();
    this.relay = new LocalWebSocketRelayClient(options.port ?? 0);
    this.sessionManager = new SessionManager();
  }

  /**
   * Registers the function that will process incoming user messages.
   * Must be called before `start()`.
   */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Starts the relay server and registers the session.
   *
   * @returns A `SessionInfo` describing how remote clients should connect.
   */
  async start(): Promise<SessionInfo> {
    // Bind the WebSocket server (port 0 = OS-assigned)
    const placeholder: SessionInfo = {
      sessionId: uuidv4(),
      url: '',
      token: '',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    };
    await this.relay.start(placeholder);

    const port = this.relay.getPort();
    this.sessionInfo = this.sessionManager.createSession(this.options, port);
    this.messageRelay = new MessageRelay(
      this.relay,
      this.sessionInfo.sessionId,
    );

    // Wire up relay events
    this.relay.on('message', (msg: RemoteControlMessage) => {
      void this.handleMessage(msg);
    });
    this.relay.on('clientConnected', (id: string) => {
      this.sessionManager.resetExpiry();
      this.emit('clientConnected', id);
    });
    this.relay.on('clientDisconnected', (id: string) => {
      this.emit('clientDisconnected', id);
    });
    this.relay.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.startHeartbeat();
    this.emit('started', this.sessionInfo);
    return this.sessionInfo;
  }

  /** Gracefully shuts down the server and clears the session. */
  async stop(): Promise<void> {
    this.stopHeartbeat();
    await this.messageRelay?.sendStatus('idle', 'Session ended by host');
    await this.relay.stop();
    this.sessionManager.clearSession();
    this.sessionInfo = null;
    this.messageRelay = null;
    this.emit('stopped');
  }

  /** Returns the current `SessionInfo`, or `null` if not running. */
  getSessionInfo(): SessionInfo | null {
    return this.sessionInfo;
  }

  /** True while the server is running. */
  isRunning(): boolean {
    return this.sessionInfo !== null;
  }

  /** Number of currently-connected remote clients. */
  getConnectedClientCount(): number {
    return this.relay.getConnectedClients().length;
  }

  /** Resolves once `stop()` has been called. */
  async waitForStop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.once('stopped', resolve);
    });
  }

  // ---------------------------------------------------------------------------
  // Private message handling
  // ---------------------------------------------------------------------------

  private async handleMessage(message: RemoteControlMessage): Promise<void> {
    const rawClientId = message.metadata?.['clientId'];
    const clientId: string | undefined =
      typeof rawClientId === 'string' ? rawClientId : undefined;

    try {
      switch (message.type) {
        case RemoteControlMessageType.USER_MESSAGE:
          await this.handleUserMessage(message, clientId);
          break;
        case RemoteControlMessageType.HEARTBEAT:
          await this.handleHeartbeat(message, clientId);
          break;
        case RemoteControlMessageType.SESSION_DISCONNECT:
          // Nothing to do – the WS close event will clean up
          break;
        default:
          if (this.options.verbose) {
            // Unknown message type – ignore silently in production
          }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.messageRelay?.sendError('PROCESSING_ERROR', errMsg, clientId);
      this.emit('error', err instanceof Error ? err : new Error(errMsg));
    }
  }

  private async handleUserMessage(
    message: RemoteControlMessage,
    clientId: string | undefined,
  ): Promise<void> {
    // Safely parse and validate the payload using the Zod schema
    let payloadContent: string | null = null;
    try {
      const parsedPayload = parseUserMessagePayload(message.payload);
      payloadContent = parsedPayload.content;
    } catch {
      payloadContent = null;
    }

    if (!payloadContent) {
      await this.messageRelay?.sendError(
        'INVALID_PAYLOAD',
        'Message must contain a non-empty "content" string',
        clientId,
      );
      return;
    }

    if (!this.messageHandler) {
      await this.messageRelay?.sendError(
        'NO_HANDLER',
        'No message handler is registered',
        clientId,
      );
      return;
    }

    this.sessionManager.resetExpiry();
    this.emit('message', message, clientId ?? '');
    await this.messageRelay?.sendStatus('processing', undefined, clientId);

    try {
      const fullText = await this.messageHandler(
        payloadContent,
        async (chunk: string) => {
          await this.messageRelay?.sendResponseChunk(chunk, false, clientId);
        },
      );
      // Signal end-of-stream then send the complete roll-up
      await this.messageRelay?.sendResponseChunk('', true, clientId);
      await this.messageRelay?.sendResponse(fullText, undefined, clientId);
      await this.messageRelay?.sendStatus('idle', undefined, clientId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.messageRelay?.sendError('AGENT_ERROR', errMsg, clientId);
      await this.messageRelay?.sendStatus('error', errMsg, clientId);
    }
  }

  private async handleHeartbeat(
    message: RemoteControlMessage,
    clientId: string | undefined,
  ): Promise<void> {
    const ack: RemoteControlMessage = {
      type: RemoteControlMessageType.HEARTBEAT_ACK,
      sessionId: this.sessionInfo?.sessionId ?? '',
      timestamp: new Date().toISOString(),
      messageId: uuidv4(),
      payload: { receivedAt: message.timestamp },
    };
    if (clientId) {
      await this.relay.send(ack, clientId);
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      void this.sendHeartbeats();
    }, RemoteControlServer.HEARTBEAT_MS);

    if (typeof this.heartbeatInterval.unref === 'function') {
      this.heartbeatInterval.unref();
    }
  }

  private async sendHeartbeats(): Promise<void> {
    for (const clientId of this.relay.getConnectedClients()) {
      const ping: RemoteControlMessage = {
        type: RemoteControlMessageType.HEARTBEAT,
        sessionId: this.sessionInfo?.sessionId ?? '',
        timestamp: new Date().toISOString(),
        messageId: uuidv4(),
        payload: {},
      };
      await this.relay.send(ping, clientId);
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
