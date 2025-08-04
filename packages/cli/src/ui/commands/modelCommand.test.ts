/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelCommand } from './modelCommand.js';
import { AuthType } from '@dbx-cli/core';
import type { CommandContext } from './types.js';
import type { Config } from '@dbx-cli/core';

// Mock the discoverDatabricksEndpoints function
vi.mock('@dbx-cli/core', async () => {
  const actual = await vi.importActual('@dbx-cli/core');
  return {
    ...actual,
    discoverDatabricksEndpoints: vi.fn(),
  };
});

describe('modelCommand - Detroit School TDD Tests', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  
  beforeEach(async () => {
    vi.resetAllMocks();
    
    // Import after vi.mock is in place
    const { discoverDatabricksEndpoints } = await import('@dbx-cli/core');
    
    // Default mock implementation - returns fallback models
    (discoverDatabricksEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      'databricks-claude-sonnet-4',
      'databricks-claude-opus-4',
      'databricks-llama-4-maverick',
      'databricks-meta-llama-3-3-70b-instruct',
      'databricks-meta-llama-3-1-8b-instruct',
    ]);
    
    // Create mock config with real behavior
    mockConfig = {
      getModel: vi.fn().mockReturnValue('databricks-claude-sonnet-4'),
      setModel: vi.fn(),
    } as unknown as Config;
    
    // Create mock context
    mockContext = {
      services: {
        config: mockConfig,
        settings: {
          merged: {
            selectedAuthType: AuthType.USE_DATABRICKS,
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('State-Based Tests for /model Command', () => {
    describe('Given: User types /model with no arguments', () => {
      describe('When: Command is executed', () => {
        it('Then: Should return help message showing available subcommands', async () => {
          const result = await modelCommand.action(mockContext, '');
          
          expect(result).toEqual({
            type: 'message',
            messageType: 'info',
            content: expect.stringContaining('Available subcommands:'),
          });
          expect(result.content).toContain('/model show');
          expect(result.content).toContain('/model set');
          expect(result.content).toContain('/model list');
        });
      });
    });

    describe('Given: User types /model show', () => {
      describe('When: Command is executed with Databricks auth', () => {
        it('Then: Should return current model information', async () => {
          const result = await modelCommand.action(mockContext, 'show');
          
          expect(result).toEqual({
            type: 'message',
            messageType: 'info',
            content: expect.stringContaining('Current model: databricks-claude-sonnet-4'),
          });
          expect(result.content).toContain('Provider: Databricks');
        });
      });

      describe('When: Command is executed with Gemini auth', () => {
        it('Then: Should show Gemini model information', async () => {
          mockContext.services.settings.merged.selectedAuthType = AuthType.USE_GEMINI;
          mockConfig.getModel = vi.fn().mockReturnValue('gemini-2.5-pro');
          
          const result = await modelCommand.action(mockContext, 'show');
          
          expect(result).toEqual({
            type: 'message',
            messageType: 'info',
            content: expect.stringContaining('Current model: gemini-2.5-pro'),
          });
          expect(result.content).toContain('Provider: Gemini');
        });
      });
    });

    describe('Given: User types /model list', () => {
      describe('When: Command is executed with Databricks auth', () => {
        it('Then: Should return dynamically fetched Databricks endpoints', async () => {
          // Mock the dynamic endpoint discovery
          const mockEndpoints = [
            'databricks-claude-sonnet-4',
            'databricks-llama-3-1-70b',
            'databricks-mistral-7b',
          ];
          
          const { discoverDatabricksEndpoints } = await import('@dbx-cli/core');
          (discoverDatabricksEndpoints as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockEndpoints);
          
          const result = await modelCommand.action(mockContext, 'list');
          
          expect(result).toEqual({
            type: 'message',
            messageType: 'info',
            content: expect.stringMatching(/Available Databricks models \(fetched from workspace\):/),
          });
          
          // Should show the dynamically fetched models
          mockEndpoints.forEach(model => {
            expect(result.content).toContain(model);
          });
        });
      });

      describe('When: Command is executed with Gemini auth', () => {
        it('Then: Should return available Gemini models', async () => {
          mockContext.services.settings.merged.selectedAuthType = AuthType.USE_GEMINI;
          
          const result = await modelCommand.action(mockContext, 'list');
          
          expect(result).toEqual({
            type: 'message',
            messageType: 'info',
            content: expect.stringContaining('Available Gemini models:'),
          });
          expect(result.content).toContain('gemini-2.5-pro');
          expect(result.content).toContain('gemini-1.5-pro');
        });
      });

      describe('When: Databricks endpoint discovery fails', () => {
        it('Then: Should show error and fall back to static list', async () => {
          // Clear module cache to ensure fresh import
          vi.resetModules();
          
          // Re-import and set up the rejection mock
          const { discoverDatabricksEndpoints } = await import('@dbx-cli/core');
          (discoverDatabricksEndpoints as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
          
          // Re-import the command to use the updated mock
          const { modelCommand: freshModelCommand } = await import('./modelCommand.js');
          
          const result = await freshModelCommand.action(mockContext, 'list');
          
          expect(result).toEqual({
            type: 'message',
            messageType: 'error',
            content: expect.stringContaining('Failed to fetch endpoints from workspace'),
          });
          expect(result.content).toContain('Showing cached models:');
        });
      });
    });

    describe('Given: User types /model set <model-name>', () => {
      describe('When: Setting a valid Databricks model', () => {
        it('Then: Should update the model configuration', async () => {
          const { discoverDatabricksEndpoints } = await import('@dbx-cli/core');
          (discoverDatabricksEndpoints as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            'databricks-claude-sonnet-4',
            'databricks-llama-3-1-70b',
            'databricks-mistral-7b',
          ]);
          
          const result = await modelCommand.action(mockContext, 'set databricks-llama-3-1-70b');
          
          expect(mockConfig.setModel).toHaveBeenCalledWith('databricks-llama-3-1-70b');
          expect(result).toEqual({
            type: 'message',
            messageType: 'info',
            content: 'Model updated to: databricks-llama-3-1-70b',
          });
        });
      });

      describe('When: Setting an invalid model for current provider', () => {
        it('Then: Should return error message', async () => {
          const result = await modelCommand.action(mockContext, 'set gemini-2.5-pro');
          
          expect(mockConfig.setModel).not.toHaveBeenCalled();
          expect(result).toEqual({
            type: 'message',
            messageType: 'error',
            content: expect.stringContaining('Invalid model for Databricks provider'),
          });
          expect(result.content).toContain('Use /model list');
        });
      });

      describe('When: Setting model without providing name', () => {
        it('Then: Should return usage error', async () => {
          const result = await modelCommand.action(mockContext, 'set');
          
          expect(mockConfig.setModel).not.toHaveBeenCalled();
          expect(result).toEqual({
            type: 'message',
            messageType: 'error',
            content: 'Usage: /model set <model-name>',
          });
        });
      });
    });

    describe('Given: User types invalid subcommand', () => {
      describe('When: Command is executed', () => {
        it('Then: Should return error with help text', async () => {
          const result = await modelCommand.action(mockContext, 'invalid-subcommand');
          
          expect(result).toEqual({
            type: 'message',
            messageType: 'error',
            content: expect.stringContaining('Unknown subcommand: invalid-subcommand'),
          });
          expect(result.content).toContain('Available subcommands:');
        });
      });
    });
  });

  describe('Integration Tests with Provider Switching', () => {
    describe('Given: User switches from Databricks to Gemini provider', () => {
      describe('When: Listing models after switch', () => {
        it('Then: Should show models for new provider', async () => {
          // Start with Databricks
          let result = await modelCommand.action(mockContext, 'list');
          expect(result.content).toContain('Databricks models');
          
          // Switch to Gemini
          mockContext.services.settings.merged.selectedAuthType = AuthType.USE_GEMINI;
          
          // List models again
          result = await modelCommand.action(mockContext, 'list');
          expect(result.content).toContain('Gemini models');
          expect(result.content).not.toContain('Databricks models');
        });
      });
    });
  });
});