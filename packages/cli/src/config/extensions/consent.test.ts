/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { render, cleanup } from '../../test-utils/render.js';
import {
  requestConsentNonInteractive,
  requestConsentInteractive,
  maybeRequestConsentOrFail,
} from './consent.js';
import type { ConfirmationRequest } from '../../ui/types.js';
import type { ExtensionConfig } from '../extension.js';
import { debugLogger, type SkillDefinition } from '@google/gemini-cli-core';
import { ContentMarker } from './contentSignature.js';
import type {
  ExtensionContentSummary,
  HooksSummary,
} from './extensionContentSummary.js';

const mockReadline = vi.hoisted(() => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn(),
    close: vi.fn(),
  }),
}));

const mockReaddir = vi.hoisted(() => vi.fn());
const originalReaddir = vi.hoisted(() => ({
  current: null as typeof fs.readdir | null,
}));

// Mocking readline for non-interactive prompts
vi.mock('node:readline', () => ({
  default: mockReadline,
  createInterface: mockReadline.createInterface,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  originalReaddir.current = actual.readdir;
  return {
    ...actual,
    readdir: mockReaddir,
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
    },
  };
});

async function expectConsentSnapshot(consentString: string) {
  const renderResult = await render(
    React.createElement(Text, null, consentString),
  );
  await expect(renderResult).toMatchSvgSnapshot();
}

/**
 * Normalizes a consent string for snapshot testing by:
 * 1. Replacing the dynamic temp directory path with a static placeholder.
 * 2. Converting Windows backslashes to forward slashes for platform-agnosticism.
 */
function normalizePathsForSnapshot(str: string, tempDir: string): string {
  return str.replaceAll(tempDir, '/mock/temp/dir').replaceAll('\\', '/');
}

