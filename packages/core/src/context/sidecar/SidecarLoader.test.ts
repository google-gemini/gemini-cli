/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProcessorRegistry } from './registry.js';
import { registerBuiltInProcessors } from './builtins.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { SidecarLoader } from './SidecarLoader.js';
import { defaultSidecarProfile } from './profiles.js';
import { InMemoryFileSystem } from '../system/InMemoryFileSystem.js';
import type { Config } from 'src/config/config.js';

describe('SidecarLoader (Fake FS)', () => {
  let fileSystem: InMemoryFileSystem;
  let registry: ProcessorRegistry;

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
    registry = new ProcessorRegistry();
    registerBuiltInProcessors(registry);
  });

  const mockConfig = {
    getExperimentalContextSidecarConfig: () => '/path/to/sidecar.json',
  } as unknown as Config;

  it('returns default profile if file does not exist', () => {
    const result = SidecarLoader.fromConfig(mockConfig, registry, fileSystem);
    expect(result).toBe(defaultSidecarProfile);
  });

  it('returns default profile if file exists but is 0 bytes', () => {
    fileSystem.setFile('/path/to/sidecar.json', '');
    const result = SidecarLoader.fromConfig(mockConfig, registry, fileSystem);
    expect(result).toBe(defaultSidecarProfile);
  });

  it('throws an error if file is empty whitespace', () => {
    fileSystem.setFile('/path/to/sidecar.json', '   \n  ');
    expect(() =>
      SidecarLoader.fromConfig(mockConfig, registry, fileSystem),
    ).toThrow('is empty');
  });

  it('returns parsed config if file is valid', () => {
    const validConfig = {
      budget: { retainedTokens: 1000, maxTokens: 2000 },
      gcBackstop: { strategy: 'truncate', target: 'max' },
      pipelines: [],
    };
    fileSystem.setFile('/path/to/sidecar.json', JSON.stringify(validConfig));
    const result = SidecarLoader.fromConfig(mockConfig, registry, fileSystem);
    expect(result.budget.maxTokens).toBe(2000);
  });

  it('throws validation error if file is invalid', () => {
    const invalidConfig = {
      budget: { retainedTokens: 1000 }, // missing maxTokens
    };
    fileSystem.setFile('/path/to/sidecar.json', JSON.stringify(invalidConfig));
    expect(() =>
      SidecarLoader.fromConfig(mockConfig, registry, fileSystem),
    ).toThrow('Validation error:');
  });
});
