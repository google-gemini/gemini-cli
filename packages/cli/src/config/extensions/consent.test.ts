/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
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
  const renderResult = render(React.createElement(Text, null, consentString));
  await renderResult.waitUntilReady();
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

  beforeEach(async () => {
    vi.clearAllMocks();
    if (originalReaddir.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockReaddir.mockImplementation(originalReaddir.current as any);
    }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consent-test-'));
  });

  afterEach(async () => {
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
      { input: '', expected: true },
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

        expect(requestConsent).toHaveBeenCalledTimes(1);
        const consentString = requestConsent.mock.calls[0][0] as string;
        await expectConsentSnapshot(consentString);
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