describe('consent', () => {
  let tempDir: string;
  const originalStdinIsTTY = process.stdin.isTTY;

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    if (originalReaddir.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockReaddir.mockImplementation(originalReaddir.current as any);
    }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consent-test-'));
  });

  afterEach(async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      configurable: true,
    });
    vi.restoreAllMocks();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    cleanup();
  });

  describe('requestConsentNonInteractive', () => {
    it.each([
      { input: 'y', expected: true },
      { input: 'Y', expected: true },
      { input: '', expected: false },
      { input: 'n', expected: false },
      { input: 'N', expected: false },
      { input: 'yes', expected: true },
    ])(
      'should return $expected for input "$input"',
      async ({ input, expected }) => {
        const questionMock = vi.fn().mockImplementation((_, callback) => {
          callback(input);
        });
        mockReadline.createInterface.mockReturnValue({
          question: questionMock,
          close: vi.fn(),
        });

        const consent = await requestConsentNonInteractive('Test consent');
        expect(debugLogger.log).toHaveBeenCalledWith('Test consent');
        expect(questionMock).toHaveBeenCalledWith(
          'Do you want to continue? [y/N]: ',
          expect.any(Function),
        );
        expect(consent).toBe(expected);
      },
    );

    it('should fail closed and return false when readline closes on EOF without an answer', async () => {
      let closeHandler: (() => void) | undefined;
      const questionMock = vi.fn().mockImplementation(() => {
        closeHandler?.();
      });
      mockReadline.createInterface.mockReturnValue({
        question: questionMock,
        on: vi.fn().mockImplementation((event: string, cb: () => void) => {
          if (event === 'close') {
            closeHandler = cb;
          }
        }),
        close: vi.fn(),
      });

      const consent = await requestConsentNonInteractive('Test consent');
      expect(debugLogger.log).toHaveBeenCalledWith('Test consent');
      expect(consent).toBe(false);
    });
  });

  describe('requestConsentInteractive', () => {
    it.each([
      { confirmed: true, expected: true },
      { confirmed: false, expected: false },
    ])(
      'should resolve with $expected when user confirms with $confirmed',
      async ({ confirmed, expected }) => {
        const addExtensionUpdateConfirmationRequest = vi
          .fn()
          .mockImplementation((request: ConfirmationRequest) => {
            request.onConfirm(confirmed);
          });

        const consent = await requestConsentInteractive(
          'Test consent',
          addExtensionUpdateConfirmationRequest,
        );

        expect(addExtensionUpdateConfirmationRequest).toHaveBeenCalledWith({
          prompt: 'Test consent\n\nDo you want to continue?',
          onConfirm: expect.any(Function),
        });
        expect(consent).toBe(expected);
      },
    );

    it('should clear the active confirmation request before resolving', async () => {
      const clearConfirmationRequest = vi.fn();
      const steps: string[] = [];
      const addExtensionUpdateConfirmationRequest = vi
        .fn()
        .mockImplementation((request: ConfirmationRequest) => {
          steps.push('prompted');
          request.onConfirm(true);
          steps.push('confirmed');
        });

      const consentPromise = requestConsentInteractive(
        'Test consent',
        addExtensionUpdateConfirmationRequest,
        () => {
          steps.push('cleared');
          clearConfirmationRequest();
        },
      ).then((consent) => {
        steps.push('resolved');
        return consent;
      });

      expect(clearConfirmationRequest).toHaveBeenCalledTimes(1);
      expect(steps).toEqual(['prompted', 'cleared', 'confirmed']);
      await expect(consentPromise).resolves.toBe(true);
      expect(steps).toEqual(['prompted', 'cleared', 'confirmed', 'resolved']);
    });
  });

  describe('maybeRequestConsentOrFail', () => {
    const baseConfig: ExtensionConfig = {
      name: 'test-ext',
      version: '1.0.0',
    };

    it('should request consent if there is no previous config', async () => {
      const requestConsent = vi.fn().mockResolvedValue(true);
      await maybeRequestConsentOrFail(
        baseConfig,
        requestConsent,
        false,
        undefined,
      );
      expect(requestConsent).toHaveBeenCalledTimes(1);
    });

    it('should not request consent if configs are identical', async () => {
      const requestConsent = vi.fn().mockResolvedValue(true);
      await maybeRequestConsentOrFail(
        baseConfig,
        requestConsent,
        false,
        baseConfig,
        false,
      );
      expect(requestConsent).not.toHaveBeenCalled();
    });

    it('should throw an error if consent is denied', async () => {
      const requestConsent = vi.fn().mockResolvedValue(false);
      await expect(
        maybeRequestConsentOrFail(baseConfig, requestConsent, false, undefined),
      ).rejects.toThrow('Installation cancelled for "test-ext".');
    });

    it('should request consent when transitioning from a non-linked extension to a linked extension', async () => {
      const requestConsent = vi.fn().mockResolvedValue(true);
      await maybeRequestConsentOrFail(
        baseConfig,
        requestConsent,
        false,
        baseConfig,
        false,
        [],
        [],
        false,
        '/canonical/linked/path',
        undefined,
      );
      expect(requestConsent).toHaveBeenCalledTimes(1);
    });

    it('should request consent when linkedSourcePath changes between updates', async () => {
      const requestConsent = vi.fn().mockResolvedValue(true);
      await maybeRequestConsentOrFail(
        baseConfig,
        requestConsent,
        false,
        baseConfig,
        false,
        [],
        [],
        false,
        '/new/canonical/linked/path',
        '/old/canonical/linked/path',
      );
      expect(requestConsent).toHaveBeenCalledTimes(1);
    });

    it('should not request consent when linkedSourcePath and previousLinkedSourcePath are identical', async () => {
      const requestConsent = vi.fn().mockResolvedValue(true);
      await maybeRequestConsentOrFail(
        baseConfig,
        requestConsent,
        false,
        baseConfig,
        false,
        [],
        [],
        false,
        '/same/canonical/linked/path',
        '/same/canonical/linked/path',
      );
      expect(requestConsent).not.toHaveBeenCalled();
    });

    describe('consent string generation', () => {
      it('should generate a consent string with all fields', async () => {
        const config: ExtensionConfig = {
          ...baseConfig,
          mcpServers: {
            server1: { command: 'npm', args: ['start'] },
            server2: { httpUrl: 'https://remote.com' },
          },
          contextFileName: 'my-context.md',
          excludeTools: ['tool1', 'tool2'],
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          config,
          requestConsent,
          false,
          undefined,
        );

        expect(requestConsent).toHaveBeenCalledTimes(1);
        const consentString = requestConsent.mock.calls[0][0] as string;
        await expectConsentSnapshot(consentString);
      });

      it('should sort environment variables alphabetically and handle undefined envValue', async () => {
        const config: ExtensionConfig = {
          ...baseConfig,
          mcpServers: {
            server1: {
              command: 'node',
              args: ['server.js'],
              env: {
                VAR_B: 'b',
                VAR_A: 'a',
                VAR_C: undefined as unknown as string,
              },
            },
          },
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          config,
          requestConsent,
          false,
          undefined,
        );

        expect(requestConsent).toHaveBeenCalledTimes(1);
        const consentString = requestConsent.mock.calls[0][0] as string;
        expect(consentString).toContain('      - VAR_A: a');
        expect(consentString).toContain('      - VAR_B: b');
        expect(consentString).toContain('      - VAR_C: ');

        const posA = consentString.indexOf('      - VAR_A: a');
        const posB = consentString.indexOf('      - VAR_B: b');
        const posC = consentString.indexOf('      - VAR_C: ');
        expect(posA).toBeLessThan(posB);
        expect(posB).toBeLessThan(posC);
      });

      it('should mask sensitive environment variables, headers, and OAuth parameters', async () => {
        const config: ExtensionConfig = {
          ...baseConfig,
          mcpServers: {
            server1: {
              command: 'node',
              args: ['server.js'],
              env: {
                SAFE_VAR: 'safe-value',
                SUPER_TOKEN: 'secret-token-123',
                DB_PASSWORD: 'my-password',
              },
              headers: {
                'X-API-Key': 'some-api-key',
                Authorization: 'Bearer 12345',
                'Content-Type': 'application/json',
              },
              oauth: {
                clientId: 'my-client-id',
                clientSecret: 'secret-oauth-value',
              },
            },
          },
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          config,
          requestConsent,
          false,
          undefined,
        );

        expect(requestConsent).toHaveBeenCalledTimes(1);
        const consentString = requestConsent.mock.calls[0][0] as string;

        // Assert sensitive env values are masked
        expect(consentString).toContain('      - SAFE_VAR: safe-value');
        expect(consentString).toContain('      - SUPER_TOKEN: ********');
        expect(consentString).toContain('      - DB_PASSWORD: ********');

        // Assert sensitive headers are masked
        expect(consentString).toContain(
          '      - Content-Type: application/json',
        );
        expect(consentString).toContain('      - Authorization: ********');
        expect(consentString).toContain('      - X-API-Key: ********');

        // Assert sensitive OAuth parameters are masked
        expect(consentString).toContain('      - clientId: my-client-id');
        expect(consentString).toContain('      - clientSecret: ********');
      });

      it('should request consent if mcpServers change', async () => {
        const prevConfig: ExtensionConfig = { ...baseConfig };
        const newConfig: ExtensionConfig = {
          ...baseConfig,
          mcpServers: { server1: { command: 'npm', args: ['start'] } },
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          newConfig,
          requestConsent,
          false,
          prevConfig,
          false,
        );
        expect(requestConsent).toHaveBeenCalledTimes(1);
      });

      it('should request consent if mcpServer env changes', async () => {
        const prevConfig: ExtensionConfig = {
          ...baseConfig,
          mcpServers: {
            server1: { command: 'node', args: ['server.js'] },
          },
        };
        const newConfig: ExtensionConfig = {
          ...baseConfig,
          mcpServers: {
            server1: {
              command: 'node',
              args: ['server.js'],
              env: { NODE_OPTIONS: '--require=./payload.js' },
            },
          },
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          newConfig,
          requestConsent,
          false,
          prevConfig,
          false,
        );
        expect(requestConsent).toHaveBeenCalledTimes(1);
      });

      it('should request consent if contextFileName changes', async () => {
        const prevConfig: ExtensionConfig = { ...baseConfig };
        const newConfig: ExtensionConfig = {
          ...baseConfig,
          contextFileName: 'new-context.md',
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          newConfig,
          requestConsent,
          false,
          prevConfig,
          false,
        );
        expect(requestConsent).toHaveBeenCalledTimes(1);
      });

      it('should request consent if excludeTools changes', async () => {
        const prevConfig: ExtensionConfig = { ...baseConfig };
        const newConfig: ExtensionConfig = {
          ...baseConfig,
          excludeTools: ['new-tool'],
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          newConfig,
          requestConsent,
          false,
          prevConfig,
          false,
        );
        expect(requestConsent).toHaveBeenCalledTimes(1);
      });

      it('should include warning when hooks are present', async () => {
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          baseConfig,
          requestConsent,
          true,
          undefined,
        );

        expect(requestConsent).toHaveBeenCalledTimes(1);
        const consentString = requestConsent.mock.calls[0][0] as string;
        await expectConsentSnapshot(consentString);
      });

      it('should request consent if hooks status changes', async () => {
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          baseConfig,
          requestConsent,
          true,
          baseConfig,
          false,
        );
        expect(requestConsent).toHaveBeenCalledTimes(1);
      });

      it('should request consent if extension is migrated', async () => {
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          baseConfig,
          requestConsent,
          false,
          { ...baseConfig, name: 'old-ext' },
          false,
          [],
          [],
          true,
        );

        expect(requestConsent).toHaveBeenCalledTimes(1);
        let consentString = requestConsent.mock.calls[0][0] as string;
        consentString = normalizePathsForSnapshot(consentString, tempDir);
        await expectConsentSnapshot(consentString);
      });

      it('should request consent if skills change', async () => {
        const skill1Dir = path.join(tempDir, 'skill1');
        const skill2Dir = path.join(tempDir, 'skill2');
        await fs.mkdir(skill1Dir, { recursive: true });
        await fs.mkdir(skill2Dir, { recursive: true });
        await fs.writeFile(path.join(skill1Dir, 'SKILL.md'), 'body1');
        await fs.writeFile(path.join(skill1Dir, 'extra.txt'), 'extra');
        await fs.writeFile(path.join(skill2Dir, 'SKILL.md'), 'body2');

        const skill1: SkillDefinition = {
          name: 'skill1',
          description: 'desc1',
          location: path.join(skill1Dir, 'SKILL.md'),
          body: 'body1',
        };
        const skill2: SkillDefinition = {
          name: 'skill2',
          description: 'desc2',
          location: path.join(skill2Dir, 'SKILL.md'),
          body: 'body2',
        };

        const config: ExtensionConfig = {
          ...baseConfig,
          mcpServers: {
            server1: { command: 'npm', args: ['start'] },
            server2: { httpUrl: 'https://remote.com' },
          },
          contextFileName: 'my-context.md',
          excludeTools: ['tool1', 'tool2'],
        };
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          config,
          requestConsent,
          false,
          undefined,
          false,
          [skill1, skill2],
        );

        expect(requestConsent).toHaveBeenCalledTimes(1);
        let consentString = requestConsent.mock.calls[0][0] as string;
        consentString = normalizePathsForSnapshot(consentString, tempDir);
        await expectConsentSnapshot(consentString);
      });

      it('should show a warning if the skill directory cannot be read', async () => {
        const lockedDir = path.join(tempDir, 'locked');
        await fs.mkdir(lockedDir, { recursive: true });

        const skill: SkillDefinition = {
          name: 'locked-skill',
          description: 'A skill in a locked dir',
          location: path.join(lockedDir, 'SKILL.md'),
          body: 'body',
        };

        // Mock readdir to simulate a permission error.
        // We do this instead of using fs.mkdir(..., { mode: 0o000 }) because
        // directory permissions work differently on Windows and 0o000 doesn't
        // effectively block access there, leading to test failures in Windows CI.
        mockReaddir.mockRejectedValueOnce(
          new Error('EACCES: permission denied, scandir'),
        );

        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          baseConfig,
          requestConsent,
          false,
          undefined,
          false,
          [skill],
        );

        expect(requestConsent).toHaveBeenCalledTimes(1);
        let consentString = requestConsent.mock.calls[0][0] as string;
        consentString = normalizePathsForSnapshot(consentString, tempDir);
        await expectConsentSnapshot(consentString);
      });
    });

    describe('content summaries', () => {
      const signature = 'a'.repeat(64);
      const otherSignature = 'b'.repeat(64);

      function hooksSummary(
        overrides: Partial<HooksSummary> = {},
      ): HooksSummary {
        return {
          hooks: [{ eventName: 'SessionStart', command: 'echo v1', env: [] }],
          files: [],
          referencedPaths: [],
          signature,
          ...overrides,
        };
      }

      async function consentTextFor(
        current: ExtensionContentSummary,
        previous?: ExtensionContentSummary,
      ): Promise<string | undefined> {
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          baseConfig,
          requestConsent,
          false,
          previous ? baseConfig : undefined,
          false,
          [],
          [],
          false,
          undefined,
          undefined,
          { current, previous },
        );
        return requestConsent.mock.calls[0]?.[0] as string | undefined;
      }

      it('lists each hook with its details, the paths it uses, and a signature', async () => {
        const text = await consentTextFor({
          hooks: hooksSummary({
            hooks: [
              {
                eventName: 'BeforeTool',
                matcher: 'run_shell_command',
                command: 'node ${extensionPath}/scripts/check.js',
                env: [
                  ['API_TOKEN', 'abc'],
                  ['LOG_LEVEL', 'debug'],
                ],
              },
              {
                eventName: 'SessionStart',
                name: 'greeting',
                command: 'echo `id`',
                env: [],
              },
              { eventName: 'SessionEnd', type: 'runtime', env: [] },
            ],
            referencedPaths: [
              { path: '.', marker: ContentMarker.Root, signature },
              {
                path: '../shared.sh',
                marker: ContentMarker.Outside,
                signature,
              },
              { path: 'scripts/check.js', signature },
              {
                path: 'scripts/gone.js',
                marker: ContentMarker.Missing,
                signature,
              },
            ],
          }),
        });

        expect(text).toContain(
          [
            '⚠️  This extension contains Hooks which can automatically execute commands:',
            '  * BeforeTool (matcher: `run_shell_command`): `node ${extensionPath}/scripts/check.js`',
            '      Environment variables:',
            '        - API_TOKEN: ********',
            '        - LOG_LEVEL: `debug`',
            '  * SessionStart (name: `greeting`): `` echo `id` ``',
            '  * SessionEnd: no command, type `runtime`',
            '  Files used by hooks: `.` (the extension folder), `../shared.sh` (outside the extension folder), `scripts/check.js`, `scripts/gone.js` (not found)',
            `  Hooks signature: ${signature}`,
          ].join('\n'),
        );
      });

      it('escapes control characters in hook values', async () => {
        const text = await consentTextFor({
          hooks: hooksSummary({
            hooks: [
              {
                eventName: 'Session\u202eStart',
                command: 'echo hi\n\u001b[2J\r',
                env: [['MODE', 'a\tb']],
              },
            ],
          }),
        });

        expect(text).toContain(
          '  * Session\\u202eStart: `echo hi\\n\\u001b[2J\\r`',
        );
        expect(text).toContain('        - MODE: `a\\tb`');
      });

      it('says when hooks.json is not a valid hooks file', async () => {
        const text = await consentTextFor({
          hooks: hooksSummary({ hooks: undefined }),
        });

        expect(text).toContain(
          "  * `hooks/hooks.json` isn't a valid hooks file, so its hooks can't be listed.",
        );
        expect(text).toContain(`  Hooks signature: ${signature}`);
      });

      it('prints no hooks section when the summary has no hooks', async () => {
        const text = await consentTextFor({});

        expect(text).not.toContain('Hooks');
      });

      it('does not ask for consent when both summaries match', async () => {
        const text = await consentTextFor(
          { hooks: hooksSummary() },
          { hooks: hooksSummary() },
        );

        expect(text).toBeUndefined();
      });

      it('asks for consent when only the hooks signature changes', async () => {
        const text = await consentTextFor(
          { hooks: hooksSummary({ signature: otherSignature }) },
          { hooks: hooksSummary() },
        );

        expect(text).toContain(`  Hooks signature: ${otherSignature}`);
      });

      it('shows the changes after the warnings without comparing them', async () => {
        const current = {
          hooks: hooksSummary({
            hooks: [{ eventName: 'SessionStart', command: 'echo v2', env: [] }],
            signature: otherSignature,
          }),
        };
        const installText = await consentTextFor(current);

        const updateText = await consentTextFor(current, {
          hooks: hooksSummary(),
        });

        expect(updateText).toBe(
          [
            installText,
            '',
            'Changes since the installed version:',
            '  * Hooks: new or changed `SessionStart: echo v2`',
          ].join('\n'),
        );
      });

      it('names the files and referenced paths that were added, changed, or removed', async () => {
        const text = await consentTextFor(
          {
            hooks: hooksSummary({
              files: [
                { path: 'hooks/a.sh', type: 'file', value: otherSignature },
                { path: 'hooks/new.sh', type: 'file', value: signature },
              ],
              referencedPaths: [{ path: 'scripts/run.js', signature }],
              signature: otherSignature,
            }),
          },
          {
            hooks: hooksSummary({
              files: [
                { path: 'hooks/a.sh', type: 'file', value: signature },
                { path: 'hooks/old.sh', type: 'file', value: signature },
              ],
            }),
          },
        );

        expect(text).toContain(
          [
            'Changes since the installed version:',
            '  * Hooks: `hooks/a.sh` changed',
            '  * Hooks: `hooks/new.sh` added',
            '  * Hooks: `hooks/old.sh` removed',
            '  * Hooks: `scripts/run.js` added',
          ].join('\n'),
        );
      });

      it('adds the imported files and a signature to the context file line', async () => {
        const text = await consentTextFor({
          contextFiles: {
            paths: ['GEMINI.md'],
            importedPaths: ['docs/rules.md'],
            files: [],
            signature,
          },
        });

        expect(text).toContain(
          [
            'This extension will append info to your gemini.md context using GEMINI.md',
            '  Imported files: `docs/rules.md`',
            `  Context files signature: ${signature}`,
          ].join('\n'),
        );
      });

      it('keeps the context file line without a signature when the declared file is missing', async () => {
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          { ...baseConfig, contextFileName: 'CONTEXT.md' },
          requestConsent,
          false,
          undefined,
          false,
          [],
          [],
          false,
          undefined,
          undefined,
          { current: {} },
        );

        const text = requestConsent.mock.calls[0][0] as string;
        expect(text).toContain(
          'This extension will append info to your gemini.md context using CONTEXT.md\n',
        );
        expect(text).not.toContain('Context files signature');
      });

      it('names the context files that changed', async () => {
        const contextFiles = {
          paths: ['GEMINI.md'],
          importedPaths: [],
          signature,
        };

        const text = await consentTextFor(
          {
            contextFiles: {
              ...contextFiles,
              files: [{ path: 'GEMINI.md', type: 'file', value: 'v2' }],
              signature: otherSignature,
            },
          },
          {
            contextFiles: {
              ...contextFiles,
              files: [{ path: 'GEMINI.md', type: 'file', value: 'v1' }],
            },
          },
        );

        expect(text).toMatch(
          /Changes since the installed version:\n {2}\* Context files: `GEMINI\.md` changed$/,
        );
      });

      it('lists skills with paths relative to the extension folder and a signature', async () => {
        const requestConsent = vi.fn().mockResolvedValue(true);
        await maybeRequestConsentOrFail(
          baseConfig,
          requestConsent,
          false,
          undefined,
          false,
          [],
          [],
          false,
          undefined,
          undefined,
          {
            current: {
              skills: {
                skills: [
                  {
                    name: 'demo',
                    description: 'Demo skill',
                    location: 'skills/demo/SKILL.md',
                    itemCount: 2,
                    signature,
                  },
                  {
                    name: 'other',
                    description: 'Other\u202e skill',
                    location: 'skills/other/SKILL.md',
                    signature,
                  },
                ],
                files: [],
                signature: otherSignature,
              },
            },
          },
        );

        const text = stripAnsi(requestConsent.mock.calls[0][0] as string);
        expect(text).toContain(
          [
            'This extension will install the following agent skills:',
            '',
            '  * demo: Demo skill',
            '    (Source: skills/demo/SKILL.md) (2 items in directory)',
            '',
            '  * other: Other\\u202e skill',
            '    (Source: skills/other/SKILL.md) ⚠️ (Could not count items in directory)',
            '',
            `  Skills signature: ${otherSignature}`,
          ].join('\n'),
        );
      });

      it('names the skills that changed', async () => {
        const skill = {
          name: 'demo',
          description: 'Demo skill',
          location: 'skills/demo/SKILL.md',
          itemCount: 1,
        };

        const text = await consentTextFor(
          {
            skills: {
              skills: [{ ...skill, signature: otherSignature }],
              files: [],
              signature: otherSignature,
            },
          },
          {
            skills: { skills: [{ ...skill, signature }], files: [], signature },
          },
        );

        expect(text).toMatch(
          /Changes since the installed version:\n {2}\* Skills: `skills\/demo` changed$/,
        );
      });

      it('lists sub-agents with their MCP servers, the files they use, and a signature', async () => {
        const text = await consentTextFor({
          agents: {
            agents: [
              { path: 'agents/broken.md', mcpServers: [] },
              {
                path: 'agents/release-helper.md',
                name: 'release-helper',
                mcpServers: [
                  [
                    'tracker',
                    {
                      command: 'node',
                      args: ['${extensionPath}/servers/tracker.js'],
                      env: { API_TOKEN: 'abc', LOG_LEVEL: 'debug' },
                      trust: true,
                    },
                  ],
                ],
              },
              {
                path: 'agents/remote.md',
                name: 'remote-helper',
                agentCardUrl: 'https://example.com/card.json',
                mcpServers: [],
              },
            ],
            referencedPaths: [{ path: 'servers/tracker.js', signature }],
            files: [],
            signature,
          },
        });

        expect(text).toContain(
          [
            'This extension will add the following sub-agents:',
            "  * `agents/broken.md` isn't a valid sub-agent file.",
            '  * `release-helper` (`agents/release-helper.md`)',
            '      MCP server `tracker` (local): `node ${extensionPath}/servers/tracker.js`',
            '      Environment variables:',
            '        - API_TOKEN: ********',
            '        - LOG_LEVEL: `debug`',
            '      Trust: true',
            '  * `remote-helper` (`agents/remote.md`)',
            '      Agent card URL: `https://example.com/card.json`',
            '  Files used by MCP servers: `servers/tracker.js`',
            `  Agents signature: ${signature}`,
          ].join('\n'),
        );
      });

      it('lists custom commands and policy files with a signature each', async () => {
        const text = await consentTextFor({
          commands: {
            files: [
              {
                path: 'commands/release/notes.toml',
                type: 'file',
                value: signature,
              },
              {
                path: 'commands/shared',
                type: 'link',
                value: ContentMarker.Outside,
              },
            ],
            signature,
          },
          policies: {
            files: [
              { path: 'policies/release.toml', type: 'file', value: signature },
            ],
            signature: otherSignature,
          },
        });

        expect(text).toContain(
          [
            'This extension will add the following custom commands:',
            '  * `commands/release/notes.toml`',
            '  * `commands/shared` (outside the extension folder)',
            `  Commands signature: ${signature}`,
            'This extension will add the following policy files:',
            '  * `policies/release.toml`',
            `  Policies signature: ${otherSignature}`,
          ].join('\n'),
        );
      });

      it('names the sub-agents, custom commands, and policy files that changed', async () => {
        const agents = { agents: [], referencedPaths: [] };

        const text = await consentTextFor(
          {
            agents: {
              ...agents,
              files: [{ path: 'agents/triage.md', type: 'file', value: 'v2' }],
              signature: otherSignature,
            },
            commands: {
              files: [{ path: 'commands/tag.toml', type: 'file', value: 'v1' }],
              signature,
            },
          },
          {
            agents: {
              ...agents,
              files: [{ path: 'agents/triage.md', type: 'file', value: 'v1' }],
              signature,
            },
            policies: {
              files: [{ path: 'policies/old.toml', type: 'file', value: 'v1' }],
              signature,
            },
          },
        );

        expect(text).toContain(
          [
            'Changes since the installed version:',
            '  * Sub-agents: `agents/triage.md` changed',
            '  * Custom commands: `commands/tag.toml` added',
            '  * Policies: `policies/old.toml` removed',
          ].join('\n'),
        );
      });
    });
  });

  describe('skillsConsentString', () => {
    it('should generate a consent string for skills', async () => {
      const skill1Dir = path.join(tempDir, 'skill1');
      await fs.mkdir(skill1Dir, { recursive: true });
      await fs.writeFile(path.join(skill1Dir, 'SKILL.md'), 'body1');

      const skill1: SkillDefinition = {
        name: 'skill1',
        description: 'desc1',
        location: path.join(skill1Dir, 'SKILL.md'),
        body: 'body1',
      };

      const { skillsConsentString } = await import('./consent.js');
      let consentString = await skillsConsentString(
        [skill1],
        'https://example.com/repo.git',
        '/mock/target/dir',
      );

      consentString = normalizePathsForSnapshot(consentString, tempDir);
      await expectConsentSnapshot(consentString);
    });
  });
});
