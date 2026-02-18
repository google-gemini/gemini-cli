/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Config } from './config.js';
import { TRACKER_INIT_TOOL_NAME } from '../tools/tool-names.js';
import * as os from 'node:os';

describe('Config Tracker Feature Flag', () => {
  const baseParams = {
    sessionId: 'test-session',
    targetDir: os.tmpdir(),
    cwd: os.tmpdir(),
    model: 'gemini-1.5-pro',
    debugMode: false,
  };

  it('should not register tracker tools by default', async () => {
    const config = new Config(baseParams);
    await config.initialize();
    const registry = config.getToolRegistry();
    expect(registry.getTool(TRACKER_INIT_TOOL_NAME)).toBeUndefined();
  });

  it('should register tracker tools when tracker is enabled', async () => {
    const config = new Config({
      ...baseParams,
      tracker: true,
    });
    await config.initialize();
    const registry = config.getToolRegistry();
    expect(registry.getTool(TRACKER_INIT_TOOL_NAME)).toBeDefined();
  });

  it('should not register tracker tools when tracker is explicitly disabled', async () => {
    const config = new Config({
      ...baseParams,
      tracker: false,
    });
    await config.initialize();
    const registry = config.getToolRegistry();
    expect(registry.getTool(TRACKER_INIT_TOOL_NAME)).toBeUndefined();
  });
});
