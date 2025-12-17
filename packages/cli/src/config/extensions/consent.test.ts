/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestConsentNonInteractive,
  requestConsentInteractive,
  maybeRequestConsentOrFail,
  INSTALL_WARNING_MESSAGE,
} from './consent.js';
import type { ConfirmationRequest } from '../../ui/types.js';
import type { ExtensionConfig } from '../extension.js';
import { debugLogger } from '@google/gemini-cli-core';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
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
    });
  });
});
