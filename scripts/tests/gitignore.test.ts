/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

/**
 * Uses `git check-ignore` against the repository's real .gitignore file to
 * determine whether a given (possibly non-existent) path would be ignored by
 * git. This avoids re-implementing gitignore semantics and instead validates
 * the actual root .gitignore configuration shipped with the repo.
 */
function isIgnored(pathToCheck: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', pathToCheck], {
      cwd: repoRoot,
    });
    return true;
  } catch (error: unknown) {
    const err = error as { status?: number };
    // `git check-ignore` exits with status 1 when the path is not ignored.
    if (err.status === 1) {
      return false;
    }
    throw error;
  }
}

describe('root .gitignore', () => {
  describe('.env* pattern', () => {
    it.each([
      '.env',
      '.env~',
      '.env.local',
      '.env.production',
      '.env.development.local',
      '.envrc',
    ])('ignores %s', (file) => {
      expect(isIgnored(file)).toBe(true);
    });

    it('ignores env-like files nested in subdirectories', () => {
      expect(isIgnored('packages/cli/.env.test')).toBe(true);
    });
  });

  describe('.ai* pattern', () => {
    it.each(['.ai', '.aiconfig', '.ai-notes.md', '.aider.tags.cache.v4'])(
      'ignores %s',
      (file) => {
        expect(isIgnored(file)).toBe(true);
      },
    );

    it('ignores .ai-prefixed files nested in subdirectories', () => {
      expect(isIgnored('packages/core/.aiconfig.json')).toBe(true);
    });
  });

  describe('unrelated files', () => {
    it.each(['src/index.ts', 'README.md', 'package.json', 'main.py'])(
      'does not ignore %s',
      (file) => {
        expect(isIgnored(file)).toBe(false);
      },
    );
  });
});