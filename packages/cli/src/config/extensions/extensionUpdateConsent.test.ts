/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import {
  getErrorMessage,
  getRealPath,
  IntegrityDataStatus,
  type GeminiCLIExtension,
  type IExtensionIntegrity,
} from '@google/gemini-cli-core';
import { ExtensionManager } from '../extension-manager.js';
import { createTestMergedSettings } from '../settings.js';
import { isWorkspaceTrusted } from '../trustedFolders.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { ConsentPrompt } from '../../ui/components/ConsentPrompt.js';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import { updateExtension } from './update.js';
import { EXTENSIONS_DIRECTORY_NAME } from './variables.js';

const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/mock-home'));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, homedir: mockHomedir };
});

vi.mock('../trustedFolders.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../trustedFolders.js')>();
  return { ...actual, isWorkspaceTrusted: vi.fn() };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: mockHomedir,
    logExtensionEnable: vi.fn(),
    logExtensionInstallEvent: vi.fn(),
    logExtensionUninstall: vi.fn(),
    logExtensionUpdateEvent: vi.fn(),
    logExtensionDisable: vi.fn(),
  };
});

const EXTENSION_NAME = 'update-consent-fixture';
const HOOK_V1 = 'echo hook-v1';
const HOOK_V2 = 'echo hook-v2-changed';
const ON_START_COMMAND = 'node ${extensionPath}/scripts/on-start.js';

interface HookOptions {
  command: string;
  matcher?: string;
  env?: Record<string, string>;
}

interface SourceOptions {
  version: string;
  /** Extra fields for `gemini-extension.json`. */
  manifest?: Record<string, unknown>;
  /** Adds a `SessionStart` hook that runs this command. */
  hookCommand?: string;
  /** Adds a `SessionStart` hook with these options. */
  hook?: HookOptions;
  /** Raw content of `hooks/hooks.json`. */
  hooksFile?: string;
  context?: string;
  skillBody?: string;
  mcpServers?: Record<string, { command: string; args: string[] }>;
  /** Extra files, keyed by their path relative to the extension folder. */
  files?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hooksFileContent(hook: HookOptions): string {
  return JSON.stringify({
    hooks: {
      SessionStart: [
        {
          ...(hook.matcher !== undefined ? { matcher: hook.matcher } : {}),
          hooks: [
            {
              type: 'command',
              command: hook.command,
              ...(hook.env ? { env: hook.env } : {}),
            },
          ],
        },
      ],
    },
  });
}

function agentFile(body: string): string {
  return [
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
    body,
  ].join('\n');
}

/** The MCP server layout of the `mcp-server` extension template. */
const MCP_TEMPLATE_MANIFEST = {
  mcpServers: {
    nodeServer: {
      command: 'node',
      args: ['${extensionPath}${/}example.js'],
      cwd: '${extensionPath}',
    },
  },
};

/** Runs git with a fixed identity and without the user's git settings. */
function runGit(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: os.devNull,
        GIT_CONFIG_NOSYSTEM: '1',
      },
    },
  );
}

