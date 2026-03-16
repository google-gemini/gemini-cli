/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LspTool } from './lsp-tool.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolResult } from './tools.js';
import path from 'node:path';
import fs from 'node:fs';
import {
  LSP_PARAM_OPERATION,
  LSP_PARAM_FILE_PATH,
} from './definitions/base-declarations.js';

interface LspToolWithPrivateMethods {
  createInvocation(
    params: unknown,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ): { execute(signal: AbortSignal): Promise<ToolResult> };
}

describe('LspTool', () => {
  let mockConfig: unknown;
  let mockMessageBus: unknown;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => process.cwd(),
      validatePathAccess: () => undefined,
      getModel: () => 'gemini-1.5-pro',
    };
    mockMessageBus = {};
  });

  it('should expose the correct parameters schema', () => {
    const tool = new LspTool(
      mockConfig as Config,
      mockMessageBus as MessageBus,
    );

    const schema = tool.schema.parametersJsonSchema as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(schema.properties[LSP_PARAM_OPERATION]).toBeDefined();
    expect(schema.properties[LSP_PARAM_FILE_PATH]).toBeDefined();
    expect(schema.required).toContain(LSP_PARAM_OPERATION);
    expect(schema.required).toContain(LSP_PARAM_FILE_PATH);
  });

  it('should return results for documentSymbols on a .ts file', async () => {
    const tool = new LspTool(
      mockConfig as Config,
      mockMessageBus as MessageBus,
    );

    // Create a dummy .ts file with symbols
    const dummyFile = 'dummy-test-lsp-tool.ts';
    const absolutePath = path.resolve(process.cwd(), dummyFile);
    fs.writeFileSync(absolutePath, 'export function testFunc() { return 1; }');

    try {
      const invocation = (
        tool as unknown as LspToolWithPrivateMethods
      ).createInvocation(
        {
          [LSP_PARAM_OPERATION]: 'documentSymbols',
          [LSP_PARAM_FILE_PATH]: dummyFile,
        },
        mockMessageBus as MessageBus,
      );

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toBeDefined();
      expect(result.llmContent).not.toContain('LSP Error');
      // For typescript-language-server, documentSymbols should return some JSON
      expect(result.llmContent).toContain('testFunc');
    } finally {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }
  }, 20000); // Higher timeout for server spin-up

  it('should return a proactive hint when the server is missing', async () => {
    const tool = new LspTool(
      mockConfig as Config,
      mockMessageBus as MessageBus,
    );

    const invocation = (
      tool as unknown as LspToolWithPrivateMethods
    ).createInvocation(
      {
        [LSP_PARAM_OPERATION]: 'documentSymbols',
        [LSP_PARAM_FILE_PATH]: 'test.go', // assuming gopls is not in the environment
      },
      mockMessageBus as MessageBus,
    );

    // Mock fs.existsSync to return true for test.go
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    try {
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toContain(
        'LSP Error: [LSP Configuration Error]: gopls is missing',
      );
      expect(result.llmContent).toContain('go install');
    } finally {
      existsSpy.mockRestore();
    }
  });
});
