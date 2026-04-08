/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  HeapInvestigationSession,
  runHeapInvestigation,
} from './investigation-session.js';
export { PerfettoEmitter } from './perfetto-emitter.js';
export {
  serializeToHdsl,
  formatHdslSummary,
  generateInvestigationId,
} from './hdsl-serializer.js';
export { parseHeapSnapshot, buildConstructorHistogram } from './heap-parser.js';
export {
  diffSnapshots,
  detectLeakPatterns,
  analyzeDetachedNodes,
  scanSensitiveStrings,
  walkRetainerChain,
} from './pattern-detector.js';
export { DiagnosticBridge } from './diagnostic-bridge.js';
export type { DiagnosticBridgeOptions } from './diagnostic-bridge.js';
export {
  CdpWebSocketClient,
  listCdpTargets,
  validateCdpTarget,
  validateCdpMethod,
  CdpSecurityError,
  CdpConnectionError,
} from './cdp-client.js';
export type { CdpTarget, CdpMessage } from './cdp-client.js';
export type {
  HdslReport,
  HdslTrigger,
  HdslConstructorEntry,
  HdslDetachedNodes,
  LeakPattern,
  ParsedHeapSnapshot,
  InvestigationOptions,
  InvestigationPhase,
  InvestigationProgress,
  PerfettoEvent,
} from './types.js';
export {
  HeapInvestigationError,
  SnapshotCaptureError,
  SnapshotParseError,
  DominatorTimeoutError,
} from './errors.js';
