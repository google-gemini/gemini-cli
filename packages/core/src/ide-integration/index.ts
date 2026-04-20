/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Core types
export {
  IDECapability,
  type IDETransportType,
  type IDEConnectionConfig,
  type IDEMessage,
  type DiagnosticSeverity,
  type EditorSelection,
  type NotificationLevel,
  type IDEAdapter,
  type NegotiatedCapabilities,
} from './types.js';

// Protocol
export {
  IDEProtocol,
  ProtocolError,
  ProtocolErrorCode,
  type ProtocolTransport,
} from './protocol.js';

// Adapter registry
export { AdapterRegistry, adapterRegistry } from './adapterRegistry.js';

// Capability negotiation
export {
  negotiate,
  isCapabilityAvailable,
  isCapabilityNative,
  formatNegotiationSummary,
} from './capabilityNegotiator.js';

// Adapter implementations
export { VSCodeAdapter } from './adapters/vscodeAdapter.js';
export {
  JetBrainsAdapter,
  JETBRAINS_PRODUCTS,
} from './adapters/jetbrainsAdapter.js';
export { NeovimAdapter } from './adapters/neovimAdapter.js';
export { GenericLspAdapter } from './adapters/genericLspAdapter.js';
