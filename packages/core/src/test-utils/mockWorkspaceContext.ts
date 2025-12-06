/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type { WorkspaceContext } from '../utils/workspaceContext.js';

/**
 * Creates a mock WorkspaceContext for testing
 * @param rootDir The root directory to use for the mock
 * @param additionalDirs Optional additional directories to include in the workspace
 * @returns A mock WorkspaceContext instance
 */
export function createMockWorkspaceContext(
  rootDir: string,
  additionalDirs: string[] = [],
): WorkspaceContext {
  const allDirs = [rootDir, ...additionalDirs];

  const mockWorkspaceContext = {
    addDirectory: vi.fn(),
    getDirectories: vi.fn().mockReturnValue(allDirs),
    isPathWithinWorkspace: vi
      .fn()
      .mockImplementation((path: string) =>
        allDirs.some((dir) => path.startsWith(dir)),
      ),
  } as unknown as WorkspaceContext;

  return mockWorkspaceContext;
}
