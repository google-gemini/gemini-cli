/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ExtensionsCommand, ListExtensionsCommand } from './extensions.js';
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

describe('ExtensionsCommand', () => {
  it('should have the correct name', () => {
    const command = new ExtensionsCommand();
    expect(command.name).toEqual('extensions');
  });

  it('should have the correct description', () => {
    const command = new ExtensionsCommand();
    expect(command.description).toEqual('Manage extensions.');
  });

  it('should have "extensions list" as a subcommand', () => {
    const command = new ExtensionsCommand();
    expect(command.subCommands.map((c) => c.name)).toContain('extensions list');
  });

  it('should be a top-level command', () => {
    const command = new ExtensionsCommand();
    expect(command.topLevel).toBe(true);
  });

  it('should default to listing extensions', async () => {
    const command = new ExtensionsCommand();
    const mockConfig = {} as Config;
    const mockExtensions = [{ name: 'ext1' }];
    mockListExtensions.mockReturnValue(mockExtensions);

    const result = await command.execute(mockConfig, []);

    expect(result).toEqual({ name: 'extensions list', data: mockExtensions });
    expect(mockListExtensions).toHaveBeenCalledWith(mockConfig);
  });
});

describe('ListExtensionsCommand', () => {
  it('should have the correct name', () => {
    const command = new ListExtensionsCommand();
    expect(command.name).toEqual('extensions list');
  });

  it('should call listExtensions with the provided config', async () => {
    const command = new ListExtensionsCommand();
    const mockConfig = {} as Config;
    const mockExtensions = [{ name: 'ext1' }];
    mockListExtensions.mockReturnValue(mockExtensions);

    const result = await command.execute(mockConfig, []);

    expect(result).toEqual({ name: 'extensions list', data: mockExtensions });
    expect(mockListExtensions).toHaveBeenCalledWith(mockConfig);
  });

  it('should return a message when no extensions are installed', async () => {
    const command = new ListExtensionsCommand();
    const mockConfig = {} as Config;
    mockListExtensions.mockReturnValue([]);

    const result = await command.execute(mockConfig, []);

    expect(result).toEqual({
      name: 'extensions list',
      data: 'No extensions installed.',
    });
    expect(mockListExtensions).toHaveBeenCalledWith(mockConfig);
  });
});
