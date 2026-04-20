/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type { SandboxDriver } from './sandboxDriver.js';
export { SandboxLifecycleManager } from './sandboxLifecycleManager.js';
export type { DriverDiscoveryResult } from './sandboxLifecycleManager.js';
export { NoopDriver } from './drivers/noopDriver.js';
export { DockerDriver } from './drivers/dockerDriver.js';
export { PodmanDriver } from './drivers/podmanDriver.js';
export { SeatbeltDriver } from './drivers/seatbeltDriver.js';
export { AppContainerDriver } from './drivers/appContainerDriver.js';
export {
  AppContainerCapability,
  CapabilitySet,
  CAPABILITY_PRESETS,
  mapToSandboxCapabilities,
} from './appContainerCapabilities.js';
export {
  createProfile,
  deleteProfile,
  grantFileAccess,
  revokeFileAccess,
  listProfiles,
} from './appContainerProfile.js';
export type { AppContainerProfile } from './appContainerProfile.js';
export { NetworkPolicy } from './appContainerNetworkPolicy.js';
export type { NetworkEndpoint } from './appContainerNetworkPolicy.js';
export { FileAccessPolicy, FileAccessType } from './appContainerFilePolicy.js';
export type { FileAccessRule } from './appContainerFilePolicy.js';
export {
  SandboxStatus,
  SandboxDriverType,
  IsolationLevel,
  DEFAULT_SANDBOX_CONFIG,
} from './types.js';
export type {
  SandboxCapabilities,
  SandboxConfig,
  SandboxDiagnostic,
  MountConfig,
  ExecOptions,
  ExecResult,
} from './types.js';
export { SandboxDiagnosticsCollector } from './sandboxDiagnostics.js';
export type { DiagnosticEntry } from './sandboxDiagnostics.js';
