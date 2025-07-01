/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextDetectorImpl } from './ContextDetector.js';
import { isGitRepository } from '../utils/gitUtils.js';

// Mock the git utils module
vi.mock('../utils/gitUtils', () => ({
  isGitRepository: vi.fn(),
}));

describe('ContextDetector', () => {
  let contextDetector: ContextDetectorImpl;

  beforeEach(() => {
    contextDetector = new ContextDetectorImpl();
    vi.clearAllMocks();
    contextDetector.clearCache();
    // Clear environment variables that might affect detection
    delete process.env.DEBUG;
    delete process.env.DEV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectTaskContext', () => {
    it('should detect basic context with defaults', () => {
      delete process.env.SANDBOX;
      vi.mocked(isGitRepository).mockReturnValue(false);

      const context = contextDetector.detectTaskContext();

      expect(context).toEqual({
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        sandboxType: 'none',
        hasUserMemory: false,
        contextFlags: {},
        tokenBudget: 1500,
        environmentContext: expect.objectContaining({
          SANDBOX: undefined,
        }),
      });
    });

    it('should detect git repository context', () => {
      delete process.env.SANDBOX;
      vi.mocked(isGitRepository).mockReturnValue(true);

      const context = contextDetector.detectTaskContext();

      expect(context.hasGitRepo).toBe(true);
      expect(context.contextFlags.requiresGitWorkflow).toBe(true);
    });

    it('should detect sandbox-exec environment', () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.mocked(isGitRepository).mockReturnValue(false);

      const context = contextDetector.detectTaskContext();

      expect(context.sandboxMode).toBe(true);
      expect(context.sandboxType).toBe('sandbox-exec');
      expect(context.contextFlags.requiresSecurityGuidance).toBe(true);
    });

    it('should detect generic sandbox environment', () => {
      vi.stubEnv('SANDBOX', 'true');
      vi.mocked(isGitRepository).mockReturnValue(false);

      const context = contextDetector.detectTaskContext();

      expect(context.sandboxMode).toBe(true);
      expect(context.sandboxType).toBe('generic');
      expect(context.contextFlags.requiresSecurityGuidance).toBe(true);
    });

    it('should detect debug task type from environment', () => {
      vi.stubEnv('DEBUG', '1');
      vi.mocked(isGitRepository).mockReturnValue(false);

      const context = contextDetector.detectTaskContext();

      expect(context.taskType).toBe('debug');
      expect(context.contextFlags.requiresDebuggingGuidance).toBe(true);
    });

    it('should accept and apply overrides', () => {
      delete process.env.SANDBOX;
      vi.mocked(isGitRepository).mockReturnValue(false);

      const context = contextDetector.detectTaskContext({
        taskType: 'refactor',
        tokenBudget: 2000,
      });

      expect(context.taskType).toBe('refactor');
      expect(context.tokenBudget).toBe(2000);
      expect(context.contextFlags.requiresRefactoringGuidance).toBe(true);
    });

    it('should cache context when no overrides provided', () => {
      delete process.env.SANDBOX;
      vi.mocked(isGitRepository).mockReturnValue(false);

      const context1 = contextDetector.detectTaskContext();
      const context2 = contextDetector.detectTaskContext();

      expect(context1).toBe(context2); // Should be the same object (cached)
      expect(vi.mocked(isGitRepository)).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should not cache when overrides are provided', () => {
      delete process.env.SANDBOX;
      vi.mocked(isGitRepository).mockReturnValue(false);

      const context1 = contextDetector.detectTaskContext();
      const context2 = contextDetector.detectTaskContext({ taskType: 'debug' });

      expect(context1).not.toBe(context2); // Should be different objects
      expect(context1.taskType).toBe('general');
      expect(context2.taskType).toBe('debug');
    });
  });

  describe('detectGitRepository', () => {
    it('should return true when git repository is detected', () => {
      vi.mocked(isGitRepository).mockReturnValue(true);

      const result = contextDetector.detectGitRepository();

      expect(result).toBe(true);
      expect(vi.mocked(isGitRepository)).toHaveBeenCalledWith(process.cwd());
    });

    it('should return false when git repository is not detected', () => {
      vi.mocked(isGitRepository).mockReturnValue(false);

      const result = contextDetector.detectGitRepository();

      expect(result).toBe(false);
    });

    it('should return false when git utils throw an error', () => {
      vi.mocked(isGitRepository).mockImplementation(() => {
        throw new Error('Git error');
      });

      const result = contextDetector.detectGitRepository();

      expect(result).toBe(false);
    });
  });

  describe('detectSandboxMode', () => {
    it('should detect no sandbox when SANDBOX is not set', () => {
      delete process.env.SANDBOX;

      const result = contextDetector.detectSandboxMode();

      expect(result).toEqual({
        sandboxMode: false,
        sandboxType: 'none',
      });
    });

    it('should detect sandbox-exec when SANDBOX is "sandbox-exec"', () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');

      const result = contextDetector.detectSandboxMode();

      expect(result).toEqual({
        sandboxMode: true,
        sandboxType: 'sandbox-exec',
      });
    });

    it('should detect generic sandbox for other SANDBOX values', () => {
      vi.stubEnv('SANDBOX', 'docker');

      const result = contextDetector.detectSandboxMode();

      expect(result).toEqual({
        sandboxMode: true,
        sandboxType: 'generic',
      });
    });
  });

  describe('analyzeEnvironment', () => {
    it('should capture relevant environment variables', () => {
      vi.stubEnv('SANDBOX', 'test');
      vi.stubEnv('DEBUG', '1');
      vi.stubEnv('NODE_ENV', 'development');

      const result = contextDetector.analyzeEnvironment();

      expect(result).toEqual(
        expect.objectContaining({
          SANDBOX: 'test',
          DEBUG: '1',
          NODE_ENV: 'development',
          PWD: expect.any(String),
        }),
      );
    });
  });

  describe('clearCache', () => {
    it('should clear the cached context', () => {
      delete process.env.SANDBOX;
      vi.mocked(isGitRepository).mockReturnValue(false);

      // First call creates cache
      contextDetector.detectTaskContext();
      expect(vi.mocked(isGitRepository)).toHaveBeenCalledTimes(1);

      // Second call uses cache
      contextDetector.detectTaskContext();
      expect(vi.mocked(isGitRepository)).toHaveBeenCalledTimes(1);

      // Clear cache
      contextDetector.clearCache();

      // Third call creates new cache
      contextDetector.detectTaskContext();
      expect(vi.mocked(isGitRepository)).toHaveBeenCalledTimes(2);
    });
  });
});
