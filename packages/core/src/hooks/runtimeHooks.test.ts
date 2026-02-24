/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookSystem } from './hookSystem.js';
import { Config } from '../config/config.js';
import { HookType, HookEventName, ConfigSource } from './types.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Mock console methods
vi.stubGlobal('console', {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe('Runtime Hooks', () => {
  let hookSystem: HookSystem;
  let config: Config;

  beforeEach(() => {
    vi.resetAllMocks();
    const testDir = path.join(os.tmpdir(), 'test-runtime-hooks');
    fs.mkdirSync(testDir, { recursive: true });

    config = new Config({
      model: 'gemini-3-flash-preview',
      targetDir: testDir,
      sessionId: 'test-session',
      debugMode: false,
      cwd: testDir,
    });

    // Stub getMessageBus
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).getMessageBus = () => undefined;

    hookSystem = new HookSystem(config);
  });

  it('should register a runtime hook', async () => {
    await hookSystem.initialize();

    const action = vi.fn().mockResolvedValue(undefined);
    hookSystem.registerHook(
      {
        type: HookType.Runtime,
        name: 'test-hook',
        action,
      },
      HookEventName.BeforeTool,
      { matcher: 'TestTool' },
    );

    const hooks = hookSystem.getAllHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0].config.name).toBe('test-hook');
    expect(hooks[0].source).toBe(ConfigSource.Runtime);
  });

  it('should execute a runtime hook', async () => {
    await hookSystem.initialize();

    const action = vi.fn().mockImplementation(async () => ({
      decision: 'allow',
      systemMessage: 'Hook ran',
    }));

    hookSystem.registerHook(
      {
        type: HookType.Runtime,
        name: 'test-hook',
        action,
      },
      HookEventName.BeforeTool,
      { matcher: 'TestTool' },
    );

    const result = await hookSystem
      .getEventHandler()
      .fireBeforeToolEvent('TestTool', { foo: 'bar' });

    expect(action).toHaveBeenCalled();
    expect(action.mock.calls[0][0]).toMatchObject({
      tool_name: 'TestTool',
      tool_input: { foo: 'bar' },
      hook_event_name: 'BeforeTool',
    });

    expect(result.finalOutput?.systemMessage).toBe('Hook ran');
  });

  it('should handle runtime hook errors', async () => {
    await hookSystem.initialize();

    const action = vi.fn().mockRejectedValue(new Error('Hook failed'));

    hookSystem.registerHook(
      {
        type: HookType.Runtime,
        name: 'fail-hook',
        action,
      },
      HookEventName.BeforeTool,
      { matcher: 'TestTool' },
    );

    // Should not throw, but handle error gracefully
    await hookSystem.getEventHandler().fireBeforeToolEvent('TestTool', {});

    expect(action).toHaveBeenCalled();
  });

  it('should preserve runtime hooks across re-initialization', async () => {
    await hookSystem.initialize();

    hookSystem.registerHook(
      {
        type: HookType.Runtime,
        name: 'persist-hook',
        action: async () => {},
      },
      HookEventName.BeforeTool,
      { matcher: 'TestTool' },
    );

    expect(hookSystem.getAllHooks()).toHaveLength(1);

    // Re-initialize
    await hookSystem.initialize();

    expect(hookSystem.getAllHooks()).toHaveLength(1);
    expect(hookSystem.getAllHooks()[0].config.name).toBe('persist-hook');
  });
});
