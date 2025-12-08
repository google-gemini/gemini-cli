/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type {
  ModelAvailabilityService,
  ModelSelectionResult,
} from './modelAvailabilityService.js';

/**
 * Test helper to create a fully mocked ModelAvailabilityService.
 */
export function createAvailabilityServiceMock(
  selection: ModelSelectionResult = { selectedModel: null, skipped: [] },
): ModelAvailabilityService {
  const service = {
    markTerminal: vi.fn(),
    markHealthy: vi.fn(),
    markRetryOncePerTurn: vi.fn(),
    consumeStickyAttempt: vi.fn(),
    snapshot: vi.fn(),
    resetTurn: vi.fn(),
    selectFirstAvailable: vi.fn().mockReturnValue(selection),
  };

  return service as unknown as ModelAvailabilityService;
}
