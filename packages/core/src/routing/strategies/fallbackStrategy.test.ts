/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackStrategy } from './fallbackStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { Config } from '../../config/config.js';
import type { ModelAvailabilityService } from '../../availability/modelAvailabilityService.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
} from '../../config/models.js';
import { selectModelForAvailability } from '../../availability/policyHelpers.js';

vi.mock('../../availability/policyHelpers.js', () => ({
  selectModelForAvailability: vi.fn(),
}));

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    getModelAvailabilityService: vi.fn(),
    getModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL),
    getPreviewFeatures: vi.fn().mockReturnValue(false),
    ...overrides,
  }) as unknown as Config;

describe('FallbackStrategy', () => {
  const strategy = new FallbackStrategy();
  const mockContext = {} as RoutingContext;
  const mockClient = {} as BaseLlmClient;
  let mockService: ModelAvailabilityService;
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetAllMocks();

    mockService = {
      snapshot: vi.fn(),
    } as unknown as ModelAvailabilityService;

    mockConfig = createMockConfig({
      getModelAvailabilityService: vi.fn().mockReturnValue(mockService),
    });
  });

  it('should return null if the requested model is available', async () => {
    // Mock snapshot to return available
    vi.mocked(mockService.snapshot).mockReturnValue({ available: true });

    const decision = await strategy.route(mockContext, mockConfig, mockClient);
    expect(decision).toBeNull();
    // Should check availability of the resolved model (DEFAULT_GEMINI_MODEL)
    expect(mockService.snapshot).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL);
  });

  it('should return null if fallback selection is same as requested model', async () => {
    // Mock snapshot to return unavailable
    vi.mocked(mockService.snapshot).mockReturnValue({
      available: false,
      reason: 'quota',
    });
    // Mock selectModelForAvailability to return the SAME model (no fallback found)
    vi.mocked(selectModelForAvailability).mockReturnValue({
      selectedModel: DEFAULT_GEMINI_MODEL,
      skipped: [],
    });

    const decision = await strategy.route(mockContext, mockConfig, mockClient);
    expect(decision).toBeNull();
  });

  it('should return fallback decision if model is unavailable and fallback found', async () => {
    // Mock snapshot to return unavailable
    vi.mocked(mockService.snapshot).mockReturnValue({
      available: false,
      reason: 'quota',
    });

    // Mock selectModelForAvailability to find a fallback (Flash)
    vi.mocked(selectModelForAvailability).mockReturnValue({
      selectedModel: DEFAULT_GEMINI_FLASH_MODEL,
      skipped: [{ model: DEFAULT_GEMINI_MODEL, reason: 'quota' }],
    });

    const decision = await strategy.route(mockContext, mockConfig, mockClient);

    expect(decision).not.toBeNull();
    expect(decision?.model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    expect(decision?.metadata.source).toBe('fallback');
    expect(decision?.metadata.reasoning).toContain(
      `Model ${DEFAULT_GEMINI_MODEL} is unavailable`,
    );
  });

  it('should correctly handle "auto" alias by resolving it before checking availability', async () => {
    // Mock snapshot to return available for the RESOLVED model
    vi.mocked(mockService.snapshot).mockReturnValue({ available: true });
    vi.mocked(mockConfig.getModel).mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);

    const decision = await strategy.route(mockContext, mockConfig, mockClient);

    expect(decision).toBeNull();
    // Important: check that it queried snapshot with the RESOLVED model, not 'auto'
    expect(mockService.snapshot).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL);
  });

  it('should respect requestedModel from context', async () => {
    const requestedModel = 'requested-model';
    const configModel = 'config-model';
    vi.mocked(mockConfig.getModel).mockReturnValue(configModel);
    vi.mocked(mockService.snapshot).mockReturnValue({ available: true });

    const contextWithRequestedModel = {
      requestedModel,
    } as RoutingContext;

    const decision = await strategy.route(
      contextWithRequestedModel,
      mockConfig,
      mockClient,
    );

    expect(decision).toBeNull();
    // Should check availability of the requested model from context
    expect(mockService.snapshot).toHaveBeenCalledWith(requestedModel);
  });
});
