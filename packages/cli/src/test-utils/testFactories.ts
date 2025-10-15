/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GeminiCLIExtension,
  ExtensionInstallMetadata,
  MCPServerConfig,
  SessionMetrics,
  IdeContext,
  File,
} from '@google/gemini-cli-core';

/**
 * Factory for creating GeminiCLIExtension test objects
 */
export function createMockExtension(
  overrides: Partial<GeminiCLIExtension> = {},
): GeminiCLIExtension {
  return {
    path: '/mock/extension/path',
    name: 'mock-extension',
    version: '1.0.0',
    contextFiles: [],
    isActive: true,
    ...overrides,
  };
}

/**
 * Factory for creating SessionMetrics test objects
 */
export function createMockSessionMetrics(
  overrides: Partial<SessionMetrics> = {},
): SessionMetrics {
  return {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: {
        accept: 0,
        reject: 0,
        modify: 0,
        auto_accept: 0,
      },
      byName: {},
    },
    files: {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
    ...overrides,
  };
}

/**
 * Factory for creating File (OpenFile) test objects
 */
export function createMockOpenFile(overrides: Partial<File> = {}): File {
  return {
    path: '/mock/file.ts',
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Factory for creating IdeContext test objects
 */
export function createMockIdeContext(
  overrides: Partial<IdeContext> = {},
): IdeContext {
  return {
    workspaceState: {
      openFiles: [],
      ...overrides.workspaceState,
    },
    ...overrides,
  };
}

/**
 * Factory for creating ExtensionInstallMetadata test objects
 */
export function createMockInstallMetadata(
  overrides: Partial<ExtensionInstallMetadata> = {},
): ExtensionInstallMetadata {
  return {
    type: 'git',
    source: 'https://github.com/test/test',
    autoUpdate: false,
    ...overrides,
  };
}

/**
 * Factory for creating MCPServerConfig test objects
 */
export function createMockMCPServerConfig(
  overrides: Partial<MCPServerConfig> = {},
): MCPServerConfig {
  return {
    url: 'http://localhost:8080',
    ...overrides,
  };
}
