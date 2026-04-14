/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import * as path from 'node:path';
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
const activeExtensionOverride = new AsyncLocalStorage<{
  name: string | null;
}>();

/**
 * Returns the current workspace context override, if any.
 * Called by `Config.getWorkspaceContext()` to check for per-agent scoping.
 */
export function getWorkspaceContextOverride(): WorkspaceContext | undefined {
  return workspaceContextOverride.getStore();
}

/**
 * Returns the current active extension name override, if any.
 * Called by `Config.activeExtensionName` getter/setter to check for isolated scoped execution.
 */
export function getActiveExtensionOverride():
  | { name: string | null }
  | undefined {
  return activeExtensionOverride.getStore();
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
 * Runs a function with a scoped active extension context override.
 * Any calls to `Config.activeExtensionName` within `fn` will return
 * the scoped context instead of the inherited default.
 *
 * @param scopedExtension The active extension name to use within the scope.
 * @param fn The function to run.
 * @returns The result of the function.
 */
export function runWithScopedActiveExtension<T>(
  scopedExtension: string | null,
  fn: () => T,
): T {
  return activeExtensionOverride.run({ name: scopedExtension }, fn);
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
  if (additionalDirectories.length === 0) {
    return parentContext;
  }

  const parentDirs = [...parentContext.getDirectories()];
  if (parentDirs.length === 0) {
    throw new Error(
      'Cannot create scoped workspace context: parent has no directories',
    );
  }

  // Reject overly broad directories (filesystem roots) to prevent
  // accidentally granting access to the entire filesystem.
  for (const dir of additionalDirectories) {
    if (path.resolve(dir) === path.parse(path.resolve(dir)).root) {
      throw new Error(
        `Cannot add filesystem root "${dir}" as a workspace directory`,
      );
    }
  }

  // WorkspaceContext's first constructor argument is the primary targetDir.
  // getDirectories() returns targetDir first, so parentDirs[0] is always it.
  return new WorkspaceContext(parentDirs[0], [
    ...parentDirs.slice(1),
    ...additionalDirectories,
  ]);
}
