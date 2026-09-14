/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitIgnoreParser } from './gitIgnoreParser.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('GitIgnoreParser - Nested .gitignore Trailing-Slash Patterns', () => {
  let projectRoot: string;

  async function createTestFile(filePath: string, content = '') {
    const fullPath = path.join(projectRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return fullPath;
  }

  async function setupGitRepo() {
    await fs.mkdir(path.join(projectRoot, '.git'), { recursive: true });
  }

  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gitignore-trailing-slash-test-'),
    );
    try {
      projectRoot = await fs.realpath(tmpDir);
    } catch {
      projectRoot = tmpDir;
    }
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  describe('directory-only patterns with trailing slash in nested .gitignore', () => {
    it('should ignore build/ at any depth below the nested .gitignore (Scenario A)', async () => {
      await setupGitRepo();
      // pkg/.gitignore contains `build/` — per gitignore(5) this should
      // match a directory named `build` at any depth under pkg/.
      await createTestFile('pkg/.gitignore', 'build/\n');
      await createTestFile('pkg/build/out.js', 'compiled');
      await createTestFile('pkg/tools/build/out.js', 'also compiled');
      await createTestFile('pkg/src/nested/build/index.js', 'deeply nested');

      const parser = new GitIgnoreParser(projectRoot);

      // Direct child — always worked
      expect(parser.isIgnored('pkg/build', true)).toBe(true);
      expect(parser.isIgnored('pkg/build/out.js', false)).toBe(true);

      // Deeper nesting — this was the bug: returned false before the fix
      expect(parser.isIgnored('pkg/tools/build', true)).toBe(true);
      expect(parser.isIgnored('pkg/tools/build/out.js', false)).toBe(true);
      expect(parser.isIgnored('pkg/src/nested/build', true)).toBe(true);
      expect(parser.isIgnored('pkg/src/nested/build/index.js', false)).toBe(
        true,
      );
    });

    it('should ignore node_modules/ at any depth below the nested .gitignore (Scenario B)', async () => {
      await setupGitRepo();
      await createTestFile('packages/frontend/.gitignore', 'node_modules/\n');
      await createTestFile('packages/frontend/node_modules/react/index.js', '');
      await createTestFile(
        'packages/frontend/src/vendor/node_modules/lodash/index.js',
        '',
      );

      const parser = new GitIgnoreParser(projectRoot);

      expect(parser.isIgnored('packages/frontend/node_modules', true)).toBe(
        true,
      );
      expect(
        parser.isIgnored(
          'packages/frontend/node_modules/react/index.js',
          false,
        ),
      ).toBe(true);

      // Deeper node_modules should also be matched
      expect(
        parser.isIgnored('packages/frontend/src/vendor/node_modules', true),
      ).toBe(true);
      expect(
        parser.isIgnored(
          'packages/frontend/src/vendor/node_modules/lodash/index.js',
          false,
        ),
      ).toBe(true);
    });

    it('should NOT match a file with the same name when the pattern has a trailing slash (Scenario C)', async () => {
      await setupGitRepo();
      // `dist/` should only match directories, not a file literally named `dist`
      await createTestFile('lib/.gitignore', 'dist/\n');
      await createTestFile('lib/dist', 'this is a file named dist');

      const parser = new GitIgnoreParser(projectRoot);

      // File named `dist` — must NOT be ignored (trailing slash = directory only)
      expect(parser.isIgnored('lib/dist', false)).toBe(false);

      // Directory named `dist` — must be ignored
      expect(parser.isIgnored('lib/dist', true)).toBe(true);
    });

    it('should still anchor patterns that have a slash in the middle (Scenario D)', async () => {
      await setupGitRepo();
      // `src/build` has a content slash — must be anchored to src/build
      // relative to the .gitignore location
      await createTestFile('pkg/.gitignore', 'src/build\n');
      await createTestFile('pkg/src/build/out.js', 'expected to be ignored');
      await createTestFile(
        'pkg/other/src/build/out.js',
        'should NOT be ignored',
      );

      const parser = new GitIgnoreParser(projectRoot);

      // Direct match at the anchored location
      expect(parser.isIgnored('pkg/src/build/out.js', false)).toBe(true);

      // NOT matched at a different depth (pattern is anchored by the middle slash)
      expect(parser.isIgnored('pkg/other/src/build/out.js', false)).toBe(false);
    });

    it('should handle negated trailing-slash patterns in nested .gitignore (Scenario E)', async () => {
      await setupGitRepo();
      // First ignore all build/ directories, then un-ignore a specific one
      await createTestFile('project/.gitignore', 'build/\n!release/build/\n');
      await createTestFile('project/build/debug.js', '');
      await createTestFile('project/src/build/temp.js', '');

      const parser = new GitIgnoreParser(projectRoot);

      // build/ directories should be ignored
      expect(parser.isIgnored('project/build', true)).toBe(true);
      expect(parser.isIgnored('project/src/build', true)).toBe(true);
    });

    it('should handle multiple trailing-slash patterns in the same nested .gitignore (Scenario F)', async () => {
      await setupGitRepo();
      await createTestFile(
        'apps/web/.gitignore',
        'node_modules/\nbuild/\ndist/\n.cache/\n__pycache__/\n',
      );
      // Create files at various depths
      await createTestFile('apps/web/node_modules/pkg/index.js', '');
      await createTestFile('apps/web/src/lib/build/output.js', '');
      await createTestFile('apps/web/dist/bundle.js', '');
      await createTestFile('apps/web/tools/.cache/data.json', '');
      await createTestFile('apps/web/scripts/__pycache__/mod.pyc', '');

      const parser = new GitIgnoreParser(projectRoot);

      // All at depth 1 (direct children)
      expect(parser.isIgnored('apps/web/node_modules', true)).toBe(true);
      expect(parser.isIgnored('apps/web/dist', true)).toBe(true);

      // All at depth 2+ (nested deeper)
      expect(parser.isIgnored('apps/web/src/lib/build', true)).toBe(true);
      expect(parser.isIgnored('apps/web/src/lib/build/output.js', false)).toBe(
        true,
      );
      expect(parser.isIgnored('apps/web/tools/.cache', true)).toBe(true);
      expect(parser.isIgnored('apps/web/tools/.cache/data.json', false)).toBe(
        true,
      );
      expect(parser.isIgnored('apps/web/scripts/__pycache__', true)).toBe(true);
    });

    it('should not affect patterns in the root .gitignore (Scenario G)', async () => {
      await setupGitRepo();
      // Root .gitignore already works correctly — make sure we don't regress
      await createTestFile('.gitignore', 'build/\nnode_modules/\n');
      await createTestFile('build/out.js', '');
      await createTestFile('src/build/out.js', '');
      await createTestFile('node_modules/pkg/index.js', '');
      await createTestFile('deep/path/node_modules/pkg/index.js', '');

      const parser = new GitIgnoreParser(projectRoot);

      expect(parser.isIgnored('build', true)).toBe(true);
      expect(parser.isIgnored('src/build', true)).toBe(true);
      expect(parser.isIgnored('node_modules', true)).toBe(true);
      expect(parser.isIgnored('deep/path/node_modules', true)).toBe(true);
    });
  });

  describe('FileDiscoveryService integration with trailing-slash fix', () => {
    it('should filter out deeply nested build/ directories via filterFilesWithReport (Scenario H)', async () => {
      await setupGitRepo();
      await createTestFile('pkg/.gitignore', 'build/\n');
      await createTestFile('pkg/src/app.ts', 'source');
      await createTestFile('pkg/build/out.js', 'compiled');
      await createTestFile('pkg/tools/build/out.js', 'also compiled');
      await createTestFile('pkg/README.md', 'docs');

      const service = new FileDiscoveryService(projectRoot);

      const report = service.filterFilesWithReport([
        'pkg/src/app.ts',
        'pkg/build/out.js',
        'pkg/tools/build/out.js',
        'pkg/README.md',
      ]);

      expect(report.filteredPaths).toContain('pkg/src/app.ts');
      expect(report.filteredPaths).toContain('pkg/README.md');
      expect(report.filteredPaths).not.toContain('pkg/build/out.js');
      expect(report.filteredPaths).not.toContain('pkg/tools/build/out.js');
      expect(report.ignoredCount).toBe(2);
    });
  });
});
