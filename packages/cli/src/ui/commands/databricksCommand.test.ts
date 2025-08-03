/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { databricksCommand } from './databricksCommand.js';
import { CommandContext, MessageActionReturn } from './types.js';
import { SettingScope, LoadedSettings } from '../../config/settings.js';
import { AuthType } from '@dbx-cli/core';

// Mock the settings module
vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    loadEnvironment: vi.fn(),
  };
});

describe('databricksCommand', () => {
  let context: CommandContext;
  let mockSetValue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Create mock functions
    mockSetValue = vi.fn();

    // Create a mock context with all required properties
    context = {
      invocation: {
        raw: '/databricks',
        name: 'databricks',
        args: '',
      },
      services: {
        config: null,
        settings: {
          merged: {},
          setValue: mockSetValue,
          system: { path: '', settings: {} },
          user: { path: '', settings: {} },
          workspace: { path: '', settings: {} },
          errors: [],
        } as LoadedSettings,
        git: undefined,
        logger: {
          info: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
        },
      },
      ui: {
        addItem: vi.fn(),
        clear: vi.fn(),
        setDebugMessage: vi.fn(),
        pendingItem: null,
        setPendingItem: vi.fn(),
        loadHistory: vi.fn(),
        toggleCorgiMode: vi.fn(),
        toggleVimEnabled: vi.fn(),
      },
      session: {
        stats: {
          numTokensInput: 0,
          numTokensOutput: 0,
        },
        sessionShellAllowlist: new Set<string>(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('show subcommand', () => {
    it('should display current Databricks configuration when both URL and PAT are set', async () => {
      // Given: Environment variables are set
      process.env.DATABRICKS_URL = 'https://workspace.databricks.com';
      process.env.DBX_PAT = 'dapi123456789';

      // When: User runs /databricks show
      context.invocation!.args = 'show';
      const result = await databricksCommand.action!(context, 'show');

      // Then: Should return a message with current configuration
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Current Databricks configuration:'),
      });
      expect((result as MessageActionReturn).content).toContain(
        'URL: https://workspace.databricks.com',
      );
      expect((result as MessageActionReturn).content).toContain('PAT: dapi******789');
    });

    it('should display "not configured" message when environment variables are not set', async () => {
      // Given: Environment variables are not set
      delete process.env.DATABRICKS_URL;
      delete process.env.DBX_PAT;

      // When: User runs /databricks show
      context.invocation!.args = 'show';
      const result = await databricksCommand.action!(context, 'show');

      // Then: Should return a message indicating no configuration
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Databricks is not configured'),
      });
    });

    it('should display partial configuration when only URL is set', async () => {
      // Given: Only URL is set
      process.env.DATABRICKS_URL = 'https://workspace.databricks.com';
      delete process.env.DBX_PAT;

      // When: User runs /databricks show
      context.invocation!.args = 'show';
      const result = await databricksCommand.action!(context, 'show');

      // Then: Should show URL but indicate PAT is missing
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('URL: https://workspace.databricks.com'),
      });
      expect((result as MessageActionReturn).content).toContain('PAT: not set');
    });
  });

  describe('set subcommand', () => {
    it('should set both URL and PAT when provided valid values', async () => {
      // Given: User provides valid URL and PAT
      const url = 'https://new-workspace.databricks.com';
      const pat = 'dapi987654321';

      // When: User runs /databricks set with URL and PAT
      context.invocation!.args = `set --url="${url}" --pat="${pat}"`;
      const result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should save values and return success message
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksUrl',
        url,
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksPat',
        pat,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Databricks configuration updated successfully'),
      });
    });

    it('should set only URL when PAT is not provided', async () => {
      // Given: User provides only URL
      const url = 'https://new-workspace.databricks.com';

      // When: User runs /databricks set with only URL
      context.invocation!.args = `set --url="${url}"`;
      const result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should save only URL value
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksUrl',
        url,
      );
      expect(mockSetValue).not.toHaveBeenCalledWith(
        SettingScope.User,
        'databricksPat',
        expect.any(String),
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Databricks configuration updated successfully'),
      });
    });

    it('should return error when no parameters are provided to set', async () => {
      // Given: User provides no parameters
      // When: User runs /databricks set without parameters
      context.invocation!.args = 'set';
      const result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should return error message
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('At least one parameter (--url or --pat) is required'),
      });
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should validate URL format and reject invalid URLs', async () => {
      // Given: User provides invalid URL
      const invalidUrl = 'not-a-valid-url';

      // When: User runs /databricks set with invalid URL
      context.invocation!.args = `set --url="${invalidUrl}"`;
      const result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should return error message
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Invalid URL format'),
      });
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should validate PAT format and reject invalid tokens', async () => {
      // Given: User provides invalid PAT (too short)
      const invalidPat = 'short';

      // When: User runs /databricks set with invalid PAT
      context.invocation!.args = `set --pat="${invalidPat}"`;
      const result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should return error message
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Invalid PAT format'),
      });
      expect(mockSetValue).not.toHaveBeenCalled();
    });
  });

  describe('clear subcommand', () => {
    it('should clear Databricks configuration', async () => {
      // Given: Databricks configuration exists
      process.env.DATABRICKS_URL = 'https://workspace.databricks.com';
      process.env.DBX_PAT = 'dapi123456789';

      // When: User runs /databricks clear
      context.invocation!.args = 'clear';
      const result = await databricksCommand.action!(context, 'clear');

      // Then: Should clear values and return success message
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksUrl',
        undefined,
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksPat',
        undefined,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Databricks configuration cleared'),
      });
    });
  });

  describe('enable subcommand', () => {
    it('should enable Databricks auth when configuration is valid', async () => {
      // Given: Valid Databricks configuration exists
      process.env.DATABRICKS_URL = 'https://workspace.databricks.com';
      process.env.DBX_PAT = 'dapi123456789';

      // When: User runs /databricks enable
      context.invocation!.args = 'enable';
      const result = await databricksCommand.action!(context, 'enable');

      // Then: Should enable Databricks auth type
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'selectedAuthType',
        AuthType.USE_DATABRICKS,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Databricks authentication enabled'),
      });
    });

    it('should return error when trying to enable without configuration', async () => {
      // Given: No Databricks configuration
      delete process.env.DATABRICKS_URL;
      delete process.env.DBX_PAT;

      // When: User runs /databricks enable
      context.invocation!.args = 'enable';
      const result = await databricksCommand.action!(context, 'enable');

      // Then: Should return error message
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Cannot enable Databricks'),
      });
      expect(mockSetValue).not.toHaveBeenCalled();
    });
  });

  describe('root command', () => {
    it('should show help when no subcommand is provided', async () => {
      // Given: No subcommand
      // When: User runs /databricks without arguments
      context.invocation!.args = '';
      const result = await databricksCommand.action!(context, '');

      // Then: Should return help message
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Available subcommands:'),
      });
      expect((result as MessageActionReturn).content).toContain('show');
      expect((result as MessageActionReturn).content).toContain('set');
      expect((result as MessageActionReturn).content).toContain('clear');
      expect((result as MessageActionReturn).content).toContain('enable');
    });

    it('should return error for unknown subcommand', async () => {
      // Given: Unknown subcommand
      // When: User runs /databricks with unknown subcommand
      context.invocation!.args = 'unknown';
      const result = await databricksCommand.action!(context, 'unknown');

      // Then: Should return error message
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Unknown subcommand: unknown'),
      });
    });
  });

  describe('argument parsing', () => {
    it('should handle arguments with quotes', async () => {
      // Given: URL and PAT with quotes
      const url = 'https://workspace.databricks.com';
      const pat = 'dapi123456789';

      // When: User runs set with quoted arguments
      context.invocation!.args = `set --url="${url}" --pat="${pat}"`;
      const result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should parse correctly and save values
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksUrl',
        url,
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksPat',
        pat,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('Databricks configuration updated successfully'),
      });
    });

    it('should handle single quotes', async () => {
      // Given: Arguments with single quotes
      const url = 'https://workspace.databricks.com';
      const pat = 'dapi123456789';

      // When: User runs set with single-quoted arguments
      context.invocation!.args = `set --url='${url}' --pat='${pat}'`;
      const _result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should parse correctly
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksUrl',
        url,
      );
    });

    it('should handle equals sign syntax', async () => {
      // Given: Arguments with equals syntax
      const url = 'https://workspace.databricks.com';

      // When: User runs set with equals syntax
      context.invocation!.args = `set --url=${url}`;
      const _result = await databricksCommand.action!(context, context.invocation!.args);

      // Then: Should parse correctly
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'databricksUrl',
        url,
      );
    });
  });
});