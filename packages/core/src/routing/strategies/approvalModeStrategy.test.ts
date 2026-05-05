/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalModeStrategy } from './approvalModeStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_AUTO,
} from '../../config/models.js';
import { AuthType } from '../../core/contentGenerator.js';
import { ApprovalMode } from '../../policy/types.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';

describe('ApprovalModeStrategy', () => {
  let strategy: ApprovalModeStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;

  beforeEach(() => {
    vi.clearAllMocks();

    strategy = new ApprovalModeStrategy();
    mockContext = {
      history: [],
      request: [{ text: 'test' }],
      signal: new AbortController().signal,
    };

    mockConfig = {
      getModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
      getPlanModeRoutingEnabled: vi.fn().mockResolvedValue(true),
      getGemini31Launched: vi.fn().mockResolvedValue(false),
      getUseCustomToolModel: vi.fn().mockImplementation(async () => {
        const launched = await mockConfig.getGemini31Launched();
        const authType = mockConfig.getContentGeneratorConfig?.()?.authType;
        return launched && authType === AuthType.USE_GEMINI;
      }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.LOGIN_WITH_GOOGLE,
      }),
    } as unknown as Config;

    mockBaseLlmClient = {} as BaseLlmClient;
  });

  it('should return null if the model is not an auto model', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(DEFAULT_GEMINI_MODEL);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
  });

  it('should return null if plan mode routing is disabled', async () => {
    vi.mocked(mockConfig.getPlanModeRoutingEnabled).mockResolvedValue(false);
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
  });

  it('should route to PRO model if ApprovalMode is PLAN (Gemini 2.5)', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toEqual({
      model: DEFAULT_GEMINI_MODEL,
      metadata: {
        source: 'approval-mode',
        latencyMs: expect.any(Number),
        reasoning: 'Routing to Pro model because ApprovalMode is PLAN.',
      },
    });
  });

  it('should route to PRO model if ApprovalMode is PLAN (Gemini 3)', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(PREVIEW_GEMINI_MODEL_AUTO);
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toEqual({
      model: PREVIEW_GEMINI_MODEL,
      metadata: {
        source: 'approval-mode',
        latencyMs: expect.any(Number),
        reasoning: 'Routing to Pro model because ApprovalMode is PLAN.',
      },
    });
  });

  it('should route to FLASH model if an approved plan exists (Gemini 2.5)', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.DEFAULT);
    vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(
      '/path/to/plan.md',
    );

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toEqual({
      model: DEFAULT_GEMINI_FLASH_MODEL,
      metadata: {
        source: 'approval-mode',
        latencyMs: expect.any(Number),
        reasoning:
          'Routing to Flash model because an approved plan exists at /path/to/plan.md.',
      },
    });
  });

  it('should route to FLASH model if an approved plan exists (Gemini 3)', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(PREVIEW_GEMINI_MODEL_AUTO);
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.DEFAULT);
    vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(
      '/path/to/plan.md',
    );

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toEqual({
      model: PREVIEW_GEMINI_FLASH_MODEL,
      metadata: {
        source: 'approval-mode',
        latencyMs: expect.any(Number),
        reasoning:
          'Routing to Flash model because an approved plan exists at /path/to/plan.md.',
      },
    });
  });

  it('should return null if not in PLAN mode and no approved plan exists', async () => {
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.DEFAULT);
    vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(undefined);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
  });

  it('should prioritize requestedModel over config model if it is an auto model', async () => {
    mockContext.requestedModel = PREVIEW_GEMINI_MODEL_AUTO;
    vi.mocked(mockConfig.getModel).mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision?.model).toBe(PREVIEW_GEMINI_MODEL);
  });

  it('should route to Preview models when using "auto" alias', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(GEMINI_MODEL_ALIAS_AUTO);
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision?.model).toBe(PREVIEW_GEMINI_MODEL);

    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.DEFAULT);
    vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(
      '/path/to/plan.md',
    );

    const implementationDecision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(implementationDecision?.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });

  it('should route to Preview Flash model when an approved plan exists and Gemini 3.1 is launched', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(GEMINI_MODEL_ALIAS_AUTO);
    vi.mocked(mockConfig.getGemini31Launched).mockResolvedValue(true);

    // Exit plan mode with approved plan
    vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.DEFAULT);
    vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(
      '/path/to/plan.md',
    );

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    // Should resolve to Preview Flash (3.0) because resolveClassifierModel uses preview variants for Gemini 3
    expect(decision?.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
  });
});
