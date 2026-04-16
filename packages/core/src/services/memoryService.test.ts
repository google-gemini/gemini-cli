/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from './memoryService.js';
import { DefaultMemoryProvider } from './defaultMemoryProvider.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./defaultMemoryProvider.js', () => {
  // Default behaviors are no-ops; individual tests override via spies.
  class MockDefaultMemoryProvider {
    readonly id = 'gemini-cli-builtin-memory';
    onSessionStart = vi.fn();
    getSystemInstructions = vi.fn().mockReturnValue('');
    getTurnContext = vi.fn().mockReturnValue('');
    onTurnComplete = vi.fn();
    onSessionEnd = vi.fn();
  }
  return { DefaultMemoryProvider: MockDefaultMemoryProvider };
});

function createConfig(): Config {
  return {} as unknown as Config;
}

function getProvider(service: MemoryService): {
  onSessionStart: ReturnType<typeof vi.fn>;
  getSystemInstructions: ReturnType<typeof vi.fn>;
  getTurnContext: ReturnType<typeof vi.fn>;
  onTurnComplete: ReturnType<typeof vi.fn>;
  onSessionEnd: ReturnType<typeof vi.fn>;
} {
  // Reach into the private field to manipulate the underlying mocked provider.
  return (service as unknown as { provider: ReturnType<typeof vi.fn> })
    .provider as never;
}

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs a DefaultMemoryProvider on instantiation', () => {
    const service = new MemoryService(createConfig());
    expect(getProvider(service)).toBeInstanceOf(DefaultMemoryProvider);
  });

  describe('lifecycle delegation', () => {
    it('delegates onSessionStart to the provider', async () => {
      const config = createConfig();
      const service = new MemoryService(config);

      await service.onSessionStart('session-123');
      expect(getProvider(service).onSessionStart).toHaveBeenCalledWith(
        config,
        'session-123',
      );
    });

    it('delegates getSystemInstructions to the provider', async () => {
      const service = new MemoryService(createConfig());
      getProvider(service).getSystemInstructions.mockReturnValue(
        'static instructions',
      );

      const result = await service.getSystemInstructions();
      expect(result).toBe('static instructions');
    });

    it('delegates getTurnContext to the provider', async () => {
      const service = new MemoryService(createConfig());
      getProvider(service).getTurnContext.mockReturnValue('relevant context');

      const result = await service.getTurnContext('how do I deploy?');
      expect(result).toBe('relevant context');
      expect(getProvider(service).getTurnContext).toHaveBeenCalledWith(
        'how do I deploy?',
      );
    });

    it('delegates onTurnComplete to the provider', () => {
      const service = new MemoryService(createConfig());
      service.onTurnComplete('user msg', 'assistant msg');
      expect(getProvider(service).onTurnComplete).toHaveBeenCalledWith(
        'user msg',
        'assistant msg',
      );
    });

    it('delegates onSessionEnd to the provider', async () => {
      const service = new MemoryService(createConfig());
      await service.onSessionEnd();
      expect(getProvider(service).onSessionEnd).toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    it('catches and logs onSessionStart errors', async () => {
      const service = new MemoryService(createConfig());
      getProvider(service).onSessionStart.mockImplementation(() => {
        throw new Error('startup boom');
      });

      await expect(service.onSessionStart('s1')).resolves.toBeUndefined();
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during onSessionStart'),
        expect.any(Error),
      );
    });

    it('catches and logs getSystemInstructions errors, returning empty string', async () => {
      const service = new MemoryService(createConfig());
      getProvider(service).getSystemInstructions.mockImplementation(() => {
        throw new Error('instructions boom');
      });

      const result = await service.getSystemInstructions();
      expect(result).toBe('');
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during getSystemInstructions'),
        expect.any(Error),
      );
    });

    it('catches and logs getTurnContext errors, returning empty string', async () => {
      const service = new MemoryService(createConfig());
      getProvider(service).getTurnContext.mockImplementation(() => {
        throw new Error('context boom');
      });

      const result = await service.getTurnContext('query');
      expect(result).toBe('');
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during getTurnContext'),
        expect.any(Error),
      );
    });

    it('catches and logs synchronous onTurnComplete errors', () => {
      const service = new MemoryService(createConfig());
      getProvider(service).onTurnComplete.mockImplementation(() => {
        throw new Error('turn boom');
      });

      expect(() => service.onTurnComplete('u', 'a')).not.toThrow();
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during onTurnComplete'),
        expect.any(Error),
      );
    });

    it('catches and logs onSessionEnd errors', async () => {
      const service = new MemoryService(createConfig());
      getProvider(service).onSessionEnd.mockImplementation(() => {
        throw new Error('end boom');
      });

      await expect(service.onSessionEnd()).resolves.toBeUndefined();
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during onSessionEnd'),
        expect.any(Error),
      );
    });
  });
});
