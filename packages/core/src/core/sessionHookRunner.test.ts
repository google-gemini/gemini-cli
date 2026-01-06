/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSessionHookRunner,
  NoOpSessionHookRunner,
} from './sessionHookRunner.js';
import * as sessionHookTriggers from './sessionHookTriggers.js';
import {
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
} from '../hooks/types.js';

vi.mock('./sessionHookTriggers.js', () => ({
  fireSessionStartHook: vi.fn().mockResolvedValue(undefined),
  fireSessionEndHook: vi.fn().mockResolvedValue(undefined),
  firePreCompressHook: vi.fn().mockResolvedValue(undefined),
}));

describe('SessionHookRunner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ActiveSessionHookRunner', () => {
    const mockMessageBus = {
      request: vi.fn().mockResolvedValue({}),
    } as unknown as Parameters<typeof createSessionHookRunner>[0];

    it('should call fireSessionStartHook with correct parameters', async () => {
      const runner = createSessionHookRunner(mockMessageBus);
      await runner.fireSessionStart(SessionStartSource.Startup);

      expect(sessionHookTriggers.fireSessionStartHook).toHaveBeenCalledWith(
        mockMessageBus,
        SessionStartSource.Startup,
      );
    });

    it('should call fireSessionEndHook with correct parameters', async () => {
      const runner = createSessionHookRunner(mockMessageBus);
      await runner.fireSessionEnd(SessionEndReason.Exit);

      expect(sessionHookTriggers.fireSessionEndHook).toHaveBeenCalledWith(
        mockMessageBus,
        SessionEndReason.Exit,
      );
    });

    it('should call firePreCompressHook with correct parameters', async () => {
      const runner = createSessionHookRunner(mockMessageBus);
      await runner.firePreCompress(PreCompressTrigger.Manual);

      expect(sessionHookTriggers.firePreCompressHook).toHaveBeenCalledWith(
        mockMessageBus,
        PreCompressTrigger.Manual,
      );
    });
  });

  describe('NoOpSessionHookRunner', () => {
    it('should return undefined for fireSessionStart', async () => {
      const runner = new NoOpSessionHookRunner();
      const result = await runner.fireSessionStart(SessionStartSource.Startup);

      expect(result).toBeUndefined();
    });

    it('should not call any hook functions for fireSessionEnd', async () => {
      const runner = new NoOpSessionHookRunner();
      await runner.fireSessionEnd(SessionEndReason.Exit);

      expect(sessionHookTriggers.fireSessionEndHook).not.toHaveBeenCalled();
    });

    it('should not call any hook functions for firePreCompress', async () => {
      const runner = new NoOpSessionHookRunner();
      await runner.firePreCompress(PreCompressTrigger.Auto);

      expect(sessionHookTriggers.firePreCompressHook).not.toHaveBeenCalled();
    });
  });
});
