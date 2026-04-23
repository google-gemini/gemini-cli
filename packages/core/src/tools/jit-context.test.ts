/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverJitContext, appendJitContext } from './jit-context.js';
import type { Config } from '../config/config.js';
import type { MemoryContextManager } from '../context/memoryContextManager.js';

describe('jit-context', () => {
  describe('discoverJitContext', () => {
    let mockConfig: Config;
    let mockMemoryContextManager: MemoryContextManager;

    beforeEach(() => {
      mockMemoryContextManager = {
        discoverContext: vi.fn().mockResolvedValue(''),
      } as unknown as MemoryContextManager;

      mockConfig = {
        isJitContextEnabled: vi.fn().mockReturnValue(false),
        getMemoryContextManager: vi
          .fn()
          .mockReturnValue(mockMemoryContextManager),
        getWorkspaceContext: vi.fn().mockReturnValue({
          getDirectories: vi.fn().mockReturnValue(['/app']),
        }),
      } as unknown as Config;
    });

    it('should return empty string when JIT is disabled', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(false);

      const result = await discoverJitContext(mockConfig, '/app/src/file.ts');

      expect(result).toBe('');
      expect(mockMemoryContextManager.discoverContext).not.toHaveBeenCalled();
    });

    it('should return empty string when memoryContextManager is undefined', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(true);
      vi.mocked(mockConfig.getMemoryContextManager).mockReturnValue(undefined);

      const result = await discoverJitContext(mockConfig, '/app/src/file.ts');

      expect(result).toBe('');
    });

    it('should call memoryContextManager.discoverContext with correct args when JIT is enabled', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(true);
      vi.mocked(mockMemoryContextManager.discoverContext).mockResolvedValue(
        'Subdirectory context content',
      );

      const result = await discoverJitContext(mockConfig, '/app/src/file.ts');

      expect(mockMemoryContextManager.discoverContext).toHaveBeenCalledWith(
        '/app/src/file.ts',
        ['/app'],
      );
      expect(result).toBe('Subdirectory context content');
    });

    it('should pass all workspace directories as trusted roots', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(true);
      vi.mocked(mockConfig.getWorkspaceContext).mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/app', '/lib']),
      } as unknown as ReturnType<Config['getWorkspaceContext']>);
      vi.mocked(mockMemoryContextManager.discoverContext).mockResolvedValue('');

      await discoverJitContext(mockConfig, '/app/src/file.ts');

      expect(mockMemoryContextManager.discoverContext).toHaveBeenCalledWith(
        '/app/src/file.ts',
        ['/app', '/lib'],
      );
    });

    it('should return empty string when no new context is found', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(true);
      vi.mocked(mockMemoryContextManager.discoverContext).mockResolvedValue('');

      const result = await discoverJitContext(mockConfig, '/app/src/file.ts');

      expect(result).toBe('');
    });

    it('should return empty string when discoverContext throws', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(true);
      vi.mocked(mockMemoryContextManager.discoverContext).mockRejectedValue(
        new Error('Permission denied'),
      );

      const result = await discoverJitContext(mockConfig, '/app/src/file.ts');

      expect(result).toBe('');
    });
  });

  describe('appendJitContext', () => {
    it('should return original content when jitContext is empty', () => {
      const content = 'file contents here';
      const result = appendJitContext(content, '');

      expect(result).toBe(content);
    });

    it('should append delimited context when jitContext is non-empty', () => {
      const content = 'file contents here';
      const jitContext = 'Use the useAuth hook.';

      const result = appendJitContext(content, jitContext);

      expect(result).toContain(content);
      expect(result).toContain('--- Newly Discovered Project Context ---');
      expect(result).toContain(jitContext);
      expect(result).toContain('--- End Project Context ---');
    });

    it('should place context after the original content', () => {
      const content = 'original output';
      const jitContext = 'context rules';

      const result = appendJitContext(content, jitContext);

      const contentIndex = result.indexOf(content);
      const contextIndex = result.indexOf(jitContext);
      expect(contentIndex).toBeLessThan(contextIndex);
    });
  });
});
