/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

import { ProjectRegistry } from '../config/projectRegistry.js';

export const PROJECT_SLUG = 'project-slug';

export function initMockProjectRegistry() {
  vi.mocked(ProjectRegistry).prototype.initialize = vi
    .fn()
    .mockReturnValue(undefined);
  vi.mocked(ProjectRegistry).prototype.getShortId = vi
    .fn()
    .mockReturnValue(PROJECT_SLUG);
}

initMockProjectRegistry();
