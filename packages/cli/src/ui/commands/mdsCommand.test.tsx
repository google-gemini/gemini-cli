/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { mdsCommand } from './mdsCommand.js';
import type { CommandContext, OpenCustomDialogActionReturn } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('mdsCommand', () => {
  let mockContext: CommandContext;

  it('should return a custom_dialog with MdsBrowser component', async () => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiMdFilePaths: () => ['/fake/path/.GEMINI.md'],
          getAgentRegistry: () => ({
            getAllDefinitions: () => [],
          }),
        },
      },
    });

    if (!mdsCommand.action) throw new Error('Command has no action');

    const result = (await mdsCommand.action(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;

    expect(result).toBeDefined();
    expect(result?.type).toBe('custom_dialog');
    expect(result?.component).toBeDefined();
  });
});
