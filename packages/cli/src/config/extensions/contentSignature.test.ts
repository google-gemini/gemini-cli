/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  collectContentEntries,
  compareCodeUnits,
  computeContentSignature,
  ContentMarker,
  escapeForDisplay,
  formatCodeSpan,
  formatValueForDisplay,
  sha256,
  type ContentEntry,
} from './contentSignature.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    readdir: vi.fn(actual.readdir),
  };
});

// Files are hashed through read streams.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createReadStream: vi.fn(actual.createReadStream),
  };
});

const isWindows = process.platform === 'win32';

describe('contentSignature', () => {
  let tempDir: string;
  let rootDir: string;
  let outsideDir: string;

  function writeFile(relativePath: string, content: string | Buffer): void {
    const filePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function link(target: string, relativePath: string): void {
    const linkPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(target, linkPath);
  }

  /**
   * Paths passed to `readFile`, `readdir`, and `createReadStream` since the
   * test started.
   */
  function readPaths(): string[] {
    return [
      ...vi.mocked(fsPromises.readFile).mock.calls,
      ...vi.mocked(fsPromises.readdir).mock.calls,
      ...vi.mocked(fs.createReadStream).mock.calls,
    ].map(([target]) => String(target));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // The native realpath expands the 8.3 short form of the temp folder on
    // Windows (C:\Users\RUNNER~1\...) like `collectContentEntries` does, so
    // the paths that the tests compare have the same form.
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'content-signature-')),
    );
    rootDir = path.join(tempDir, 'extension');
    outsideDir = path.join(tempDir, 'outside');
    fs.mkdirSync(rootDir);
    fs.mkdirSync(outsideDir);
    fs.writeFileSync(path.join(outsideDir, 'data.txt'), 'outside data');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('collectContentEntries', () => {
    it('lists every file of a folder with POSIX paths and SHA-256 hashes', async () => {
      writeFile('hooks/hooks.json', '{}');
      writeFile('hooks/scripts/nested/run.sh', 'echo run');

      expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
        { path: 'hooks/hooks.json', type: 'file', value: sha256('{}') },
        {
          path: 'hooks/scripts/nested/run.sh',
          type: 'file',
          value: sha256('echo run'),
        },
      ]);
    });

    it('lists a single file', async () => {
      writeFile('scripts/on-start.js', 'start');

      expect(
        await collectContentEntries(rootDir, 'scripts/on-start.js'),
      ).toEqual([
        { path: 'scripts/on-start.js', type: 'file', value: sha256('start') },
      ]);
    });

    it('returns undefined for a missing path or folder', async () => {
      expect(await collectContentEntries(rootDir, 'hooks')).toBeUndefined();
      expect(
        await collectContentEntries(path.join(tempDir, 'missing'), 'hooks'),
      ).toBeUndefined();
    });

    it('hashes binary and malformed files as raw bytes', async () => {
      const binary = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x0a]);
      writeFile('hooks/blob.bin', binary);
      writeFile('hooks/hooks.json', '{"hooks": ');

      expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
        { path: 'hooks/blob.bin', type: 'file', value: sha256(binary) },
        {
          path: 'hooks/hooks.json',
          type: 'file',
          value: sha256('{"hooks": '),
        },
      ]);
    });

    it('hashes a file that takes many read chunks, through a stream', async () => {
      const large = Buffer.alloc(1024 * 1024 + 7);
      for (let i = 0; i < large.length; i++) {
        large[i] = (i * 31) % 251;
      }
      writeFile('assets/large.bin', large);

      expect(await collectContentEntries(rootDir, 'assets')).toEqual([
        { path: 'assets/large.bin', type: 'file', value: sha256(large) },
      ]);
      expect(readPaths()).toContain(path.join(rootDir, 'assets', 'large.bin'));
    });

    it('returns the same entries for identical folders in different places', async () => {
      const otherRoot = path.join(tempDir, 'elsewhere', 'copy');
      for (const root of [rootDir, otherRoot]) {
        fs.mkdirSync(path.join(root, 'skills', 'demo'), { recursive: true });
        fs.writeFileSync(path.join(root, 'skills', 'demo', 'SKILL.md'), 'body');
        fs.writeFileSync(path.join(root, 'skills', 'demo', 'notes.md'), 'n');
      }

      const first = (await collectContentEntries(rootDir, 'skills')) ?? [];
      const second = (await collectContentEntries(otherRoot, 'skills')) ?? [];

      expect(first).toHaveLength(2);
      expect(second).toEqual(first);
      expect(computeContentSignature(second)).toBe(
        computeContentSignature(first),
      );
    });

    it.skipIf(isWindows)(
      'follows links that stay inside the extension folder',
      async () => {
        writeFile('shared/run.sh', 'echo shared');
        writeFile('hooks/hooks.json', '{}');
        link('../shared/run.sh', 'hooks/run.sh');
        link('../shared', 'hooks/lib');

        expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
          { path: 'hooks/hooks.json', type: 'file', value: sha256('{}') },
          { path: 'hooks/lib', type: 'link', value: ContentMarker.Directory },
          {
            path: 'hooks/lib/run.sh',
            type: 'file',
            value: sha256('echo shared'),
          },
          { path: 'hooks/run.sh', type: 'link', value: sha256('echo shared') },
        ]);
      },
    );

    it.skipIf(isWindows)(
      'walks a starting path that is a link to a folder inside the extension',
      async () => {
        writeFile('shared-hooks/hooks.json', '{}');
        link('shared-hooks', 'hooks');

        expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
          { path: 'hooks', type: 'link', value: ContentMarker.Directory },
          { path: 'hooks/hooks.json', type: 'file', value: sha256('{}') },
        ]);
      },
    );

    it.skipIf(isWindows)(
      'records a marker for links that leave the extension folder without reading them',
      async () => {
        writeFile('hooks/hooks.json', '{}');
        link(path.join(outsideDir, 'data.txt'), 'hooks/absolute-link');
        link(outsideDir, 'hooks/folder-link');
        link('../../outside/data.txt', 'hooks/relative-link');

        expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
          {
            path: 'hooks/absolute-link',
            type: 'link',
            value: ContentMarker.Outside,
          },
          {
            path: 'hooks/folder-link',
            type: 'link',
            value: ContentMarker.Outside,
          },
          { path: 'hooks/hooks.json', type: 'file', value: sha256('{}') },
          {
            path: 'hooks/relative-link',
            type: 'link',
            value: ContentMarker.Outside,
          },
        ]);
        expect(readPaths().filter((p) => p.startsWith(outsideDir))).toEqual([]);
      },
    );

    it.skipIf(isWindows)(
      'does not read a file reached through a folder link that leaves the extension folder',
      async () => {
        link(outsideDir, 'scripts');

        expect(
          await collectContentEntries(rootDir, 'scripts/data.txt'),
        ).toEqual([
          {
            path: 'scripts/data.txt',
            type: 'file',
            value: ContentMarker.Outside,
          },
        ]);
        expect(readPaths().filter((p) => p.startsWith(outsideDir))).toEqual([]);
      },
    );

    it.skipIf(isWindows)('records a marker for dangling links', async () => {
      writeFile('hooks/hooks.json', '{}');
      link('missing.txt', 'hooks/broken');

      expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
        { path: 'hooks/broken', type: 'link', value: ContentMarker.Dangling },
        { path: 'hooks/hooks.json', type: 'file', value: sha256('{}') },
      ]);
    });

    it.skipIf(isWindows)(
      'stops at link loops and links to parent folders',
      async () => {
        writeFile('hooks/hooks.json', '{}');
        writeFile('hooks/a/file.txt', 'a');
        link('..', 'hooks/a/up');
        link('..', 'hooks/parent');
        link('.', 'hooks/self');

        expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
          { path: 'hooks/a/file.txt', type: 'file', value: sha256('a') },
          { path: 'hooks/a/up', type: 'link', value: ContentMarker.Visited },
          { path: 'hooks/hooks.json', type: 'file', value: sha256('{}') },
          { path: 'hooks/parent', type: 'link', value: ContentMarker.Visited },
          { path: 'hooks/self', type: 'link', value: ContentMarker.Visited },
        ]);
      },
    );

    it.skipIf(isWindows)(
      'records a marker for special files without reading them',
      async () => {
        writeFile('hooks/hooks.json', '{}');
        const pipePath = path.join(rootDir, 'hooks', 'pipe');
        execFileSync('mkfifo', [pipePath]);

        expect(await collectContentEntries(rootDir, 'hooks')).toEqual([
          { path: 'hooks/hooks.json', type: 'file', value: sha256('{}') },
          {
            path: 'hooks/pipe',
            type: 'other',
            value: ContentMarker.Unsupported,
          },
        ]);
        expect(readPaths()).not.toContain(pipePath);
      },
    );
  });

  describe('computeContentSignature', () => {
    const first: ContentEntry = {
      path: 'hooks/b',
      type: 'file',
      value: sha256('b'),
    };
    const second: ContentEntry = {
      path: 'hooks/B',
      type: 'link',
      value: ContentMarker.Outside,
    };

    it('hashes the unique entry lines sorted by UTF-16 code units', () => {
      expect(computeContentSignature([first, second, first])).toBe(
        sha256(`hooks/B\0link\0outside\nhooks/b\0file\0${sha256('b')}`),
      );
    });

    it('does not depend on the order of the entries', () => {
      expect(computeContentSignature([first, second])).toBe(
        computeContentSignature([second, first]),
      );
    });

    it('changes when a value changes', () => {
      expect(computeContentSignature([first])).not.toBe(
        computeContentSignature([{ ...first, value: sha256('c') }]),
      );
    });
  });

  describe('compareCodeUnits', () => {
    it('orders strings by UTF-16 code units, not by locale', () => {
      expect(
        ['b', 'é', 'B', '_', 'a', '\u{1F600}', '\uFFFD'].sort(compareCodeUnits),
      ).toEqual(['B', '_', 'a', 'b', 'é', '\u{1F600}', '\uFFFD']);
    });
  });

  describe('escapeForDisplay', () => {
    it.each([
      ['a carriage return', 'a\rb', 'a\\rb'],
      ['a line feed', 'a\nb', 'a\\nb'],
      ['a tab', 'a\tb', 'a\\tb'],
      ['an ANSI sequence', '\u001b[31mred', '\\u001b[31mred'],
      ['a bell', 'a\u0007', 'a\\u0007'],
      ['a delete', 'a\u007f', 'a\\u007f'],
      ['a C1 control', 'a\u009bb', 'a\\u009bb'],
      ['a right-to-left override', 'a\u202eb', 'a\\u202eb'],
      ['a directional isolate', 'a\u2066b', 'a\\u2066b'],
      ['a zero-width space', 'a\u200bb', 'a\\u200bb'],
      ['a line separator', 'a\u2028b', 'a\\u2028b'],
      ['a byte order mark', '\ufeffa', '\\ufeffa'],
    ])('escapes %s', (_name, input, expected) => {
      expect(escapeForDisplay(input)).toBe(expected);
    });

    it('keeps printable text unchanged', () => {
      const value = 'node ${extensionPath}/run.js --name="café" 😀 *a* _b_';
      expect(escapeForDisplay(value)).toBe(value);
    });

    it('prints other JSON types the way a template string does, and null or undefined as empty', () => {
      expect(escapeForDisplay(3)).toBe('3');
      expect(escapeForDisplay(false)).toBe('false');
      expect(escapeForDisplay(['a', 'b\nc'])).toBe('a,b\\nc');
      expect(escapeForDisplay(null)).toBe('');
      expect(escapeForDisplay(undefined)).toBe('');
    });
  });

  describe('formatCodeSpan', () => {
    it.each([
      ['plain text', 'echo hi', '`echo hi`'],
      ['a backtick inside', 'a`b', '``a`b``'],
      ['a run of backticks inside', 'a``b', '```a``b```'],
      ['a trailing backtick', 'echo `id`', '`` echo `id` ``'],
      ['a leading backtick', '`start', '`` `start ``'],
      ['spaces on both sides', ' padded ', '`  padded  `'],
      ['only spaces', '   ', '`   `'],
      ['an empty value', '', '``'],
    ])('formats a value with %s', (_name, input, expected) => {
      expect(formatCodeSpan(input)).toBe(expected);
    });
  });

  describe('formatValueForDisplay', () => {
    it('escapes the value before wrapping it in a code span', () => {
      expect(formatValueForDisplay('echo `a`\n\u001b[2J')).toBe(
        '``echo `a`\\n\\u001b[2J``',
      );
    });
  });
});
