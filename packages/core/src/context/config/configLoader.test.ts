/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadContextManagementConfig } from './configLoader.js';
import { defaultContextProfile } from './profiles.js';
import { ContextProcessorRegistry } from './registry.js';
import { InMemoryFileSystem } from '../system/InMemoryFileSystem.js';
import type { Config } from 'src/config/config.js';

describe('SidecarLoader (Fake FS)', () => {
  let fileSystem: InMemoryFileSystem;
  let registry: ContextProcessorRegistry;

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
    registry = new ContextProcessorRegistry();
    registry.registerProcessor({
      id: 'NodeTruncation',
      schema: { type: 'object', properties: { maxTokens: { type: 'number' } } },
    });
  });

  const mockConfig = {
    getExperimentalContextManagementConfig: () => '/path/to/sidecar.json',
  } as unknown as Config;

  it('returns default profile if file does not exist', async () => {
    const result = await loadContextManagementConfig(mockConfig, registry, fileSystem);
    expect(result).toBe(defaultContextProfile);
  });

  it('returns default profile if file exists but is 0 bytes', async () => {
    fileSystem.setFile('/path/to/sidecar.json', '');
    const result = await loadContextManagementConfig(mockConfig, registry, fileSystem);
    expect(result).toBe(defaultContextProfile);
  });

  it('returns parsed config if file is valid', async () => {
    const validConfig = {
      budget: { retainedTokens: 1000, maxTokens: 2000 },
      processorOptions: {
        myTruncation: {
          type: 'NodeTruncation',
          options: { maxTokens: 500 },
        },
      },
    };
    fileSystem.setFile('/path/to/sidecar.json', JSON.stringify(validConfig));
    const result = await loadContextManagementConfig(mockConfig, registry, fileSystem);
    expect(result.config.budget?.maxTokens).toBe(2000);
    expect(result.config.processorOptions?.['myTruncation']).toBeDefined();
  });

  it('throws validation error if processorOptions contains invalid data for the schema', async () => {
    const invalidConfig = {
      budget: { retainedTokens: 1000, maxTokens: 2000 },
      processorOptions: {
        myTruncation: {
          type: 'NodeTruncation',
          options: { maxTokens: 'this should be a number' },
        },
      },
    };
    fileSystem.setFile('/path/to/sidecar.json', JSON.stringify(invalidConfig));
    await expect(loadContextManagementConfig(mockConfig, registry, fileSystem)).rejects.toThrow('Validation error');
  });

  it('throws validation error if file is empty whitespace', async () => {
    fileSystem.setFile('/path/to/sidecar.json', '   \n  ');
    await expect(loadContextManagementConfig(mockConfig, registry, fileSystem)).rejects.toThrow('Unexpected end of JSON input');
  });
});
