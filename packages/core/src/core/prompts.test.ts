/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCoreSystemPrompt, getCoreSystemPromptWithContext, clearWorkContextCache } from './prompts.js';
import { isGitRepository } from '../utils/gitUtils.js';
import { Config } from '../config/config.js';
import { WorkContextInfo } from '../utils/workContextDetector.js';

// Mock tool names if they are dynamically generated or complex
vi.mock('../tools/ls', () => ({ LSTool: { Name: 'list_directory' } }));
vi.mock('../tools/edit', () => ({ EditTool: { Name: 'replace' } }));
vi.mock('../tools/glob', () => ({ GlobTool: { Name: 'glob' } }));
vi.mock('../tools/grep', () => ({ GrepTool: { Name: 'search_file_content' } }));
vi.mock('../tools/read-file', () => ({ ReadFileTool: { Name: 'read_file' } }));
vi.mock('../tools/read-many-files', () => ({
  ReadManyFilesTool: { Name: 'read_many_files' },
}));
vi.mock('../tools/shell', () => ({
  ShellTool: { Name: 'run_shell_command' },
}));
vi.mock('../tools/write-file', () => ({
  WriteFileTool: { Name: 'write_file' },
}));
vi.mock('../utils/gitUtils', () => ({
  isGitRepository: vi.fn(),
}));

// Mock the work context detector
vi.mock('../utils/workContextDetector', () => ({
  detectWorkContext: vi.fn(),
  WorkContextInfo: {},
  CompletedToolCall: {},
}));

import { detectWorkContext } from '../utils/workContextDetector.js';

