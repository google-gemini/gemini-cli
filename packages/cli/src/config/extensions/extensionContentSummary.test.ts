/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  computeContentSignature,
  ContentMarker,
  sha256,
  type ContentEntry,
} from './contentSignature.js';
import {
  buildExtensionContentSummary,
  findReferencedPaths,
} from './extensionContentSummary.js';

const isWindows = process.platform === 'win32';

function fileEntry(relativePath: string, content: string): ContentEntry {
  return { path: relativePath, type: 'file', value: sha256(content) };
}

function hooksFile(command: string, env?: Record<string, string>): string {
  return JSON.stringify({
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command, ...(env ? { env } : {}) }] },
      ],
    },
  });
}

describe('extensionContentSummary', () => {
  let tempDir: string;
  let rootDir: string;

  function writeFile(relativePath: string, content: string, root = rootDir) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  beforeEach(() => {
    tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'extension-content-summary-')),
    );
    rootDir = path.join(tempDir, 'extension');
    fs.mkdirSync(rootDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('findReferencedPaths', () => {
    it('finds the paths that follow ${extensionPath}', () => {
      expect(
        findReferencedPaths([
          'node ${extensionPath}/scripts/on-start.js --verbose',
          'python3 "${extensionPath}${/}tools${pathSeparator}run.py"',
          '--require=${extensionPath}\\lib\\preload.js',
          'node ${extensionPath}/scripts/on-start.js',
        ]),
      ).toEqual([
        { path: 'lib/preload.js' },
        { path: 'scripts/on-start.js' },
        { path: 'tools/run.py' },
      ]);
    });

    it('marks references to the folder itself and to paths outside it', () => {
      expect(
        findReferencedPaths([
          'cd ${extensionPath} && ls ${extensionPath}/',
          'cat ${extensionPath}/../other/file',
          'run ${extensionPath}-data/x',
        ]),
      ).toEqual([
        { path: '${extensionPath}-data/x', marker: ContentMarker.Outside },
        { path: '.', marker: ContentMarker.Root },
        { path: '../other/file', marker: ContentMarker.Outside },
      ]);
    });

    it('ignores values without ${extensionPath}', () => {
      expect(findReferencedPaths(['echo hi', '$HOME/run.sh'])).toEqual([]);
    });
  });

  describe('hooks', () => {
    it('is absent without hooks/hooks.json', async () => {
      writeFile('hooks/notes.txt', 'notes');

      expect(await buildExtensionContentSummary(rootDir)).toEqual({});
    });

    it('lists hooks by event name, in file order within an event', async () => {
      writeFile(
        'hooks/hooks.json',
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                hooks: [
                  { type: 'command', command: 'echo first' },
                  { type: 'command', command: 'echo second', name: 'second' },
                ],
              },
            ],
            BeforeTool: [
              {
                matcher: 'run_shell_command',
                hooks: [
                  {
                    type: 'command',
                    command: 'echo tool',
                    env: { ZED: 'z', ALPHA: 'a' },
                  },
                ],
              },
              'not an object',
              { hooks: 'not a list' },
            ],
            AfterAgent: [{ hooks: [{ type: 'runtime' }, 42] }],
          },
        }),
      );

      const summary = await buildExtensionContentSummary(rootDir);

      expect(summary.hooks?.hooks).toEqual([
        { eventName: 'AfterAgent', type: 'runtime', env: [] },
        {
          eventName: 'BeforeTool',
          matcher: 'run_shell_command',
          command: 'echo tool',
          env: [
            ['ALPHA', 'a'],
            ['ZED', 'z'],
          ],
        },
        { eventName: 'SessionStart', command: 'echo first', env: [] },
        {
          eventName: 'SessionStart',
          name: 'second',
          command: 'echo second',
          env: [],
        },
      ]);
    });

    it.each([
      ['invalid JSON', '{ "hooks": '],
      ['a hooks value that is not an object', '{ "hooks": [] }'],
    ])(
      'signs a hooks.json file with %s without listing hooks',
      async (_name, content) => {
        writeFile('hooks/hooks.json', content);

        const summary = await buildExtensionContentSummary(rootDir);

        const files = [fileEntry('hooks/hooks.json', content)];
        expect(summary.hooks).toEqual({
          files,
          referencedPaths: [],
          signature: computeContentSignature(files),
        });
      },
    );

    it('signs the files under hooks/ and the paths that hooks reference', async () => {
      const hooks = hooksFile('node ${extensionPath}/scripts/on-start.js', {
        CONFIG_DIR: '${extensionPath}/config',
      });
      writeFile('hooks/hooks.json', hooks);
      writeFile('hooks/helper.sh', 'helper');
      writeFile('scripts/on-start.js', 'start');
      writeFile('config/settings.json', '{}');

      const summary = await buildExtensionContentSummary(rootDir);

      const configEntries = [fileEntry('config/settings.json', '{}')];
      const scriptEntries = [fileEntry('scripts/on-start.js', 'start')];
      const hookFiles = [
        fileEntry('hooks/helper.sh', 'helper'),
        fileEntry('hooks/hooks.json', hooks),
      ];
      expect(summary.hooks?.files).toEqual(hookFiles);
      expect(summary.hooks?.referencedPaths).toEqual([
        { path: 'config', signature: computeContentSignature(configEntries) },
        {
          path: 'scripts/on-start.js',
          signature: computeContentSignature(scriptEntries),
        },
      ]);
      expect(summary.hooks?.signature).toBe(
        computeContentSignature([
          ...hookFiles,
          ...configEntries,
          ...scriptEntries,
        ]),
      );
    });

    it('marks referenced paths that are missing or outside the folder', async () => {
      writeFile(
        'hooks/hooks.json',
        hooksFile(
          'node ${extensionPath}/missing.js && cat ${extensionPath}/../data.txt',
        ),
      );

      const summary = await buildExtensionContentSummary(rootDir);

      expect(summary.hooks?.referencedPaths).toEqual([
        {
          path: '../data.txt',
          marker: ContentMarker.Outside,
          signature: computeContentSignature([
            {
              path: '../data.txt',
              type: 'reference',
              value: ContentMarker.Outside,
            },
          ]),
        },
        {
          path: 'missing.js',
          marker: ContentMarker.Missing,
          signature: computeContentSignature([
            {
              path: 'missing.js',
              type: 'reference',
              value: ContentMarker.Missing,
            },
          ]),
        },
      ]);
    });

    it.skipIf(isWindows)(
      'marks a referenced path reached through a link that leaves the folder',
      async () => {
        const outsideDir = path.join(tempDir, 'outside');
        writeFile('data.txt', 'outside data', outsideDir);
        fs.symlinkSync(outsideDir, path.join(rootDir, 'scripts'));
        writeFile(
          'hooks/hooks.json',
          hooksFile('cat ${extensionPath}/scripts/data.txt'),
        );

        const summary = await buildExtensionContentSummary(rootDir);

        expect(summary.hooks?.referencedPaths).toEqual([
          {
            path: 'scripts/data.txt',
            marker: ContentMarker.Outside,
            signature: computeContentSignature([
              {
                path: 'scripts/data.txt',
                type: 'file',
                value: ContentMarker.Outside,
              },
            ]),
          },
        ]);
      },
    );

    it('returns the same summary for identical folders in different places', async () => {
      const otherRoot = path.join(tempDir, 'elsewhere', 'copy');
      for (const root of [rootDir, otherRoot]) {
        writeFile(
          'hooks/hooks.json',
          hooksFile('node ${extensionPath}/scripts/on-start.js'),
          root,
        );
        writeFile('scripts/on-start.js', 'start', root);
      }

      expect(await buildExtensionContentSummary(otherRoot)).toEqual(
        await buildExtensionContentSummary(rootDir),
      );
    });

    it('changes the hooks signature when a referenced script changes', async () => {
      writeFile(
        'hooks/hooks.json',
        hooksFile('node ${extensionPath}/scripts/on-start.js'),
      );
      writeFile('scripts/on-start.js', 'v1');
      const before = await buildExtensionContentSummary(rootDir);

      writeFile('scripts/on-start.js', 'v2');
      const after = await buildExtensionContentSummary(rootDir);

      expect(after.hooks?.signature).not.toBe(before.hooks?.signature);
      expect(after.hooks?.files).toEqual(before.hooks?.files);
    });
  });

  describe('context files', () => {
    function contextSources(...relativePaths: string[]) {
      return {
        contextFilePaths: relativePaths.map((relativePath) =>
          path.join(rootDir, relativePath),
        ),
      };
    }

    it('is absent without context files', async () => {
      writeFile('GEMINI.md', 'context');

      expect(
        await buildExtensionContentSummary(rootDir, contextSources()),
      ).toEqual({});
    });

    it('signs the context files and the files they import', async () => {
      const context = 'Read @./docs/rules.md first.';
      const rules = 'Rules. See @./nested/more.md';
      writeFile('GEMINI.md', context);
      writeFile('docs/rules.md', rules);
      writeFile('docs/nested/more.md', 'More');

      const summary = await buildExtensionContentSummary(
        rootDir,
        contextSources('GEMINI.md'),
      );

      const files = [
        fileEntry('GEMINI.md', context),
        fileEntry('docs/nested/more.md', 'More'),
        fileEntry('docs/rules.md', rules),
      ];
      expect(summary.contextFiles).toEqual({
        paths: ['GEMINI.md'],
        importedPaths: ['docs/nested/more.md', 'docs/rules.md'],
        files,
        signature: computeContentSignature(files),
      });
    });

    it('signs every context file of a list', async () => {
      writeFile('a.md', 'a');
      writeFile('b.md', 'b');

      const summary = await buildExtensionContentSummary(
        rootDir,
        contextSources('a.md', 'b.md'),
      );

      expect(summary.contextFiles?.paths).toEqual(['a.md', 'b.md']);
      expect(summary.contextFiles?.files).toEqual([
        fileEntry('a.md', 'a'),
        fileEntry('b.md', 'b'),
      ]);
    });

    it('does not read imports outside the extension folder', async () => {
      const context = 'See @../outside.md';
      writeFile('GEMINI.md', context);
      fs.writeFileSync(path.join(tempDir, 'outside.md'), 'outside');

      const summary = await buildExtensionContentSummary(
        rootDir,
        contextSources('GEMINI.md'),
      );

      expect(summary.contextFiles?.importedPaths).toEqual([]);
      expect(summary.contextFiles?.files).toEqual([
        fileEntry('GEMINI.md', context),
      ]);
    });
  });
});
