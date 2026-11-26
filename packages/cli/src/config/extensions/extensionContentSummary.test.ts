/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const agentLoaderErrors = vi.hoisted(() => {
  const extra: Array<{ filePath: string; message: string }> = [];
  return { extra };
});

// Delegates to the real loader and appends the errors a test sets, to cover
// load errors that the real loader doesn't produce.
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    loadAgentsFromDirectory: async (dir: string) => {
      const result = await actual.loadAgentsFromDirectory(dir);
      return {
        ...result,
        errors: [
          ...result.errors,
          ...agentLoaderErrors.extra.map(
            ({ filePath, message }) =>
              new actual.AgentLoadError(filePath, message),
          ),
        ],
      };
    },
  };
});

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
    agentLoaderErrors.extra = [];
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

    it('reads a quoted path up to the matching quote', () => {
      expect(
        findReferencedPaths([
          'node "${extensionPath}/my scripts/on start.js" --verbose',
          "bash '${extensionPath}${/}tools (v2)${/}setup.sh'",
          'cat "${extensionPath}/Bob\'s notes.txt"',
        ]),
      ).toEqual([
        { path: "Bob's notes.txt" },
        { path: 'my scripts/on start.js' },
        { path: 'tools (v2)/setup.sh' },
      ]);
    });

    it('ends a quoted path at a list separator or a variable', () => {
      expect(
        findReferencedPaths([
          'PYTHONPATH="${extensionPath}/lib dir:${extensionPath}/vendor" python3 app.py',
          'node "${extensionPath}/scripts/$NAME.js"',
        ]),
      ).toEqual([{ path: 'lib dir' }, { path: 'scripts' }, { path: 'vendor' }]);
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

      expect(
        await buildExtensionContentSummary(rootDir, { includeAllFiles: false }),
      ).toEqual({});
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

    it('signs a quoted referenced path that contains spaces', async () => {
      writeFile(
        'hooks/hooks.json',
        hooksFile('node "${extensionPath}/my scripts/on start.js"'),
      );
      writeFile('my scripts/on start.js', 'v1');
      const before = await buildExtensionContentSummary(rootDir);

      writeFile('my scripts/on start.js', 'v2');
      const after = await buildExtensionContentSummary(rootDir);

      expect(before.hooks?.referencedPaths).toEqual([
        {
          path: 'my scripts/on start.js',
          signature: computeContentSignature([
            fileEntry('my scripts/on start.js', 'v1'),
          ]),
        },
      ]);
      expect(after.hooks?.signature).not.toBe(before.hooks?.signature);
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
        await buildExtensionContentSummary(rootDir, {
          ...contextSources(),
          includeAllFiles: false,
        }),
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

    it('finishes and lists each file once when imports form a cycle', async () => {
      const context = 'Start with @./docs/a.md';
      const first = 'A. See @./b.md';
      const second = 'B. Back to @./a.md';
      writeFile('GEMINI.md', context);
      writeFile('docs/a.md', first);
      writeFile('docs/b.md', second);

      const summary = await buildExtensionContentSummary(
        rootDir,
        contextSources('GEMINI.md'),
      );

      expect(summary.contextFiles?.importedPaths).toEqual([
        'docs/a.md',
        'docs/b.md',
      ]);
      expect(summary.contextFiles?.files).toEqual([
        fileEntry('GEMINI.md', context),
        fileEntry('docs/a.md', first),
        fileEntry('docs/b.md', second),
      ]);
    });

    it('keeps the imports of a file that a long import chain also reaches', async () => {
      // shared.md is imported directly and at the end of a chain that the
      // import depth limit cuts off, where it has no imports of its own.
      writeFile('GEMINI.md', 'Read @./shared.md\nThen @./chain1.md');
      writeFile('shared.md', 'Shared. See @./leaf.md');
      writeFile('leaf.md', 'Leaf');
      writeFile('chain1.md', 'Next @./chain2.md');
      writeFile('chain2.md', 'Next @./chain3.md');
      writeFile('chain3.md', 'Next @./chain4.md');
      writeFile('chain4.md', 'Back to @./shared.md');

      const summary = await buildExtensionContentSummary(
        rootDir,
        contextSources('GEMINI.md'),
      );

      expect(summary.contextFiles?.importedPaths).toEqual([
        'chain1.md',
        'chain2.md',
        'chain3.md',
        'chain4.md',
        'leaf.md',
        'shared.md',
      ]);
    });
  });

  describe('skills', () => {
    function skillFile(name: string, description: string): string {
      return `---\nname: ${name}\ndescription: ${description}\n---\nBody of ${name}\n`;
    }

    it('is absent without skills', async () => {
      writeFile('skills/notes.txt', 'not a skill');

      expect(
        await buildExtensionContentSummary(rootDir, { includeAllFiles: false }),
      ).toEqual({});
    });

    it('lists skills by location, relative to the extension folder, with a signature per skill', async () => {
      writeFile('skills/zeta/SKILL.md', skillFile('zeta', 'Last skill'));
      writeFile('skills/alpha/SKILL.md', skillFile('alpha', 'First skill'));
      writeFile('skills/alpha/reference.md', 'reference');
      writeFile('skills/README.md', 'readme');

      const summary = await buildExtensionContentSummary(rootDir);

      const alphaFiles = [
        fileEntry('skills/alpha/SKILL.md', skillFile('alpha', 'First skill')),
        fileEntry('skills/alpha/reference.md', 'reference'),
      ];
      const zetaFiles = [
        fileEntry('skills/zeta/SKILL.md', skillFile('zeta', 'Last skill')),
      ];
      const files = [
        fileEntry('skills/README.md', 'readme'),
        ...alphaFiles,
        ...zetaFiles,
      ];
      expect(summary.skills).toEqual({
        skills: [
          {
            name: 'alpha',
            description: 'First skill',
            location: 'skills/alpha/SKILL.md',
            itemCount: 2,
            signature: computeContentSignature(alphaFiles),
          },
          {
            name: 'zeta',
            description: 'Last skill',
            location: 'skills/zeta/SKILL.md',
            itemCount: 1,
            signature: computeContentSignature(zetaFiles),
          },
        ],
        files,
        signature: computeContentSignature(files),
      });
    });

    it('returns the same skills summary for identical folders in different places', async () => {
      const otherRoot = path.join(tempDir, 'elsewhere', 'copy');
      for (const root of [rootDir, otherRoot]) {
        writeFile('skills/demo/SKILL.md', skillFile('demo', 'Demo'), root);
        writeFile('skills/demo/notes.md', 'notes', root);
      }

      expect((await buildExtensionContentSummary(otherRoot)).skills).toEqual(
        (await buildExtensionContentSummary(rootDir)).skills,
      );
    });

    it.skipIf(isWindows)(
      'does not read skills through a folder link that leaves the extension folder',
      async () => {
        const outsideDir = path.join(tempDir, 'outside-skills');
        writeFile('demo/SKILL.md', skillFile('outside', 'Outside'), outsideDir);
        fs.symlinkSync(outsideDir, path.join(rootDir, 'skills'));

        const summary = await buildExtensionContentSummary(rootDir);

        const files: ContentEntry[] = [
          { path: 'skills', type: 'link', value: ContentMarker.Outside },
        ];
        expect(summary.skills).toEqual({
          skills: [],
          files,
          signature: computeContentSignature(files),
        });
      },
    );

    it.skipIf(isWindows)(
      'lists the skills inside the folder and does not read a skill folder link that leaves it',
      async () => {
        const outsideDir = path.join(tempDir, 'outside-skill');
        writeFile('SKILL.md', skillFile('outside', 'Outside'), outsideDir);
        writeFile('skills/inside/SKILL.md', skillFile('inside', 'Inside'));
        fs.symlinkSync(outsideDir, path.join(rootDir, 'skills', 'linked'));

        const summary = await buildExtensionContentSummary(rootDir);

        expect(summary.skills?.skills.map((skill) => skill.name)).toEqual([
          'inside',
        ]);
        expect(summary.skills?.files).toContainEqual({
          path: 'skills/linked',
          type: 'link',
          value: ContentMarker.Outside,
        });
      },
    );
  });

  describe('sub-agents', () => {
    const localAgent = [
      '---',
      'name: release-helper',
      'description: Helps with releases',
      'mcp_servers:',
      '  tracker:',
      '    command: node',
      '    args:',
      '      - ${extensionPath}/servers/tracker.js',
      '    trust: true',
      '---',
      'You help with releases.',
    ].join('\n');
    const remoteAgent = [
      '---',
      'kind: remote',
      'name: remote-helper',
      'agent_card_url: https://example.com/card.json',
      '---',
    ].join('\n');

    it('lists the agents that the loader reads, with their MCP servers and the files they use', async () => {
      writeFile('agents/release-helper.md', localAgent);
      writeFile('agents/remote.md', remoteAgent);
      writeFile('agents/broken.md', 'no front matter');
      writeFile('agents/_draft.md', 'skipped');
      writeFile('agents/notes.txt', 'skipped');
      writeFile('agents/nested/deep.md', 'skipped');
      writeFile('servers/tracker.js', 'server');

      const summary = await buildExtensionContentSummary(rootDir);

      const files = [
        fileEntry('agents/broken.md', 'no front matter'),
        fileEntry('agents/release-helper.md', localAgent),
        fileEntry('agents/remote.md', remoteAgent),
      ];
      const trackerEntries = [fileEntry('servers/tracker.js', 'server')];
      expect(summary.agents?.files).toEqual(files);
      expect(
        summary.agents?.agents.map((agent) => ({
          path: agent.path,
          name: agent.name,
          agentCardUrl: agent.agentCardUrl,
          servers: agent.mcpServers.map(([name, server]) => [
            name,
            server.command,
            server.args,
            server.trust,
          ]),
        })),
      ).toEqual([
        { path: 'agents/broken.md', servers: [] },
        {
          path: 'agents/release-helper.md',
          name: 'release-helper',
          servers: [
            ['tracker', 'node', ['${extensionPath}/servers/tracker.js'], true],
          ],
        },
        {
          path: 'agents/remote.md',
          name: 'remote-helper',
          agentCardUrl: 'https://example.com/card.json',
          servers: [],
        },
      ]);
      expect(summary.agents?.referencedPaths).toEqual([
        {
          path: 'servers/tracker.js',
          signature: computeContentSignature(trackerEntries),
        },
      ]);
      expect(summary.agents?.signature).toBe(
        computeContentSignature([...files, ...trackerEntries]),
      );
    });

    it('lists a load error without a file path under agents', async () => {
      writeFile('agents/release-helper.md', localAgent);
      agentLoaderErrors.extra = [{ filePath: '', message: 'unreadable' }];

      const summary = await buildExtensionContentSummary(rootDir);

      expect(summary.agents?.agents.map((agent) => agent.path)).toEqual([
        'agents',
        'agents/release-helper.md',
      ]);
    });

    it('is absent when agents/ has no file that the loader reads', async () => {
      writeFile('agents/_draft.md', 'skipped');
      writeFile('agents/README.txt', 'skipped');

      expect(
        await buildExtensionContentSummary(rootDir, { includeAllFiles: false }),
      ).toEqual({});
    });

    it.skipIf(isWindows)(
      'does not load agents through a folder link that leaves the extension folder',
      async () => {
        const outsideDir = path.join(tempDir, 'outside-agents');
        writeFile('helper.md', localAgent, outsideDir);
        fs.symlinkSync(outsideDir, path.join(rootDir, 'agents'));

        const summary = await buildExtensionContentSummary(rootDir);

        const files: ContentEntry[] = [
          { path: 'agents', type: 'link', value: ContentMarker.Outside },
        ];
        expect(summary.agents).toEqual({
          agents: [],
          referencedPaths: [],
          files,
          signature: computeContentSignature(files),
        });
      },
    );
  });

  describe('custom commands and policies', () => {
    it('lists the commands that the loader finds, including nested and hidden folders', async () => {
      writeFile('commands/deploy.toml', 'a');
      writeFile('commands/release/notes.toml', 'b');
      writeFile('commands/.internal/sync.toml', 'c');
      writeFile('commands/README.md', 'skipped');

      const summary = await buildExtensionContentSummary(rootDir);

      const files = [
        fileEntry('commands/.internal/sync.toml', 'c'),
        fileEntry('commands/deploy.toml', 'a'),
        fileEntry('commands/release/notes.toml', 'b'),
      ];
      expect(summary.commands).toEqual({
        files,
        signature: computeContentSignature(files),
      });
    });

    it('lists the policy files directly in policies/', async () => {
      writeFile('policies/release.toml', 'a');
      writeFile('policies/nested/skipped.toml', 'b');
      writeFile('policies/notes.md', 'c');

      const summary = await buildExtensionContentSummary(rootDir);

      const files = [fileEntry('policies/release.toml', 'a')];
      expect(summary.policies).toEqual({
        files,
        signature: computeContentSignature(files),
      });
    });
  });

  describe('MCP servers', () => {
    it('keeps ${extensionPath} and ${workspacePath} as written and resolves path separators', async () => {
      writeFile(
        'gemini-extension.json',
        JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          mcpServers: {
            nodeServer: {
              command: 'node',
              args: [
                '${extensionPath}${/}example.js',
                '--root=${workspacePath}${pathSeparator}src',
              ],
              cwd: '${extensionPath}',
            },
          },
        }),
      );
      writeFile('example.js', 'server');

      const summary = await buildExtensionContentSummary(rootDir);

      const rootEntries: ContentEntry[] = [
        { path: '.', type: 'reference', value: ContentMarker.Root },
      ];
      const entries = [fileEntry('example.js', 'server')];
      expect(summary.mcpServers).toEqual([
        [
          'nodeServer',
          {
            config: {
              command: 'node',
              args: [
                '${extensionPath}/example.js',
                '--root=${workspacePath}/src',
              ],
              cwd: '${extensionPath}',
            },
            referencedPaths: [
              {
                path: '.',
                marker: ContentMarker.Root,
                signature: computeContentSignature(rootEntries),
              },
              {
                path: 'example.js',
                signature: computeContentSignature(entries),
              },
            ],
            filesSignature: computeContentSignature([
              ...rootEntries,
              ...entries,
            ]),
          },
        ],
      ]);
    });

    it('counts the working directory among the files that a server uses', async () => {
      writeFile(
        'gemini-extension.json',
        JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          mcpServers: {
            srv: {
              command: 'node',
              args: ['server.js'],
              cwd: '${extensionPath}/server',
            },
          },
        }),
      );
      writeFile('server/server.js', 'v1');
      const before = (await buildExtensionContentSummary(rootDir))
        .mcpServers?.[0]?.[1];
      writeFile('server/server.js', 'v2');
      const after = (await buildExtensionContentSummary(rootDir))
        .mcpServers?.[0]?.[1];

      expect(
        before?.referencedPaths.map((reference) => reference.path),
      ).toEqual(['server']);
      expect(before?.filesSignature).toBe(
        computeContentSignature([fileEntry('server/server.js', 'v1')]),
      );
      expect(after?.filesSignature).not.toBe(before?.filesSignature);
    });

    it('lists no MCP servers when the manifest declares none', async () => {
      writeFile(
        'gemini-extension.json',
        JSON.stringify({ name: 'demo', version: '1.0.0' }),
      );

      expect((await buildExtensionContentSummary(rootDir)).mcpServers).toEqual(
        [],
      );
    });
  });

  describe('settings and plan directory', () => {
    it('reads the settings and the plan directory as written in the manifest', async () => {
      writeFile(
        'gemini-extension.json',
        JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          settings: [
            {
              name: 'API key',
              description: 'The key',
              envVar: 'API_KEY',
              sensitive: true,
            },
            { name: 'Region', description: 'The region', envVar: 'REGION' },
          ],
          plan: { directory: '${extensionPath}/plans' },
        }),
      );

      const summary = await buildExtensionContentSummary(rootDir);

      expect(summary.settings).toEqual([
        { name: 'API key', envVar: 'API_KEY', sensitive: true },
        { name: 'Region', envVar: 'REGION', sensitive: false },
      ]);
      expect(summary.planDirectory).toBe('${extensionPath}/plans');
    });
  });

  describe('extension files', () => {
    it('lists every file except .git folders and the files that Gemini CLI writes there', async () => {
      writeFile(
        'gemini-extension.json',
        '{"name": "demo", "version": "1.0.0"}',
      );
      writeFile('lib/helper.js', 'helper');
      writeFile('vendor/tool/index.js', 'tool');
      writeFile('vendor/tool/.git/HEAD', 'ref');
      writeFile('.git/HEAD', 'ref');
      writeFile('.gemini-extension-install.json', '{}');
      writeFile('.env', 'API_KEY=value');

      const summary = await buildExtensionContentSummary(rootDir);

      expect(summary.extensionFiles?.files.map((entry) => entry.path)).toEqual([
        'gemini-extension.json',
        'lib/helper.js',
        'vendor/tool/index.js',
      ]);
    });

    it('hashes gemini-extension.json without its version and with sorted keys', async () => {
      const otherRoot = path.join(tempDir, 'other');
      writeFile(
        'gemini-extension.json',
        JSON.stringify({ name: 'demo', version: '1.0.0', description: 'Demo' }),
      );
      writeFile(
        'gemini-extension.json',
        JSON.stringify(
          { description: 'Demo', version: '2.0.0', name: 'demo' },
          null,
          2,
        ),
        otherRoot,
      );
      const signature = (await buildExtensionContentSummary(rootDir))
        .extensionFiles?.signature;

      expect(
        (await buildExtensionContentSummary(otherRoot)).extensionFiles
          ?.signature,
      ).toBe(signature);

      writeFile(
        'gemini-extension.json',
        JSON.stringify({ name: 'demo', version: '2.0.0', description: 'New' }),
        otherRoot,
      );
      expect(
        (await buildExtensionContentSummary(otherRoot)).extensionFiles
          ?.signature,
      ).not.toBe(signature);
    });

    it('changes when a file that only a script loads changes', async () => {
      writeFile('lib/helper.js', 'v1');
      const before = await buildExtensionContentSummary(rootDir);
      writeFile('lib/helper.js', 'v2');

      const after = await buildExtensionContentSummary(rootDir);

      expect(after.extensionFiles?.signature).not.toBe(
        before.extensionFiles?.signature,
      );
    });

    it('is left out when includeAllFiles is false', async () => {
      writeFile('lib/helper.js', 'helper');

      expect(
        (
          await buildExtensionContentSummary(rootDir, {
            includeAllFiles: false,
          })
        ).extensionFiles,
      ).toBeUndefined();
    });
  });
});
