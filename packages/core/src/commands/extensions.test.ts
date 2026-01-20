/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { listExtensions } from './extensions.js';
import type { Config } from '../config/config.js';

describe('listExtensions', () => {
  it('should call config.getExtensions and return the result', () => {
    const mockExtensions = [{ name: 'ext1' }, { name: 'ext2' }];
    const mockConfig = {
      getExtensions: vi.fn().mockReturnValue(mockExtensions),
    } as unknown as Config;

    const result = listExtensions(mockConfig);

    expect(mockConfig.getExtensions).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockExtensions);
  });
});
