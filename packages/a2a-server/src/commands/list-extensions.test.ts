/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ListExtensionsCommand } from './list-extensions.js';
import type { Config } from '@google/gemini-cli-core';

const mockListExtensions = vi.hoisted(() => vi.fn());
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    listExtensions: mockListExtensions,
  };
});

describe('ListExtensionsCommand', () => {
  it('should have the correct names', () => {
    const command = new ListExtensionsCommand();
    expect(command.names).toEqual(['extensions', 'extensions list']);
  });

  it('should call listExtensions with the provided config', async () => {
    const command = new ListExtensionsCommand();
    const mockConfig = {} as Config;
    const mockExtensions = [{ name: 'ext1' }];
    mockListExtensions.mockReturnValue(mockExtensions);

    const result = await command.execute(mockConfig, []);

    expect(result).toEqual(mockExtensions);
    expect(mockListExtensions).toHaveBeenCalledWith(mockConfig);
  });
});
