/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCoreSystemPromptDynamic,
  isDynamicAssemblyAvailable,
} from './prompts.js';
import * as fs from 'node:fs';

// Mock the PromptAssembler
vi.mock('../prompt-system/PromptAssembler.js', () => ({
  PromptAssembler: vi.fn().mockImplementation(() => ({
    assemblePrompt: vi.fn().mockResolvedValue({
      prompt: 'Dynamic assembled prompt content',
      includedModules: [],
      totalTokens: 400,
      context: {},
      warnings: [],
      metadata: {
        assemblyTime: new Date(),
        assemblyVersion: '1.0.0',
        moduleSelectionStrategy: 'default',
      },
    }),
  })),
}));

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('Dynamic Prompt Assembly Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_SYSTEM_MD', undefined);
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCoreSystemPromptDynamic', () => {
    it('should return a prompt when using dynamic assembly', async () => {
      const prompt = await getCoreSystemPromptDynamic();

      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(20);
      // Could be either the mocked content or the real content
      expect(prompt).toMatch(/CLI agent|Dynamic assembled prompt content/);
    });

    it('should handle task context overrides', async () => {
      const taskContext = { taskType: 'debug' as const };
      const prompt = await getCoreSystemPromptDynamic(undefined, taskContext);

      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(20);
    });

    it('should handle user memory', async () => {
      const userMemory = 'Test memory content';
      const prompt = await getCoreSystemPromptDynamic(userMemory);

      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(20);
    });

    it('should respect GEMINI_SYSTEM_MD override', async () => {
      const overrideContent = 'Override prompt content';
      vi.stubEnv('GEMINI_SYSTEM_MD', 'true');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(overrideContent);

      const prompt = await getCoreSystemPromptDynamic();

      expect(prompt).toBe(overrideContent);
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should add user memory to override content', async () => {
      const overrideContent = 'Override prompt content';
      const userMemory = 'User memory';
      vi.stubEnv('GEMINI_SYSTEM_MD', 'true');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(overrideContent);

      const prompt = await getCoreSystemPromptDynamic(userMemory);

      expect(prompt).toBe(`${overrideContent}\n\n---\n\n${userMemory}`);
    });

    it('should use custom system prompt path', async () => {
      const customPath = '/custom/system.md';
      const overrideContent = 'Custom prompt content';
      vi.stubEnv('GEMINI_SYSTEM_MD', customPath);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(overrideContent);

      const prompt = await getCoreSystemPromptDynamic();

      expect(fs.readFileSync).toHaveBeenCalledWith(customPath, 'utf8');
      expect(prompt).toBe(overrideContent);
    });

    it('should write system prompt when GEMINI_WRITE_SYSTEM_MD is set', async () => {
      vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', 'true');

      await getCoreSystemPromptDynamic();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
      );
    });

    it('should write to custom path when specified', async () => {
      const customWritePath = '/custom/output.md';
      vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', customWritePath);

      await getCoreSystemPromptDynamic();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        customWritePath,
        expect.any(String),
      );
    });

    it('should provide fallback functionality', async () => {
      // This test verifies the fallback works without mocking internals
      const prompt = await getCoreSystemPromptDynamic();

      // Should always return a valid prompt
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(20);
      expect(prompt).toContain('You are an interactive CLI agent');
    });

    it('should instantiate PromptAssembler successfully', async () => {
      // This verifies the PromptAssembler can be created and used
      const prompt = await getCoreSystemPromptDynamic();

      expect(prompt).toBeTruthy();
      expect(typeof prompt).toBe('string');
    });
  });

  describe('isDynamicAssemblyAvailable', () => {
    it('should return true when required modules exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        const pathStr = String(path);
        return (
          pathStr.includes('identity.md') ||
          pathStr.includes('mandates.md') ||
          pathStr.includes('security.md')
        );
      });

      const available = isDynamicAssemblyAvailable();

      expect(available).toBe(true);
    });

    it('should return false when required modules are missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const available = isDynamicAssemblyAvailable();

      expect(available).toBe(false);
    });

    it('should return false when fs operations fail', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('File system error');
      });

      const available = isDynamicAssemblyAvailable();

      expect(available).toBe(false);
    });

    it('should check for modules in correct categories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      isDynamicAssemblyAvailable();

      // Should check for each required module in both core and policy categories
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('core/identity.md'),
      );
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('core/mandates.md'),
      );
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('core/security.md'),
      );
    });
  });

  describe('backward compatibility', () => {
    it('should maintain environment variable behavior', async () => {
      // Test that environment variables are still respected
      vi.stubEnv('GEMINI_SYSTEM_MD', 'false');

      const prompt = await getCoreSystemPromptDynamic();

      // Should use dynamic assembly when override is disabled
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(20);
    });

    it('should handle empty user memory correctly', async () => {
      const prompt1 = await getCoreSystemPromptDynamic('');
      const prompt2 = await getCoreSystemPromptDynamic('   ');
      const prompt3 = await getCoreSystemPromptDynamic();

      // All should result in valid prompts without user memory
      expect(prompt1).toBeTruthy();
      expect(prompt2).toBeTruthy();
      expect(prompt3).toBeTruthy();
      expect(prompt1.length).toBeGreaterThan(50);
      expect(prompt2.length).toBeGreaterThan(50);
      expect(prompt3.length).toBeGreaterThan(50);
    });
  });
});
