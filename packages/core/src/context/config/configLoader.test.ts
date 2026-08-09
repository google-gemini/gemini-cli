/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadContextManagementConfig } from './configLoader.js';
import { generalistProfile } from './profiles.js';
import { ContextProcessorRegistry } from './registry.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { JSONSchemaType } from 'ajv';

describe('SidecarLoader (Real FS)', () => {
  let tmpDir: string;
  let registry: ContextProcessorRegistry;
  let sidecarPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-sidecar-test-'));
    sidecarPath = path.join(tmpDir, 'sidecar.json');
    registry = new ContextProcessorRegistry();
    registry.registerProcessor({
      id: 'NodeTruncation',
      schema: {
        type: 'object',
        properties: { maxTokens: { type: 'number' } },
        required: ['maxTokens'],
      } as unknown as JSONSchemaType<{ maxTokens: number }>,
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns default profile if file does not exist', async () => {
    const result = await loadContextManagementConfig(sidecarPath, registry);
    expect(result).toBe(generalistProfile);
  });

  it('returns default profile if file exists but is 0 bytes', async () => {
    await fs.writeFile(sidecarPath, '');
    const result = await loadContextManagementConfig(sidecarPath, registry);
    expect(result).toBe(generalistProfile);
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
    await fs.writeFile(sidecarPath, JSON.stringify(validConfig));
    const result = await loadContextManagementConfig(sidecarPath, registry);
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
    await fs.writeFile(sidecarPath, JSON.stringify(invalidConfig));
    await expect(
      loadContextManagementConfig(sidecarPath, registry),
    ).rejects.toThrow('Validation error');
  });

  it('throws validation error if file is empty whitespace', async () => {
    await fs.writeFile(sidecarPath, '   \n  ');
    await expect(
      loadContextManagementConfig(sidecarPath, registry),
    ).rejects.toThrow('Unexpected end of JSON input');
  });
});
