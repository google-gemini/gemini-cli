/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { MapTool } from './map-tool.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

describe('MapTool', () => {
  const mockConfig: Config = {
    getTargetDir: vi.fn().mockReturnValue('/home/project'),
    validatePathAccess: vi.fn().mockReturnValue(null),
    getGlobToolMaxFiles: vi.fn(),
  } as unknown as Config;

  const mockMessageBus: MessageBus = {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MessageBus;

  it('instantiates correctly and has correct name and kind', () => {
    const mapTool = new MapTool(mockConfig, mockMessageBus);
    expect(mapTool.name).toBe('map_project_structure');
    expect(mapTool.kind).toBe('search');
    expect(mapTool.getSchema()).toBeDefined();
  });

  it('validates tool param values correctly', () => {
    const mapTool = new MapTool(mockConfig, mockMessageBus);
    expect(mapTool['validateToolParamValues']({})).toBeNull();

    expect(
      mapTool['validateToolParamValues']({ dir_path: 'folder' }),
    ).toBeNull();
    expect(mockConfig.validatePathAccess).toHaveBeenCalled();
  });
});
