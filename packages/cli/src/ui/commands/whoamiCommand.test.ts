/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { whoamiCommand } from './whoamiCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    UserAccountManager: vi.fn().mockImplementation(() => ({
      getCachedGoogleAccount: vi.fn().mockReturnValue('test-email@example.com'),
    })),
  };
});

describe('whoamiCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        settings: {
          merged: {
            security: {
              auth: {
                selectedType: 'test-auth',
              },
            },
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(whoamiCommand.name).toBe('whoami');
    expect(whoamiCommand.description).toBe('Show current identity');
  });

  it('should call addItem with correct info', async () => {
    if (!whoamiCommand.action) {
      throw new Error('The whoami command must have an action.');
    }

    await whoamiCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.WHOAMI,
        selectedAuthType: 'test-auth',
        userEmail: 'test-email@example.com',
      },
      expect.any(Number),
    );
  });
});
