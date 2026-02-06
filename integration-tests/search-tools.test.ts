/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { GrepTool } from '../packages/core/src/tools/grep.js';
import { RipGrepTool } from '../packages/core/src/tools/ripGrep.js';
import { Config } from '../packages/core/src/config/config.js';
import { WorkspaceContext } from '../packages/core/src/utils/workspaceContext.js';

// Mock Config to provide necessary context for both GrepTool and RipGrepTool
class MockConfig {
  constructor(private targetDir: string) {}

  getTargetDir() {
    return this.targetDir;
  }

  getWorkspaceContext() {
    return new WorkspaceContext(this.targetDir, [this.targetDir]);
  }

  getDebugMode() {
    return true;
  }

  getFileFilteringRespectGeminiIgnore() {
    return true;
  }

  getFileFilteringOptions() {
    return {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
      customIgnoreFilePaths: [],
    };
  }

  getFileExclusions() {
    return {
      getGlobExcludes: () => [],
    };
  }

  validatePathAccess() {
    return null;
  }
}

describe('Search Tools Integration', () => {
  describe('RipGrepTool', () => {
    let tempDir: string;
    let tool: RipGrepTool;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-test-'));

      // Create test files
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'hello world\n');
      await fs.mkdir(path.join(tempDir, 'subdir'));
      await fs.writeFile(
        path.join(tempDir, 'subdir', 'file2.txt'),
        'hello universe\n',
      );
      await fs.writeFile(path.join(tempDir, 'file3.txt'), 'goodbye moon\n');
      await fs.writeFile(
        path.join(tempDir, 'script.js'),
        'console.log("hello");\n',
      );

      // Create a file with multiple matches for limits testing
      const manyMatches = `
        match 1
        filler
        match 2
        filler
        match 3
        filler
        match 4
        match 5
      `;
      await fs.writeFile(path.join(tempDir, 'many_matches.txt'), manyMatches);

      const config = new MockConfig(tempDir) as unknown as Config;
      tool = new RipGrepTool(config);
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('Basic Functionality', () => {
      it('should find matches using the real ripgrep binary', async () => {
        const invocation = tool.build({ pattern: 'hello' });
        const result = await invocation.execute(new AbortController().signal);

        expect(result.llmContent).toContain('Found 3 matches'); // file1, file2, script.js
        expect(result.llmContent).toContain('file1.txt');
        expect(result.llmContent).toContain('L1: hello world');
        expect(result.llmContent).toContain('subdir');
        expect(result.llmContent).toContain('file2.txt');
        expect(result.llmContent).toContain('L1: hello universe');
        expect(result.llmContent).not.toContain('goodbye moon');
      });

      it('should handle no matches correctly', async () => {
        const invocation = tool.build({ pattern: 'nonexistent_pattern_123' });
        const result = await invocation.execute(new AbortController().signal);

        expect(result.llmContent).toContain('No matches found');
      });

      it('should respect include filters', async () => {
        const invocation = tool.build({ pattern: 'hello', include: '*.js' });
        const result = await invocation.execute(new AbortController().signal);

        expect(result.llmContent).toContain('Found 1 match');
        expect(result.llmContent).toContain('script.js');
        expect(result.llmContent).not.toContain('file1.txt');
      });

      it('should return context lines when requested', async () => {
        const invocation = tool.build({ pattern: 'match 1', context: 1 });
        const result = await invocation.execute(new AbortController().signal);

        expect(result.llmContent).toContain('match 1');
        expect(result.llmContent).toContain('filler'); // Context line
      });
    });

    describe('Limits', () => {
      it('should limit matches per file when max_matches_per_file is set', async () => {
        const invocation = tool.build({
          pattern: 'match',
          max_matches_per_file: 2,
        });
        const result = await invocation.execute(new AbortController().signal);

        expect(result.llmContent).toContain('Found 2 matches');
        expect(result.llmContent).toContain('many_matches.txt');
        expect(result.llmContent).toContain('match 1');
        expect(result.llmContent).toContain('match 2');
        expect(result.llmContent).not.toContain('match 3');
        expect(result.llmContent).not.toContain('match 4');
      });

      it('should return all matches when max_matches_per_file is not set', async () => {
        // We test this on a file that has more matches than the previous limit
        const invocation = tool.build({ pattern: 'match' });
        const result = await invocation.execute(new AbortController().signal);

        expect(result.llmContent).toContain('match 1');
        expect(result.llmContent).toContain('match 2');
        expect(result.llmContent).toContain('match 3');
        expect(result.llmContent).toContain('match 4');
        expect(result.llmContent).toContain('match 5');
      });

      it('should limit total matches when total_max_matches is set', async () => {
        const invocation = tool.build({
          pattern: 'match',
          total_max_matches: 3,
        });
        const result = await invocation.execute(new AbortController().signal);

        expect(result.llmContent).toContain('Found 3 matches');
        expect(result.llmContent).toContain('match 1');
        expect(result.llmContent).toContain('match 2');
        expect(result.llmContent).toContain('match 3');
        expect(result.llmContent).not.toContain('match 4');
        expect(result.llmContent).not.toContain('match 5');
        expect(result.llmContent).toContain(
          '(results limited to 3 matches for performance)',
        );
      });

      it('should use default limit when total_max_matches is not set', async () => {
        const invocation = tool.build({ pattern: 'match' });
        const result = await invocation.execute(new AbortController().signal);

        // Just verify it found everything available (5 matches)
        expect(result.llmContent).toContain('Found 5 matches');
      });
    });
  });

  describe('GrepTool', () => {
    let tempDir: string;
    let tool: GrepTool;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-test-'));

      // Create a test file with multiple matches
      const content = `
        match 1
        match 2
        match 3
        match 4
        match 5
      `;
      await fs.writeFile(path.join(tempDir, 'many_matches.txt'), content);

      const config = new MockConfig(tempDir) as unknown as Config;
      tool = new GrepTool(config, null!);
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should limit total matches when total_max_matches is set', async () => {
      const invocation = tool.build({
        pattern: 'match',
        total_max_matches: 3,
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Found 3 matches');
      expect(result.llmContent).toContain('match 1');
      expect(result.llmContent).toContain('match 2');
      expect(result.llmContent).toContain('match 3');
      expect(result.llmContent).not.toContain('match 4');
      expect(result.llmContent).not.toContain('match 5');
      expect(result.llmContent).toContain(
        '(results limited to 3 matches for performance)',
      );
    });
  });
});
