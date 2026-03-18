/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryManagerAgent } from './memory-manager-agent.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ASK_USER_TOOL_NAME,
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { Storage } from '../config/storage.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('MemoryManagerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct name "save_memory"', () => {
    const agent = MemoryManagerAgent();
    expect(agent.name).toBe('save_memory');
  });

  it('should be a local agent', () => {
    const agent = MemoryManagerAgent();
    expect(agent.kind).toBe('local');
  });

  it('should have a description', () => {
    const agent = MemoryManagerAgent();
    expect(agent.description).toBeTruthy();
    expect(agent.description).toContain('memory');
  });

  it('should have a system prompt with memory management instructions', () => {
    const agent = MemoryManagerAgent();
    const prompt = agent.promptConfig.systemPrompt;
    const globalGeminiDir = Storage.getGlobalGeminiDir();
    expect(prompt).toContain(`Global (${globalGeminiDir})`);
    expect(prompt).toContain('Project (.gemini/)');
    expect(prompt).toContain('Table of Contents');
    expect(prompt).toContain('De-duplicating');
    expect(prompt).toContain('Adding');
    expect(prompt).toContain('Removing stale');
    expect(prompt).toContain('Organizing');
    expect(prompt).toContain('Routing');
  });

  it('should have efficiency guidelines in the system prompt', () => {
    const agent = MemoryManagerAgent();
    const prompt = agent.promptConfig.systemPrompt;
    expect(prompt).toContain('Efficiency & Performance');
    expect(prompt).toContain('Use as few turns as possible');
    expect(prompt).toContain('Do not perform any exploration');
    expect(prompt).toContain('Minimize file system operations');
    expect(prompt).toContain('Context Awareness');
  });

  it('should inject GEMINI.md files from global and project root into initial context', () => {
    const globalDir = Storage.getGlobalGeminiDir();
    const projectRoot = '/test/project';
    const globalFile = path.join(globalDir, 'GEMINI.md');
    const projectFile = path.join(projectRoot, '.gemini', 'GEMINI.md');

    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (typeof p === 'string' && (p === globalFile || p === projectFile))
        return true;
      return false;
    });

    vi.mocked(fs.statSync).mockImplementation((p: fs.PathLike) => {
      if (typeof p === 'string' && (p === globalFile || p === projectFile)) {
         
        return { isFile: () => true } as fs.Stats;
      }
       
      return { isFile: () => false } as fs.Stats;
    });

    vi.mocked(fs.readFileSync).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === globalFile) return 'global context';
        if (p === projectFile) return 'project context';
        return '';
      },
    );

    const agent = MemoryManagerAgent(projectRoot);
    const prompt = agent.promptConfig.systemPrompt;

    expect(prompt).toContain('# Initial Context');
    expect(prompt).toContain(`## File: ${globalFile}`);
    expect(prompt).toContain('global context');
    expect(prompt).toContain(`## File: ${projectFile}`);
    expect(prompt).toContain('project context');
  });

  it('should inject GEMINI.md files along the CWD up to project root', () => {
    const projectRoot = '/test/project';
    const cwd = '/test/project/src/module';
    const srcFile = path.join('/test/project/src', 'GEMINI.md');
    const moduleFile = path.join('/test/project/src/module', 'GEMINI.md');

    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      if (typeof p === 'string' && (p === srcFile || p === moduleFile))
        return true;
      return false;
    });

    vi.mocked(fs.statSync).mockImplementation((p: fs.PathLike) => {
      if (typeof p === 'string' && (p === srcFile || p === moduleFile)) {
         
        return { isFile: () => true } as fs.Stats;
      }
       
      return { isFile: () => false } as fs.Stats;
    });

    vi.mocked(fs.readFileSync).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p === srcFile) return 'src context';
        if (p === moduleFile) return 'module context';
        return '';
      },
    );

    const agent = MemoryManagerAgent(projectRoot);
    const prompt = agent.promptConfig.systemPrompt;

    expect(prompt).toContain('# Initial Context');
    expect(prompt).toContain(`## File: ${srcFile}`);
    expect(prompt).toContain('src context');
    expect(prompt).toContain(`## File: ${moduleFile}`);
    expect(prompt).toContain('module context');
  });

  it('should have file-management and search tools', () => {
    const agent = MemoryManagerAgent();
    expect(agent.toolConfig).toBeDefined();
    expect(agent.toolConfig!.tools).toEqual(
      expect.arrayContaining([
        READ_FILE_TOOL_NAME,
        EDIT_TOOL_NAME,
        WRITE_FILE_TOOL_NAME,
        LS_TOOL_NAME,
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
        ASK_USER_TOOL_NAME,
      ]),
    );
  });

  it('should require a "request" input parameter', () => {
    const agent = MemoryManagerAgent();
    const schema = agent.inputConfig.inputSchema as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(schema['properties']).toHaveProperty('request');
    expect(schema['required']).toContain('request');
  });

  it('should inherit the model from the parent agent', () => {
    const agent = MemoryManagerAgent();
    expect(agent.modelConfig.model).toBe('inherit');
  });
});
