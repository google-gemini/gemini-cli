/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { getPackageJson } from './package.js';
import { readPackageUp } from 'read-package-up';

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(),
}));

describe('getPackageJson', () => {
  it('should return packageJson when found', async () => {
    const mockPackageJson = { name: 'test-pkg', version: '1.2.3' };
    vi.mocked(readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/path/to/package.json',
    });

    const result = await getPackageJson('/some/path');
    expect(result).toEqual(mockPackageJson);
    expect(readPackageUp).toHaveBeenCalledWith({
      cwd: '/some/path',
      normalize: false,
    });
  });

  it('should return undefined when no package.json is found', async () => {
    vi.mocked(readPackageUp).mockResolvedValue(undefined);

    const result = await getPackageJson('/some/path');
    expect(result).toBeUndefined();
  });

  it('should handle non-semver versions when normalize is false', async () => {
    const mockPackageJson = { name: 'test-pkg', version: '2024.60' };
    vi.mocked(readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/path/to/package.json',
    });

    const result = await getPackageJson('/some/path');
    expect(result).toEqual(mockPackageJson);
  });

  it('should return undefined when readPackageUp throws', async () => {
    vi.mocked(readPackageUp).mockRejectedValue(new Error('Read error'));

    const result = await getPackageJson('/some/path');
    expect(result).toBeUndefined();
  });
});
