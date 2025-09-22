/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export types
export * from './types.js';

// Export core components
export { HookSystem } from './hookSystem.js';
export { HookRegistry } from './hookRegistry.js';
export { PluginManager } from './pluginManager.js';
export { HookRunner } from './hookRunner.js';
export { HookAggregator } from './hookAggregator.js';
export { HookPlanner } from './hookPlanner.js';
export { HookEventHandler } from './hookEventHandler.js';
export { DefaultHttpClient } from './httpClient.js';

// Export interfaces
export type { HookRegistryEntry, ConfigSource } from './hookRegistry.js';
export type { PluginInstance } from './pluginManager.js';
export type { AggregatedHookResult } from './hookAggregator.js';
export type { HookEventContext } from './hookPlanner.js';
