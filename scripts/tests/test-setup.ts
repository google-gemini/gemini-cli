/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

process.env['GEMINI_SKIP_USER_LOCALES'] = '1';

vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  appendFileSync: vi.fn(),
}));
