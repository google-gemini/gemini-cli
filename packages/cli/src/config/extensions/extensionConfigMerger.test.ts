/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeExtensionConfigurations } from './extensionConfigMerger.js';
import {
  type GeminiCLIExtension,
  coreEvents,
  debugLogger,
} from '@google/gemini-cli-core';
import { MergeStrategy } from '../settingsSchema.js';

describe('mergeExtensionConfigurations', () => {
  beforeEach(() => {
    vi.spyOn(coreEvents, 'emitFeedback');
    vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
  });

  function createExtension(
    name: string,
    configuration?: Record<string, unknown>,
  ): GeminiCLIExtension {
    return {
      name,
      version: '1.0.0',
      isActive: true,
      path: '/ext',
      contextFiles: [],
      id: name,
      configuration,
    } as GeminiCLIExtension;
  }

  function getMergeStrategyForPath(path: string[]): MergeStrategy | undefined {
    if (path[0] === 'arrayConcat') return MergeStrategy.CONCAT;
    if (path[0] === 'arrayUnion') return MergeStrategy.UNION;
    if (path[0] === 'arrayReplace') return MergeStrategy.REPLACE;
    return undefined; // default object merge, or scalar replace
  }

  it('filters restricted top-level paths', () => {
    const ext1 = createExtension('ext1', {
      security: { folderTrust: { enabled: false } },
      privacy: { usageStatisticsEnabled: false },
      telemetry: { enabled: false },
      admin: { secureModeEnabled: false },
      context: { includeDirectories: ['foo'] },
    });

    const { settings, warnings } = mergeExtensionConfigurations(
      [ext1],
      getMergeStrategyForPath,
    );

    expect(settings).toEqual({
      context: { includeDirectories: ['foo'] },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'restricted settings: [security, privacy, telemetry, admin]',
    );
  });

  it('merges single extension properly', () => {
    const ext1 = createExtension('ext1', {
      general: { defaultApprovalMode: 'yolo' },
    });

    const { settings, warnings } = mergeExtensionConfigurations(
      [ext1],
      getMergeStrategyForPath,
    );
    expect(settings).toEqual({ general: { defaultApprovalMode: 'yolo' } });
    expect(warnings).toHaveLength(0);
  });

  it('resolves scalar conflicts deterministically (alphabetical ext name) and warns', () => {
    const extZ = createExtension('Z', { general: { model: 'model-Z' } });
    const extA = createExtension('A', { general: { model: 'model-A' } });

    const { settings, warnings } = mergeExtensionConfigurations(
      [extA, extZ],
      getMergeStrategyForPath,
    );
    expect(settings).toEqual({ general: { model: 'model-Z' } });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'Conflict in extension configuration "general.model"',
    );
    expect(warnings[0]).toContain('A, Z');
    expect(warnings[0]).toContain('value from "Z"');
  });

  it('merges arrays according to merge strategies', () => {
    const extA = createExtension('A', {
      arrayConcat: [1, 2],
      arrayUnion: [1, 2],
      arrayReplace: [1, 2],
    });
    const extB = createExtension('B', {
      arrayConcat: [2, 3],
      arrayUnion: [2, 3],
      arrayReplace: [2, 3],
    });

    const { settings, warnings } = mergeExtensionConfigurations(
      [extA, extB],
      getMergeStrategyForPath,
    );

    expect(settings).toEqual({
      arrayConcat: [1, 2, 2, 3],
      arrayUnion: [1, 2, 3],
      arrayReplace: [2, 3],
    });

    // Strategy REPLACE on an array causes a conflict since both provide it and they replace.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'Conflict in extension configuration "arrayReplace"',
    );
  });
});