describe('extension update consent', () => {
  let tempHomeDir: string;
  let workspaceDir: string;
  let sourceDir: string;
  let userExtensionsDir: string;
  let requestConsent: MockedFunction<(consent: string) => Promise<boolean>>;
  let extensionManager: ExtensionManager;

  function createExtensionManager(hooksEnabled: boolean): ExtensionManager {
    const settings = createTestMergedSettings();
    settings.hooksConfig.enabled = hooksEnabled;

    const integrityManager: IExtensionIntegrity = {
      verify: vi.fn().mockResolvedValue(IntegrityDataStatus.VERIFIED),
      store: vi.fn().mockResolvedValue(undefined),
    };

    return new ExtensionManager({
      workspaceDir,
      requestConsent,
      requestSetting: null,
      settings,
      integrityManager,
    });
  }

  /** Replaces the extension source folder with the files of one version. */
  function writeSource(options: SourceOptions): void {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, 'gemini-extension.json'),
      JSON.stringify({
        name: EXTENSION_NAME,
        version: options.version,
        ...options.manifest,
        ...(options.mcpServers ? { mcpServers: options.mcpServers } : {}),
      }),
    );
    const hook =
      options.hook ??
      (options.hookCommand !== undefined
        ? { command: options.hookCommand }
        : undefined);
    const hooksFile =
      options.hooksFile ?? (hook ? hooksFileContent(hook) : undefined);
    if (hooksFile !== undefined) {
      fs.mkdirSync(path.join(sourceDir, 'hooks'));
      fs.writeFileSync(path.join(sourceDir, 'hooks', 'hooks.json'), hooksFile);
    }
    if (options.context !== undefined) {
      fs.writeFileSync(path.join(sourceDir, 'GEMINI.md'), options.context);
    }
    if (options.skillBody !== undefined) {
      const skillDir = path.join(sourceDir, 'skills', 'demo');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: demo\ndescription: Demo skill\n---\n${options.skillBody}\n`,
      );
    }
    for (const [relativePath, content] of Object.entries(options.files ?? {})) {
      const filePath = path.join(sourceDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
  }

  function installedFile(...segments: string[]): string {
    return path.join(userExtensionsDir, EXTENSION_NAME, ...segments);
  }

  function readInstalledVersion(): unknown {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(installedFile('gemini-extension.json'), 'utf-8'),
    );
    return isRecord(manifest) ? manifest['version'] : undefined;
  }

  function readInstalledHookCommand(): string | undefined {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(installedFile('hooks', 'hooks.json'), 'utf-8'),
    );
    if (!isRecord(parsed)) return undefined;
    const hooks = parsed['hooks'];
    if (!isRecord(hooks)) return undefined;
    const sessionStart = hooks['SessionStart'];
    if (!Array.isArray(sessionStart)) return undefined;
    const definition: unknown = sessionStart[0];
    if (!isRecord(definition)) return undefined;
    const entries = definition['hooks'];
    if (!Array.isArray(entries)) return undefined;
    const hook: unknown = entries[0];
    if (!isRecord(hook)) return undefined;
    const command = hook['command'];
    return typeof command === 'string' ? command : undefined;
  }

  /** Returns the text of the only consent request. */
  function consentText(): string {
    expect(requestConsent).toHaveBeenCalledTimes(1);
    return requestConsent.mock.calls[0][0];
  }

  /** Installs version 1.0.0 and checks that the install asked for consent. */
  async function installVersion1(
    options: Omit<SourceOptions, 'version'>,
  ): Promise<GeminiCLIExtension> {
    writeSource({ version: '1.0.0', ...options });
    await extensionManager.loadExtensions();
    const installed = await extensionManager.installOrUpdateExtension({
      source: sourceDir,
      type: 'local',
    });
    expect(
      requestConsent,
      'Precondition: the first install asks for consent once.',
    ).toHaveBeenCalledTimes(1);
    requestConsent.mockClear();
    return installed;
  }

  /**
   * Runs the same entry point as `gemini extensions update` and the
   * auto-update hook, and reports whether the update was applied.
   */
  async function settleUpdate(extension: GeminiCLIExtension): Promise<string> {
    try {
      await updateExtension(
        extension,
        extensionManager,
        ExtensionUpdateState.UPDATE_AVAILABLE,
        () => {},
      );
      return 'applied';
    } catch (error) {
      return `rejected: ${getErrorMessage(error)}`;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    tempHomeDir = getRealPath(
      fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-update-consent-')),
    );
    workspaceDir = path.join(tempHomeDir, 'workspace');
    sourceDir = path.join(tempHomeDir, 'source', EXTENSION_NAME);
    userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });

    requestConsent = vi.fn();
    requestConsent.mockResolvedValue(true);
    extensionManager = createExtensionManager(true);
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('hooks', () => {
    it('asks for consent again when a hook command changes', async () => {
      const installed = await installVersion1({ hookCommand: HOOK_V1 });
      writeSource({ version: '1.0.1', hookCommand: HOOK_V2 });

      await settleUpdate(installed);

      expect(
        requestConsent,
        'A changed hook command must trigger a consent request.',
      ).toHaveBeenCalledTimes(1);
      expect(consentText()).toContain(`  * SessionStart: \`${HOOK_V2}\``);
    });

    it('keeps the installed hook command when consent is declined', async () => {
      const installed = await installVersion1({ hookCommand: HOOK_V1 });
      requestConsent.mockResolvedValue(false);
      writeSource({ version: '1.0.1', hookCommand: HOOK_V2 });

      const outcome = await settleUpdate(installed);

      expect
        .soft(outcome, 'A declined update must be rejected.')
        .toMatch(/^rejected: [\s\S]*Installation cancelled/);
      expect
        .soft(
          readInstalledHookCommand(),
          'The installed hook command must stay at the approved value.',
        )
        .toBe(HOOK_V1);
      expect
        .soft(readInstalledVersion(), 'The installed version must not change.')
        .toBe('1.0.0');
    });

    it('does not ask for consent when hooks are unchanged', async () => {
      const installed = await installVersion1({ hookCommand: HOOK_V1 });
      writeSource({ version: '1.0.1', hookCommand: HOOK_V1 });

      const outcome = await settleUpdate(installed);

      expect(requestConsent).not.toHaveBeenCalled();
      expect(outcome).toBe('applied');
      expect(readInstalledVersion()).toBe('1.0.1');
    });

    it('does not ask for consent when unchanged hooks use ${extensionPath}', async () => {
      const files = { 'scripts/on-start.js': 'console.log("start");' };
      const installed = await installVersion1({
        hookCommand: ON_START_COMMAND,
        files,
      });
      writeSource({ version: '1.0.1', hookCommand: ON_START_COMMAND, files });

      const outcome = await settleUpdate(installed);

      expect(requestConsent).not.toHaveBeenCalled();
      expect(outcome).toBe('applied');
    });

    it('asks for consent again when a script that a hook runs changes', async () => {
      const installed = await installVersion1({
        hookCommand: ON_START_COMMAND,
        files: { 'scripts/on-start.js': 'console.log("v1");' },
      });
      writeSource({
        version: '1.0.1',
        hookCommand: ON_START_COMMAND,
        files: { 'scripts/on-start.js': 'console.log("v2");' },
      });

      await settleUpdate(installed);

      const text = consentText();
      expect(text).toContain('  Files used by hooks: `scripts/on-start.js`');
      expect(text).toContain('  * Hooks: `scripts/on-start.js` changed');
    });

    it('asks for consent again when a file under hooks/ changes', async () => {
      const installed = await installVersion1({
        hookCommand: HOOK_V1,
        files: { 'hooks/check.sh': 'echo check-v1' },
      });
      writeSource({
        version: '1.0.1',
        hookCommand: HOOK_V1,
        files: { 'hooks/check.sh': 'echo check-v2' },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain('  * Hooks: `hooks/check.sh` changed');
    });

    it('asks for consent again when only a hook environment variable changes', async () => {
      const installed = await installVersion1({
        hook: { command: HOOK_V1, env: { LOG_LEVEL: 'info' } },
      });
      writeSource({
        version: '1.0.1',
        hook: { command: HOOK_V1, env: { LOG_LEVEL: 'debug' } },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain('        - LOG_LEVEL: `debug`');
    });

    it('asks for consent again when only a hook matcher changes', async () => {
      const installed = await installVersion1({
        hook: { command: HOOK_V1, matcher: 'startup' },
      });
      writeSource({
        version: '1.0.1',
        hook: { command: HOOK_V1, matcher: '*' },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain(
        `  * SessionStart (matcher: \`*\`): \`${HOOK_V1}\``,
      );
    });

    it('asks for consent again, without failing, when hooks.json becomes malformed', async () => {
      const installed = await installVersion1({ hookCommand: HOOK_V1 });
      writeSource({ version: '1.0.1', hooksFile: '{ "hooks": ' });

      await settleUpdate(installed);

      expect(consentText()).toContain(
        "`hooks/hooks.json` isn't a valid hooks file",
      );
    });

    it('compares hooks from the files when hooks are disabled in the settings', async () => {
      extensionManager = createExtensionManager(false);
      const installed = await installVersion1({ hookCommand: HOOK_V1 });

      writeSource({ version: '1.0.1', hookCommand: HOOK_V1 });
      expect(await settleUpdate(installed)).toBe('applied');
      expect(requestConsent).not.toHaveBeenCalled();

      const updated = extensionManager
        .getExtensions()
        .find((extension) => extension.name === EXTENSION_NAME);
      if (!updated) {
        throw new Error('The updated extension is not loaded.');
      }
      writeSource({ version: '1.0.2', hookCommand: HOOK_V2 });
      await settleUpdate(updated);
      expect(requestConsent).toHaveBeenCalledTimes(1);
    });

    it('lists the new hook command above the question', async () => {
      const installed = await installVersion1({ hookCommand: HOOK_V1 });
      writeSource({ version: '1.0.1', hookCommand: HOOK_V2 });

      await settleUpdate(installed);

      expect(consentText()).toMatch(
        new RegExp(
          'Changes since the installed version:\\n' +
            '  \\* Hooks: new or changed `SessionStart: echo hook-v2-changed`$',
        ),
      );
    });

    it('shows a hook command with backticks, *, _, and $ verbatim in the interactive dialog', async () => {
      const command = 'echo `date` *bold* _under_ $HOME $\\to$';
      const installed = await installVersion1({ hookCommand: HOOK_V1 });
      writeSource({ version: '1.0.1', hookCommand: command });
      await settleUpdate(installed);

      const { lastFrame, unmount } = await renderWithProviders(
        React.createElement(ConsentPrompt, {
          prompt: consentText(),
          onConfirm: vi.fn(),
          terminalWidth: 120,
        }),
      );

      expect(lastFrame()).toContain(`SessionStart: ${command}`);
      unmount();
    });
  });

  describe('context files', () => {
    it('asks for consent again when the GEMINI.md content changes', async () => {
      const installed = await installVersion1({ context: 'context v1' });
      writeSource({ version: '1.0.1', context: 'context v2' });

      await settleUpdate(installed);

      expect(
        requestConsent,
        'Changed GEMINI.md content must trigger a consent request.',
      ).toHaveBeenCalledTimes(1);
      const text = consentText();
      expect(text).toContain(
        'This extension will append info to your gemini.md context using GEMINI.md\n  Context files signature: ',
      );
      expect(text).toContain('  * Context files: `GEMINI.md` changed');
    });

    it('asks for consent again when GEMINI.md is added or removed', async () => {
      const installed = await installVersion1({});
      writeSource({ version: '1.0.1', context: 'context' });
      expect(await settleUpdate(installed)).toBe('applied');
      expect(consentText()).toContain('  * Context files: `GEMINI.md` added');

      requestConsent.mockClear();
      const updated = extensionManager
        .getExtensions()
        .find((extension) => extension.name === EXTENSION_NAME);
      if (!updated) {
        throw new Error('The updated extension is not loaded.');
      }
      writeSource({ version: '1.0.2' });
      await settleUpdate(updated);
      expect(consentText()).toContain('  * Context files: `GEMINI.md` removed');
    });

    it('asks for consent again when a file of a contextFileName list changes', async () => {
      const manifest = { contextFileName: ['a.md', 'b.md'] };
      const installed = await installVersion1({
        manifest,
        files: { 'a.md': 'a', 'b.md': 'b v1' },
      });
      writeSource({
        version: '1.0.1',
        manifest,
        files: { 'a.md': 'a', 'b.md': 'b v2' },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain('  * Context files: `b.md` changed');
    });

    it('ignores GEMINI.md when contextFileName is set', async () => {
      const manifest = { contextFileName: 'CONTEXT.md' };
      const installed = await installVersion1({
        manifest,
        context: 'ignored v1',
        files: { 'CONTEXT.md': 'context' },
      });
      writeSource({
        version: '1.0.1',
        manifest,
        context: 'ignored v2',
        files: { 'CONTEXT.md': 'context' },
      });

      expect(await settleUpdate(installed)).toBe('applied');
      expect(requestConsent).not.toHaveBeenCalled();
    });

    it('asks for consent again when a file imported by GEMINI.md changes', async () => {
      const context = 'Follow @./docs/rules.md';
      const installed = await installVersion1({
        context,
        files: { 'docs/rules.md': 'rules v1' },
      });
      writeSource({
        version: '1.0.1',
        context,
        files: { 'docs/rules.md': 'rules v2' },
      });

      await settleUpdate(installed);

      const text = consentText();
      expect(text).toContain('  Imported files: `docs/rules.md`');
      expect(text).toContain('  * Context files: `docs/rules.md` changed');
    });

    it('does not ask for consent when context files are unchanged', async () => {
      const options = {
        context: 'Follow @./docs/rules.md',
        files: { 'docs/rules.md': 'rules' },
      };
      const installed = await installVersion1(options);
      writeSource({ version: '1.0.1', ...options });

      expect(await settleUpdate(installed)).toBe('applied');
      expect(requestConsent).not.toHaveBeenCalled();
    });
  });

  describe('skills', () => {
    it('does not ask for consent when skills are unchanged', async () => {
      const installed = await installVersion1({ skillBody: 'body v1' });
      writeSource({ version: '1.0.1', skillBody: 'body v1' });

      await settleUpdate(installed);

      expect(
        requestConsent,
        'Identical skills must not trigger a consent request.',
      ).not.toHaveBeenCalled();
    });

    it('asks for consent again when a skill file changes', async () => {
      const installed = await installVersion1({ skillBody: 'body v1' });
      writeSource({ version: '1.0.1', skillBody: 'body v2' });

      await settleUpdate(installed);

      const text = consentText();
      expect(text).toContain('(Source: skills/demo/SKILL.md) (1 items');
      expect(text).toContain('  Skills signature: ');
      expect(text).toContain('  * Skills: `skills/demo` changed');
    });

    it('asks for consent again when a companion file of a skill changes', async () => {
      const installed = await installVersion1({
        skillBody: 'body',
        files: { 'skills/demo/reference.md': 'reference v1' },
      });
      writeSource({
        version: '1.0.1',
        skillBody: 'body',
        files: { 'skills/demo/reference.md': 'reference v2' },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain('  * Skills: `skills/demo` changed');
    });
  });

  describe('sub-agents, custom commands, and policies', () => {
    it('asks for consent when a sub-agent with MCP servers is added, and shows its trust setting', async () => {
      const installed = await installVersion1({});
      writeSource({
        version: '1.0.1',
        files: {
          'agents/release-helper.md': agentFile('Help with releases.'),
          'servers/tracker.js': 'server',
        },
      });

      await settleUpdate(installed);

      const text = consentText();
      expect(text).toContain(
        [
          '  * `release-helper` (`agents/release-helper.md`)',
          '      MCP server `tracker` (local): `node ${extensionPath}/servers/tracker.js`',
          '      Trust: true',
        ].join('\n'),
      );
      expect(text).toContain(
        '  Files used by MCP servers: `servers/tracker.js`',
      );
      expect(text).toContain(
        '  * Sub-agents: `agents/release-helper.md` added',
      );
    });

    it('lists a remote sub-agent with its agent card URL', async () => {
      const installed = await installVersion1({});
      writeSource({
        version: '1.0.1',
        files: {
          'agents/remote.md':
            '---\nkind: remote\nname: remote-helper\nagent_card_url: https://example.com/card.json\n---\n',
        },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain(
        '  * `remote-helper` (`agents/remote.md`)\n      Agent card URL: `https://example.com/card.json`',
      );
    });

    it('asks for consent again when a sub-agent file changes', async () => {
      const installed = await installVersion1({
        files: { 'agents/release-helper.md': agentFile('Version one.') },
      });
      writeSource({
        version: '1.0.1',
        files: { 'agents/release-helper.md': agentFile('Version two.') },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain(
        '  * Sub-agents: `agents/release-helper.md` changed',
      );
    });

    it('does not ask for consent when a file starting with _ in agents/ changes', async () => {
      const files = { 'agents/release-helper.md': agentFile('Help.') };
      const installed = await installVersion1({
        files: { ...files, 'agents/_notes.md': 'notes v1' },
      });
      writeSource({
        version: '1.0.1',
        files: { ...files, 'agents/_notes.md': 'notes v2' },
      });

      expect(await settleUpdate(installed)).toBe('applied');
      expect(requestConsent).not.toHaveBeenCalled();
    });

    it.each([
      ['a nested folder', 'commands/release/notes.toml'],
      ['a hidden folder', 'commands/.internal/notes.toml'],
    ])(
      'asks for consent again when a command in %s changes',
      async (_name, commandPath) => {
        const installed = await installVersion1({
          files: { [commandPath]: 'prompt = "v1"' },
        });
        writeSource({
          version: '1.0.1',
          files: { [commandPath]: 'prompt = "v2"' },
        });

        await settleUpdate(installed);

        expect(consentText()).toContain(
          `  * Custom commands: \`${commandPath}\` changed`,
        );
      },
    );

    it('asks for consent again when a policy file changes', async () => {
      const installed = await installVersion1({
        files: { 'policies/release.toml': '# release policy v1' },
      });
      writeSource({
        version: '1.0.1',
        files: { 'policies/release.toml': '# release policy v2' },
      });

      await settleUpdate(installed);

      expect(consentText()).toContain(
        '  * Policies: `policies/release.toml` changed',
      );
    });
  });

  describe('MCP servers', () => {
    it('does not ask for consent when only the version of the MCP server template changes', async () => {
      const files = { 'example.js': 'console.log("server");' };
      const installed = await installVersion1({
        manifest: MCP_TEMPLATE_MANIFEST,
        files,
      });
      writeSource({ version: '1.0.1', manifest: MCP_TEMPLATE_MANIFEST, files });

      expect(await settleUpdate(installed)).toBe('applied');
      expect(requestConsent).not.toHaveBeenCalled();
    });

    it('asks for consent again when the script of an MCP server changes', async () => {
      const installed = await installVersion1({
        manifest: MCP_TEMPLATE_MANIFEST,
        files: { 'example.js': 'console.log("v1");' },
      });
      writeSource({
        version: '1.0.1',
        manifest: MCP_TEMPLATE_MANIFEST,
        files: { 'example.js': 'console.log("v2");' },
      });

      await settleUpdate(installed);

      const text = consentText();
      expect(text).toContain(
        '  * nodeServer (local): node ${extensionPath}/example.js\n    Working directory: ${extensionPath}',
      );
      expect(text).toContain('    Files used: `example.js`');
      expect(text).toContain('  * MCP servers: `example.js` changed');
    });
  });

  describe('whole extension', () => {
    it('does not ask for consent for a version-only update when every kind of content is present', async () => {
      const options: Omit<SourceOptions, 'version'> = {
        manifest: MCP_TEMPLATE_MANIFEST,
        hookCommand: ON_START_COMMAND,
        context: 'Follow @./docs/rules.md',
        skillBody: 'body',
        files: {
          'example.js': 'console.log("server");',
          'scripts/on-start.js': 'console.log("start");',
          'docs/rules.md': 'rules',
          'agents/release-helper.md': agentFile('Help with releases.'),
          'servers/tracker.js': 'tracker',
          'commands/release/notes.toml': 'prompt = "notes"',
          'policies/release.toml': '# release policy',
        },
      };
      const installed = await installVersion1(options);
      writeSource({ version: '1.0.1', ...options });

      expect(await settleUpdate(installed)).toBe('applied');
      expect(requestConsent).not.toHaveBeenCalled();
    });

    it('asks for consent again when a hook command changes in an update from a git repository', async () => {
      const repoDir = path.join(tempHomeDir, 'remote', 'repo.git');
      fs.mkdirSync(repoDir, { recursive: true });
      runGit(repoDir, 'init', '--bare', '--initial-branch=main');
      const publish = (options: SourceOptions) => {
        writeSource(options);
        runGit(sourceDir, 'init', '--initial-branch=main');
        runGit(sourceDir, 'add', '-A');
        runGit(sourceDir, 'commit', '-m', `Version ${options.version}`);
        runGit(sourceDir, 'push', '--force', repoDir, 'HEAD:main');
      };

      publish({ version: '1.0.0', hookCommand: HOOK_V1 });
      await extensionManager.loadExtensions();
      const installed = await extensionManager.installOrUpdateExtension({
        source: pathToFileURL(repoDir).href,
        type: 'git',
      });
      requestConsent.mockClear();
      publish({ version: '1.0.1', hookCommand: HOOK_V2 });

      await settleUpdate(installed);

      expect(consentText()).toContain(
        '  * Hooks: new or changed `SessionStart: echo hook-v2-changed`',
      );
    });
  });

  describe('manifest changes', () => {
    it('asks for consent and keeps the installed version when an MCP server is added', async () => {
      const installed = await installVersion1({ hookCommand: HOOK_V1 });
      requestConsent.mockResolvedValue(false);
      writeSource({
        version: '1.0.1',
        hookCommand: HOOK_V1,
        mcpServers: { demo: { command: 'node', args: ['server.js'] } },
      });

      const outcome = await settleUpdate(installed);

      expect(requestConsent).toHaveBeenCalledWith(
        expect.stringContaining(
          'This extension will run the following MCP servers',
        ),
      );
      expect(outcome).toMatch(/^rejected: [\s\S]*Installation cancelled/);
      expect(readInstalledVersion()).toBe('1.0.0');
    });
  });
});
