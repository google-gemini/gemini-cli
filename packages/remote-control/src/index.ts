/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Protocol
export * from './protocol/types.js';
export * from './protocol/validators.js';

// Transport
export {
  RelayClient,
  LocalWebSocketRelayClient,
} from './client/RelayClient.js';

// Server-side components
export { SessionManager } from './server/SessionManager.js';
export { MessageRelay } from './server/MessageRelay.js';
export {
  RemoteControlServer,
  type MessageHandler,
} from './server/RemoteControlServer.js';
