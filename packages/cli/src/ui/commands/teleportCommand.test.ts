/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { teleportCommand } from './teleportCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { type Config } from '@google/gemini-cli-core';
import { existsSync } from 'node:fs';

const mockExportSession = vi.fn();
const mockImportSession = vi.fn();

vi.mock('prompts', () => ({
  default: vi.fn().mockResolvedValue({ secret: 'prompted-secret' }),
}));

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    default: {
      ...original,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    TeleportService: class {
      exportSession = mockExportSession;
      importSession = mockImportSession;
    },
    getAdminErrorMessage: vi.fn().mockReturnValue('Admin Error'),
    debugLogger: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});

describe('teleportCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;

  beforeEach(() => {
    mockExportSession.mockResolvedValue({
      packagePath: 'any.tar.gz',
      sessionId: 'current-session-id',
      filesIncluded: ['file1'],
    });

    mockImportSession.mockResolvedValue({
      sessionId: 'imported-id',
      projectIdentifier: 'imported-project',
    });

    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('current-session-id'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
    } as unknown as Config;

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    vi.stubEnv('GEMINI_TELEPORT_SECRET', '');
    mockExportSession.mockClear();
    mockImportSession.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should have the correct metadata', () => {
    expect(teleportCommand.name).toBe('teleport');
    expect(teleportCommand.subCommands).toHaveLength(2);
  });

  describe('export', () => {
    it('should export the current session when no args provided', async () => {
      const exportSubCommand = teleportCommand.subCommands?.find(
        (c) => c.name === 'export',
      );
      await exportSubCommand?.action?.(mockContext, '');

      expect(mockExportSession).toHaveBeenCalledWith(
        'current-session-id',
        expect.stringContaining('gemini-session-current-'),
        undefined,
        undefined,
      );
    });

    it('should use environment variable for secret', async () => {
      vi.stubEnv('GEMINI_TELEPORT_SECRET', 'env-secret');
      const exportSubCommand = teleportCommand.subCommands?.find(
        (c) => c.name === 'export',
      );
      await exportSubCommand?.action?.(mockContext, '--secret');

      expect(mockExportSession).toHaveBeenCalledWith(
        'current-session-id',
        expect.any(String),
        'env-secret',
        undefined,
      );
    });

    it('should use key file for secret', async () => {
      const exportSubCommand = teleportCommand.subCommands?.find(
        (c) => c.name === 'export',
      );
      vi.mocked(existsSync).mockReturnValue(true);

      await exportSubCommand?.action?.(mockContext, '--key-file /path/to/key');

      expect(mockExportSession).toHaveBeenCalledWith(
        'current-session-id',
        expect.any(String),
        expect.any(String),
        undefined,
      );
    });
  });

  describe('import', () => {
    it('should import successfully if file exists', async () => {
      const importSubCommand = teleportCommand.subCommands?.find(
        (c) => c.name === 'import',
      );
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await importSubCommand?.action?.(
        mockContext,
        'my-session.tar.gz',
      );

      expect(mockImportSession).toHaveBeenCalledWith(
        'my-session.tar.gz',
        undefined,
      );
      expect(result).toEqual(
        expect.objectContaining({
          type: 'message',
          messageType: 'info',
          content: expect.stringContaining('imported successfully'),
        }),
      );
    });

    it('should handle environment secret during import', async () => {
      vi.stubEnv('GEMINI_TELEPORT_SECRET', 'env-secret');
      const importSubCommand = teleportCommand.subCommands?.find(
        (c) => c.name === 'import',
      );
      vi.mocked(existsSync).mockReturnValue(true);

      await importSubCommand?.action?.(
        mockContext,
        'my-session.tar.gz --secret',
      );

      expect(mockImportSession).toHaveBeenCalledWith(
        'my-session.tar.gz',
        'env-secret',
      );
    });
  });
});
