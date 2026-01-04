/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  requestConsentNonInteractive,
  requestConsentInteractive,
  maybeRequestConsentOrFail,
  INSTALL_WARNING_MESSAGE,
  SKILLS_WARNING_MESSAGE,
} from './consent.js';
import type { ConfirmationRequest } from '../../ui/types.js';
import type { ExtensionConfig } from '../extension.js';
import { debugLogger, type SkillDefinition } from '@google/gemini-cli-core';

const mockReadline = vi.hoisted(() => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn(),
    close: vi.fn(),
  }),
}));

// Mocking readline for non-interactive prompts
vi.mock('node:readline', () => ({
  default: mockReadline,
  createInterface: mockReadline.createInterface,
}));

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

describe('consent', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consent-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('requestConsentNonInteractive', () => {
    it.each([
      { input: 'y', expected: true },
      { input: 'Y', expected: true },
      { input: '', expected: true },
      { input: 'n', expected: false },
      { input: 'N', expected: false },
      { input: 'yes', expected: false },
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
          'Do you want to continue? [Y/n]: ',
          expect.any(Function),
        );
        expect(consent).toBe(expected);
      },
    );
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

        const expectedConsentString = [
          'Installing extension "test-ext".',
          INSTALL_WARNING_MESSAGE,
          'This extension will run the following MCP servers:',
          '  * server1 (local): npm start',
          '  * server2 (remote): https://remote.com',
          'This extension will append info to your gemini.md context using my-context.md',
          'This extension will exclude the following core tools: tool1,tool2',
        ].join('\n');

        expect(requestConsent).toHaveBeenCalledWith(expectedConsentString);
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

        expect(requestConsent).toHaveBeenCalledWith(
          expect.stringContaining(
            '⚠️  This extension contains Hooks which can automatically execute commands.',
          ),
        );
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

        const expectedConsentString = [
          'Installing extension "test-ext".',
          INSTALL_WARNING_MESSAGE,
          'This extension will run the following MCP servers:',
          '  * server1 (local): npm start',
          '  * server2 (remote): https://remote.com',
          'This extension will append info to your gemini.md context using my-context.md',
          'This extension will exclude the following core tools: tool1,tool2',
          '',
          chalk.bold('Agent Skills:'),
          SKILLS_WARNING_MESSAGE,
          'This extension will install the following agent skills:',
          `  * ${chalk.bold('skill1')}: desc1`,
          `    (Location: ${skill1.location}) (2 items in directory)`,
          `  * ${chalk.bold('skill2')}: desc2`,
          `    (Location: ${skill2.location}) (1 items in directory)`,
          '',
        ].join('\n');

        expect(requestConsent).toHaveBeenCalledWith(expectedConsentString);
      });

      it('should show a warning if the skill directory cannot be read', async () => {
        const lockedDir = path.join(tempDir, 'locked');
        await fs.mkdir(lockedDir, { recursive: true, mode: 0o000 });

        const skill: SkillDefinition = {
          name: 'locked-skill',
          description: 'A skill in a locked dir',
          location: path.join(lockedDir, 'SKILL.md'),
          body: 'body',
        };

        const requestConsent = vi.fn().mockResolvedValue(true);
        try {
          await maybeRequestConsentOrFail(
            baseConfig,
            requestConsent,
            false,
            undefined,
            false,
            [skill],
          );

          expect(requestConsent).toHaveBeenCalledWith(
            expect.stringContaining(
              `    (Location: ${skill.location}) ${chalk.red('⚠️ (Could not count items in directory)')}`,
            ),
          );
        } finally {
          // Restore permissions so cleanup works
          await fs.chmod(lockedDir, 0o700);
        }
      });
    });
  });
});