describe('Core System Prompt (prompts.ts)', () => {
  it('should return the base prompt when no userMemory is provided', () => {
    vi.stubEnv('SANDBOX', undefined);
    const prompt = getCoreSystemPrompt();
    expect(prompt).not.toContain('---\n\n'); // Separator should not be present
    expect(prompt).toContain('You are an interactive CLI agent'); // Check for core content
    expect(prompt).toMatchSnapshot(); // Use snapshot for base prompt structure
  });

  it('should return the base prompt when userMemory is empty string', () => {
    vi.stubEnv('SANDBOX', undefined);
    const prompt = getCoreSystemPrompt('');
    expect(prompt).not.toContain('---\n\n');
    expect(prompt).toContain('You are an interactive CLI agent');
    expect(prompt).toMatchSnapshot();
  });

  it('should return the base prompt when userMemory is whitespace only', () => {
    vi.stubEnv('SANDBOX', undefined);
    const prompt = getCoreSystemPrompt('   \n  \t ');
    expect(prompt).not.toContain('---\n\n');
    expect(prompt).toContain('You are an interactive CLI agent');
    expect(prompt).toMatchSnapshot();
  });

  it('should append userMemory with separator when provided', () => {
    vi.stubEnv('SANDBOX', undefined);
    const memory = 'This is custom user memory.\nBe extra polite.';
    const expectedSuffix = `\n\n---\n\n${memory}`;
    const prompt = getCoreSystemPrompt(memory);

    expect(prompt.endsWith(expectedSuffix)).toBe(true);
    expect(prompt).toContain('You are an interactive CLI agent'); // Ensure base prompt follows
    expect(prompt).toMatchSnapshot(); // Snapshot the combined prompt
  });

  it('should include sandbox-specific instructions when SANDBOX env var is set', () => {
    vi.stubEnv('SANDBOX', 'true'); // Generic sandbox value
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# Sandbox');
    expect(prompt).not.toContain('# MacOS Seatbelt');
    expect(prompt).not.toContain('# Outside of Sandbox');
    expect(prompt).toMatchSnapshot();
  });

  it('should include seatbelt-specific instructions when SANDBOX env var is "sandbox-exec"', () => {
    vi.stubEnv('SANDBOX', 'sandbox-exec');
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# MacOS Seatbelt');
    expect(prompt).not.toContain('# Sandbox');
    expect(prompt).not.toContain('# Outside of Sandbox');
    expect(prompt).toMatchSnapshot();
  });

  it('should include non-sandbox instructions when SANDBOX env var is not set', () => {
    vi.stubEnv('SANDBOX', undefined); // Ensure it's not set
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# Outside of Sandbox');
    expect(prompt).not.toContain('# Sandbox');
    expect(prompt).not.toContain('# MacOS Seatbelt');
    expect(prompt).toMatchSnapshot();
  });

  it('should include git instructions when in a git repo', () => {
    vi.stubEnv('SANDBOX', undefined);
    vi.mocked(isGitRepository).mockReturnValue(true);
    const prompt = getCoreSystemPrompt();
    expect(prompt).toContain('# Git Repository');
    expect(prompt).toMatchSnapshot();
  });

  it('should not include git instructions when not in a git repo', () => {
    vi.stubEnv('SANDBOX', undefined);
    vi.mocked(isGitRepository).mockReturnValue(false);
    const prompt = getCoreSystemPrompt();
    expect(prompt).not.toContain('# Git Repository');
    expect(prompt).toMatchSnapshot();
  });

  describe('Dynamic Prompt Features', () => {
    const mockConfig = {
      getDynamicPrompt: vi.fn(),
      getWorkingDir: vi.fn().mockReturnValue('/test/project'),
    } as unknown as Config;

    const mockWorkContext: WorkContextInfo = {
      projectType: { primary: 'web-application', confidence: 0.8, indicators: ['package.json', 'src/App.tsx'] },
      dominantLanguages: [{ language: 'TypeScript', percentage: 70, fileCount: 25 }],
      frameworks: [{ name: 'react', confidence: 0.9, indicators: ['react'], version: '18.0.0' }],
      gitState: { isRepository: true, currentBranch: 'feature/new-component', isDirty: false },
      toolUsagePatterns: [{ category: 'file-operations', count: 15, recentTools: ['read_file', 'edit'], percentage: 60 }],
      projectPath: '/test/project',
      detectedAt: new Date(),
      cacheKey: 'test-cache-key',
    };

    beforeEach(() => {
      clearWorkContextCache();
    });

    it('should not include dynamic sections when dynamicPrompt is disabled', () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(false);
      
      const prompt = getCoreSystemPrompt('test memory', { 
        config: mockConfig, 
        workContext: mockWorkContext 
      });
      
      expect(prompt).not.toContain('# Work Context Adaptations');
      expect(prompt).not.toContain('## Project Type: Web-application');
    });

    it('should include dynamic sections when dynamicPrompt is enabled and workContext is provided', () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      
      const prompt = getCoreSystemPrompt('test memory', { 
        config: mockConfig, 
        workContext: mockWorkContext 
      });
      
      expect(prompt).toContain('# Work Context Adaptations');
      expect(prompt).toContain('## Project Type: Web-application');
      expect(prompt).toContain('## Primary Language: TypeScript');
      expect(prompt).toContain('## Framework: react');
      expect(prompt).toContain('## Git Workflow');
      expect(prompt).toContain('## Tool Usage Focus: file-operations');
    });

    it('should not include dynamic sections when dynamicPrompt is enabled but no workContext provided', () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      
      const prompt = getCoreSystemPrompt('test memory', { 
        config: mockConfig 
      });
      
      expect(prompt).not.toContain('# Work Context Adaptations');
    });

    it('should include project-specific guidelines for web applications', () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      
      const prompt = getCoreSystemPrompt('', { 
        config: mockConfig, 
        workContext: mockWorkContext 
      });
      
      expect(prompt).toContain('UI/UX Focus');
      expect(prompt).toContain('State Management');
      expect(prompt).toContain('Performance');
    });

    it('should include language-specific best practices for TypeScript', () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      
      const prompt = getCoreSystemPrompt('', { 
        config: mockConfig, 
        workContext: mockWorkContext 
      });
      
      expect(prompt).toContain('Type Safety');
      expect(prompt).toContain('Interfaces');
      expect(prompt).toContain('Generics');
    });

    it('should include framework-specific instructions for React', () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      
      const prompt = getCoreSystemPrompt('', { 
        config: mockConfig, 
        workContext: mockWorkContext 
      });
      
      expect(prompt).toContain('Component Design');
      expect(prompt).toContain('functional components with hooks');
      expect(prompt).toContain('React Testing Library');
    });

    it('should include git workflow adaptations for feature branches', () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      
      const prompt = getCoreSystemPrompt('', { 
        config: mockConfig, 
        workContext: mockWorkContext 
      });
      
      expect(prompt).toContain('Incremental Development');
      expect(prompt).toContain('Add tests for new functionality');
    });

    it('should skip sections with low confidence scores', () => {
      const lowConfidenceContext: WorkContextInfo = {
        ...mockWorkContext,
        projectType: { primary: 'unknown', confidence: 0.2, indicators: [] },
        dominantLanguages: [{ language: 'TypeScript', percentage: 20, fileCount: 2 }], // Below 30% threshold
        frameworks: [{ name: 'react', confidence: 0.3, indicators: [] }], // Below 60% threshold
      };

      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      
      const prompt = getCoreSystemPrompt('', { 
        config: mockConfig, 
        workContext: lowConfidenceContext 
      });
      
      expect(prompt).not.toContain('## Project Type:');
      expect(prompt).not.toContain('## Primary Language:');
      expect(prompt).not.toContain('## Framework:');
    });
  });

  describe('Async Helper: getCoreSystemPromptWithContext', () => {
    const mockConfig = {
      getDynamicPrompt: vi.fn(),
      getWorkingDir: vi.fn().mockReturnValue('/test/project'),
    } as unknown as Config;

    beforeEach(() => {
      clearWorkContextCache();
      vi.mocked(detectWorkContext).mockClear();
    });

    it('should detect work context when dynamic prompts are enabled', async () => {
      const mockWorkContext: WorkContextInfo = {
        projectType: { primary: 'node-library', confidence: 0.9, indicators: ['package.json'] },
        dominantLanguages: [{ language: 'JavaScript', percentage: 80, fileCount: 30 }],
        frameworks: [{ name: 'express', confidence: 0.8, indicators: ['express'] }],
        gitState: { isRepository: true, currentBranch: 'main' },
        toolUsagePatterns: [],
        projectPath: '/test/project',
        detectedAt: new Date(),
        cacheKey: 'test-key',
      };

      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      vi.mocked(detectWorkContext).mockResolvedValue(mockWorkContext);

      const prompt = await getCoreSystemPromptWithContext('test memory', mockConfig, []);

      expect(detectWorkContext).toHaveBeenCalledWith('/test/project', []);
      expect(prompt).toContain('# Work Context Adaptations');
      expect(prompt).toContain('## Project Type: Node-library');
      expect(prompt).toContain('## Primary Language: JavaScript');
      expect(prompt).toContain('## Framework: express');
    });

    it('should return base prompt when dynamic prompts are disabled', async () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(false);

      const prompt = await getCoreSystemPromptWithContext('test memory', mockConfig, []);

      expect(detectWorkContext).not.toHaveBeenCalled();
      expect(prompt).not.toContain('# Work Context Adaptations');
    });

    it('should handle work context detection errors gracefully', async () => {
      vi.mocked(mockConfig.getDynamicPrompt).mockReturnValue(true);
      vi.mocked(detectWorkContext).mockRejectedValue(new Error('Detection failed'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const prompt = await getCoreSystemPromptWithContext('test memory', mockConfig, []);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to detect work context:',
        expect.any(Error)
      );
      expect(prompt).not.toContain('# Work Context Adaptations');

      consoleSpy.mockRestore();
    });
  });
});
