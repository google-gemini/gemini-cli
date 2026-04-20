/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DebugAdapterConfig } from './types.js';

export const BUILTIN_ADAPTERS: Record<string, DebugAdapterConfig> = {
  node: {
    name: 'Node.js',
    runtime: 'node',
    launchCommand: ['node', '--inspect-brk'],
    attachArgs: { type: 'node', request: 'attach' },
    port: 9229,
  },
  python: {
    name: 'Python (debugpy)',
    runtime: 'python',
    launchCommand: [
      'python',
      '-m',
      'debugpy',
      '--listen',
      '5678',
      '--wait-for-client',
    ],
    attachArgs: {
      type: 'python',
      request: 'attach',
      connect: { host: 'localhost', port: 5678 },
    },
    port: 5678,
  },
  go: {
    name: 'Go (Delve)',
    runtime: 'go',
    launchCommand: [
      'dlv',
      'debug',
      '--headless',
      '--api-version=2',
      '--listen=:2345',
    ],
    attachArgs: {
      type: 'go',
      request: 'attach',
      mode: 'remote',
      host: '127.0.0.1',
      port: 2345,
    },
    port: 2345,
  },
};

export function getAdapterForRuntime(
  runtime: string,
): DebugAdapterConfig | undefined {
  return BUILTIN_ADAPTERS[runtime.toLowerCase()];
}

export function detectRuntime(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'ts':
    case 'mjs':
    case 'cjs':
      return 'node';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    default:
      return undefined;
  }
}
