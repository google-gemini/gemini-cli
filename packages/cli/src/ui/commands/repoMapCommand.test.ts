/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { repoMapCommand } from './repoMapCommand.js';
import type { CommandContext } from './types.js';
import type { Config } from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    buildRepoTree: vi.fn().mockResolvedValue({
      name: 'mock-repo',
      isDirectory: true,
      children: [],
    }),
  };
});

describe('repoMapCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    context = createMockCommandContext({
      services: {
        config: {
          getProjectRoot: vi.fn().mockReturnValue('/home/user/project'),
        } as unknown as Config,
      },
    });
  });

  it('should return RepoMap UI component on success', async () => {
    const result = await repoMapCommand.action!(context, '');

    expect(context.ui.setPendingItem).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Generating repository map...' }),
    );
    expect(result).toMatchObject({
      type: 'custom_dialog',
    });
  });

  it('should handle error if outside workspace', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.services.config!.getProjectRoot as any).mockReturnValue(undefined);
    await repoMapCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('Outside of a project workspace'),
      }),
    );
  });
});
