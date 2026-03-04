/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateCommand } from './generateCommand.js';
import { MessageType } from '../types.js';
import * as fs from 'node:fs/promises';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node:fs/promises');

describe('generateCommand', () => {
  const mockGenerateContent = vi.fn();
  // Provide a mock ContentGenerator inside services.config.getContentGenerator
  const mockContentGenerator = {
    generateContent: mockGenerateContent,
  };

  const baseContext = createMockCommandContext();
  const context = {
    ...baseContext,
    services: {
      ...baseContext.services,
      config: {
        getProjectRoot: () => '/mock/root',
        getActiveModel: () => 'test-model',
        getGeminiClient: () => ({
          /* mock gemini client */
        }),
        getContentGenerator: () => mockContentGenerator,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    },
    ui: {
      addItem: vi.fn(),
      setPendingItem: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows usage message when arguments are missing', async () => {
    await generateCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('Usage: /generate'),
      }),
      expect.any(Number),
    );
  });

  it('shows an error if file already exists and overwrite is not provided', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined);

    await generateCommand.action!(
      context,
      'Make a component src/component.tsx',
    );

    expect(fs.access).toHaveBeenCalled();
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('already exists'),
      }),
      expect.any(Number),
    );
  });

  it('generates content and writes to file on successful execution', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));
    vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
    vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);

    mockGenerateContent.mockResolvedValueOnce({
      text: 'const a = 1;',
    });

    await generateCommand.action!(context, 'Write a test file test.ts');

    expect(mockGenerateContent).toHaveBeenCalled();
    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test.ts'),
      'const a = 1;',
      'utf-8',
    );
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Created test.ts'),
      }),
      expect.any(Number),
    );
  });

  it('cleans up markdown block if model ignored prompt instructions', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));
    vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
    vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);

    mockGenerateContent.mockResolvedValueOnce({
      text: '```typescript\nconst a = 1;\n```',
    });

    await generateCommand.action!(context, 'Write a test file test.ts');

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test.ts'),
      'const a = 1;',
      'utf-8',
    );
  });

  it('prints output but does not write to file on --dry-run', async () => {
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));

    mockGenerateContent.mockResolvedValueOnce({
      text: 'const b = 2;',
    });

    await generateCommand.action!(context, 'Write a script test.ts --dry-run');

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('[DRY RUN]'),
      }),
      expect.any(Number),
    );
  });

  it('overwrites an existing file if --overwrite is provided', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined); // exists
    vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
    vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);

    mockGenerateContent.mockResolvedValueOnce({
      text: 'new content',
    });

    await generateCommand.action!(
      context,
      'Write a script test.ts --overwrite',
    );

    // Should not fail early, should generate and overwrite
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test.ts'),
      'new content',
      'utf-8',
    );
  });
});
