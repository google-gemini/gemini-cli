/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { databricksCommand } from './databricksCommand.js';
import { authCommand } from './authCommand.js';
import { validateAuthMethod } from '../../config/auth.js';
import { AuthType } from '@dbx-cli/core';
import { CommandContext } from './types.js';
import { LoadedSettings } from '../../config/settings.js';

// Mock loadEnvironment to prevent loading from .env files during tests
vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    loadEnvironment: vi.fn(),
  };
});

describe('databricksCommand integration with auth system', () => {
  let context: CommandContext;

  beforeEach(() => {
    vi.resetAllMocks();

    // Clear environment variables
    delete process.env.DATABRICKS_URL;
    delete process.env.DBX_PAT;

    // Create a mock context
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
          setValue: vi.fn(),
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

  it('should validate correctly when Databricks is configured and selected', async () => {
    // Given: Valid Databricks configuration
    process.env.DATABRICKS_URL = 'https://workspace.databricks.com';
    process.env.DBX_PAT = 'dapi123456789';

    // When: Validating Databricks auth method
    const result = validateAuthMethod(AuthType.USE_DATABRICKS);

    // Then: Should return null (no error)
    expect(result).toBeNull();
  });

  it('should allow selecting Databricks auth even without configuration', () => {
    // Given: No Databricks configuration
    delete process.env.DATABRICKS_URL;
    delete process.env.DBX_PAT;

    // When: Validating Databricks auth method
    const result = validateAuthMethod(AuthType.USE_DATABRICKS);

    // Then: Should allow selection (users can configure later with /databricks set)
    expect(result).toBeNull();
  });

  it('should enable Databricks auth after configuration', async () => {
    // Given: No initial configuration
    delete process.env.DATABRICKS_URL;
    delete process.env.DBX_PAT;

    // When: Setting configuration and enabling
    context.invocation!.args =
      'set --url="https://workspace.databricks.com" --pat="dapi123456789"';
    await databricksCommand.action!(context, context.invocation!.args);

    context.invocation!.args = 'enable';
    const result = await databricksCommand.action!(
      context,
      context.invocation!.args,
    );

    // Then: Should enable Databricks auth type
    expect(context.services.settings.setValue).toHaveBeenCalledWith(
      expect.any(String),
      'selectedAuthType',
      AuthType.USE_DATABRICKS,
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Databricks authentication enabled.',
    });
  });

  it('should work with auth command dialog flow', async () => {
    // Given: Databricks is configured
    process.env.DATABRICKS_URL = 'https://workspace.databricks.com';
    process.env.DBX_PAT = 'dapi123456789';

    // When: User uses /auth command
    const authResult = await authCommand.action!(context, '');

    // Then: Should open auth dialog
    expect(authResult).toEqual({
      type: 'dialog',
      dialog: 'auth',
    });

    // And: Databricks should be a valid option with no validation errors
    const validationResult = validateAuthMethod(AuthType.USE_DATABRICKS);
    expect(validationResult).toBeNull();
  });

  it('should clear configuration and prevent enabling', async () => {
    // Given: Databricks is configured
    process.env.DATABRICKS_URL = 'https://workspace.databricks.com';
    process.env.DBX_PAT = 'dapi123456789';

    // When: Clearing configuration
    context.invocation!.args = 'clear';
    await databricksCommand.action!(context, context.invocation!.args);

    // Then: Environment variables should be cleared
    expect(process.env.DATABRICKS_URL).toBeUndefined();
    expect(process.env.DBX_PAT).toBeUndefined();

    // And: Trying to enable should fail
    context.invocation!.args = 'enable';
    const result = await databricksCommand.action!(
      context,
      context.invocation!.args,
    );

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: expect.stringContaining('Cannot enable Databricks'),
    });
  });
});
