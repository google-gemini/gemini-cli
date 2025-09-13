/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from './contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';

describe('LoggingContentGenerator', () => {
  let mockConfig: Config;
  let mockWrapped: ContentGenerator;
  let loggingGenerator: LoggingContentGenerator;

  beforeEach(() => {
    mockConfig = {} as Config;
    mockWrapped = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
      userTier: undefined,
    } as ContentGenerator;

    loggingGenerator = new LoggingContentGenerator(mockWrapped, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('userTier getter', () => {
    it('should return userTier from wrapped ContentGenerator - STANDARD', () => {
      mockWrapped.userTier = UserTierId.STANDARD;
      expect(loggingGenerator.userTier).toBe(UserTierId.STANDARD);
    });

    it('should return userTier from wrapped ContentGenerator - FREE', () => {
      mockWrapped.userTier = UserTierId.FREE;
      expect(loggingGenerator.userTier).toBe(UserTierId.FREE);
    });

    it('should return userTier from wrapped ContentGenerator - LEGACY', () => {
      mockWrapped.userTier = UserTierId.LEGACY;
      expect(loggingGenerator.userTier).toBe(UserTierId.LEGACY);
    });

    it('should return undefined when wrapped userTier is undefined', () => {
      mockWrapped.userTier = undefined;
      expect(loggingGenerator.userTier).toBeUndefined();
    });
  });
});