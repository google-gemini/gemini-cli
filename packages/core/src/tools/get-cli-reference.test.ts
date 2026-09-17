/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { describe, it, expect, vi } from 'vitest';
import { GetCliReferenceTool } from './get-cli-reference.js';
import { GET_CLI_REFERENCE_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

describe('GetCliReferenceTool', () => {
  const mockMessageBus = {
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as MessageBus;

  const tool = new GetCliReferenceTool(mockMessageBus);

  it('should have the correct tool name', () => {
    expect(tool.name).toBe(GET_CLI_REFERENCE_TOOL_NAME);
  });

  it('should have a non-empty description', () => {
    expect(tool.description.length).toBeGreaterThan(0);
  });

  describe('invocation', () => {
    const abortController = new AbortController();

    async function invokeWithCategory(
      category: string | undefined,
    ) {
      const invocation = (tool as any).createInvocation(
        { category },
        mockMessageBus,
      );
      return invocation.execute({ abortSignal: abortController.signal });
    }

    it('should return flags reference for category "flags"', async () => {
      const result = await invokeWithCategory('flags');
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Flags Reference');
      expect(result.llmContent).toContain('--approval-mode');
      expect(result.llmContent).not.toContain('Keyboard Shortcuts Reference');
    });

    it('should return hotkeys reference for category "hotkeys"', async () => {
      const result = await invokeWithCategory('hotkeys');
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Keyboard Shortcuts Reference');
      expect(result.llmContent).toContain('Ctrl+Y');
      expect(result.llmContent).not.toContain('Flags Reference');
    });

    it('should return commands reference for category "commands"', async () => {
      const result = await invokeWithCategory('commands');
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Slash Commands Reference');
      expect(result.llmContent).toContain('/help');
      expect(result.llmContent).not.toContain('Flags Reference');
    });

    it('should return all sections for category "all"', async () => {
      const result = await invokeWithCategory('all');
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Flags Reference');
      expect(result.llmContent).toContain('Keyboard Shortcuts Reference');
      expect(result.llmContent).toContain('Slash Commands Reference');
    });

    it('should default to "all" when no category is provided', async () => {
      const result = await invokeWithCategory(undefined);
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Flags Reference');
      expect(result.llmContent).toContain('Keyboard Shortcuts Reference');
      expect(result.llmContent).toContain('Slash Commands Reference');
    });

    it('should return an error for an invalid category', async () => {
      const result = await invokeWithCategory('invalid_category');
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid category');
      // llmContent must NOT reflect the raw user input (prompt injection defense)
      expect(result.llmContent).not.toContain('invalid_category');
    });

    it('should return an error for a non-string category', async () => {
      const invocation = (tool as any).createInvocation(
        { category: 42 },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: abortController.signal,
      });
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('type');
    });

    it('should return an error for an empty string category', async () => {
      const result = await invokeWithCategory('');
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('empty');
    });

    it('should return an error for a whitespace-only category', async () => {
      const result = await invokeWithCategory('   ');
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('empty');
    });

    it('should be case-insensitive for the category parameter', async () => {
      const result = await invokeWithCategory('FLAGS');
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Flags Reference');
    });

    it('should not require user confirmation', async () => {
      const invocation = (tool as any).createInvocation(
        { category: 'all' },
        mockMessageBus,
      );
      const confirm = await invocation.shouldConfirmExecute(
        abortController.signal,
      );
      expect(confirm).toBe(false);
    });

    it('should provide an accurate description', () => {
      const invocation = (tool as any).createInvocation(
        { category: 'flags' },
        mockMessageBus,
      );
      expect(invocation.getDescription()).toContain('flags');
    });

    it('should include deprecation warnings in flags output', async () => {
      const result = await invokeWithCategory('flags');
      expect(result.llmContent).toContain('DEPRECATED');
      expect(result.llmContent).toContain('--yolo');
    });
  });
});
