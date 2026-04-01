/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { WorkspaceContext } from '../utils/workspaceContext.js';

/**
 * AsyncLocalStorage for scoped workspace context overrides.
 *
 * When a subagent declares additional workspace directories, its execution
 * runs inside this store. `Config.getWorkspaceContext()` checks this store
 * first, allowing per-agent workspace scoping without mutating the shared
 * Config instance.
 *
 * This follows the same pattern as `toolCallContext` and `promptIdContext`.
 */
const workspaceContextOverride = new AsyncLocalStorage<WorkspaceContext>();

/**
 * Returns the current workspace context override, if any.
 * Called by `Config.getWorkspaceContext()` to check for per-agent scoping.
 */
export function getWorkspaceContextOverride(): WorkspaceContext | undefined {
  return workspaceContextOverride.getStore();
}

/**
 * Runs a function with a scoped workspace context override.
 * Any calls to `Config.getWorkspaceContext()` within `fn` will return
 * the scoped context instead of the default.
 *
 * @param scopedContext The workspace context to use within the scope.
 * @param fn The function to run.
 * @returns The result of the function.
 */
export function runWithScopedWorkspaceContext<T>(
  scopedContext: WorkspaceContext,
  fn: () => T,
): T {
  return workspaceContextOverride.run(scopedContext, fn);
}

/**
 * Creates a {@link WorkspaceContext} that extends a parent's directories
 * with additional ones.
 *
 * @param parentContext The parent workspace context.
 * @param additionalDirectories Extra directories to include.
 * @returns A new WorkspaceContext with the combined directories.
 */
export function createScopedWorkspaceContext(
  parentContext: WorkspaceContext,
  additionalDirectories: string[],
): WorkspaceContext {
  const parentDirs = [...parentContext.getDirectories()];
  return new WorkspaceContext(parentDirs[0], [
    ...parentDirs.slice(1),
    ...additionalDirectories,
  ]);
}
