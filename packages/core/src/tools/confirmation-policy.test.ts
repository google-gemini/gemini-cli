/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditTool } from './edit.js';
import { WriteFileTool } from './write-file.js';
import { WebFetchTool } from './web-fetch.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ApprovalMode } from '../policy/types.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import path from 'node:path';
import { isSubpath } from '../utils/paths.js';
import fs from 'node:fs';
import os from 'node:os';

// Mock telemetry loggers to avoid failures
vi.mock('../telemetry/loggers.js', () => ({
  logEditStrategy: vi.fn(),
  logEditCorrectionEvent: vi.fn(),
  logFileOperation: vi.fn(),
}));

describe('Tool Confirmation Policy Updates', () => {
  let mockConfig: any;
  let mockMessageBus: MessageBus;
  const rootDir = path.join(
    os.tmpdir(),
    `gemini-cli-policy-test-${Date.now()}`,
  );

  beforeEach(() => {
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;

    mockConfig = {
      getTargetDir: () => rootDir,
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      setApprovalMode: vi.fn(),
      getFileSystemService: () => ({
        readTextFile: vi.fn().mockImplementation((p) => {
          if (fs.existsSync(p)) {
            return fs.readFileSync(p, 'utf8');
          }
          return 'existing content';
        }),
        writeTextFile: vi.fn().mockImplementation((p, c) => {
          fs.writeFileSync(p, c);
        }),
      }),
      getFileService: () => ({}),
      getFileFilteringOptions: () => ({}),
      getGeminiClient: () => ({}),
      getBaseLlmClient: () => ({}),
      getDisableLLMCorrection: () => true,
      getIdeMode: () => false,
      getWorkspaceContext: () => ({
        isPathWithinWorkspace: () => true,
        getDirectories: () => [rootDir],
      }),
      storage: {
        getProjectTempDir: () => path.join(os.tmpdir(), 'gemini-cli-temp'),
      },
      isPathAllowed(this: Config, absolutePath: string): boolean {
        const workspaceContext = this.getWorkspaceContext();
        if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
          return true;
        }

        const projectTempDir = this.storage.getProjectTempDir();
        return isSubpath(path.resolve(projectTempDir), absolutePath);
      },
      validatePathAccess(this: Config, absolutePath: string): string | null {
        if (this.isPathAllowed(absolutePath)) {
          return null;
        }

        const workspaceDirs = this.getWorkspaceContext().getDirectories();
        const projectTempDir = this.storage.getProjectTempDir();
        return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
      },
    };
  });

  afterEach(() => {
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  const tools = [
    {
      name: 'EditTool',
      create: (config: Config, bus: MessageBus) => new EditTool(config, bus),
      params: {
        file_path: 'test.txt',
        instruction: 'change content',
        old_string: 'existing',
        new_string: 'new',
      },
    },
    {
      name: 'WriteFileTool',
      create: (config: Config, bus: MessageBus) =>
        new WriteFileTool(config, bus),
      params: {
        file_path: path.join(rootDir, 'test.txt'),
        content: 'new content',
      },
    },
    {
      name: 'WebFetchTool',
      create: (config: Config, bus: MessageBus) =>
        new WebFetchTool(config, bus),
      params: {
        prompt: 'fetch https://example.com',
      },
    },
  ];

  describe.each(tools)('$name policy updates', ({ create, params }) => {
    it.each([
      {
        outcome: ToolConfirmationOutcome.ProceedAlways,
        _shouldPublish: false,
        expectedApprovalMode: ApprovalMode.AUTO_EDIT,
      },
      {
        outcome: ToolConfirmationOutcome.ProceedAlwaysAndSave,
        _shouldPublish: true,
        _persist: true,
      },
    ])(
      'should handle $outcome correctly',
      async ({ outcome, expectedApprovalMode }) => {
        const tool = create(mockConfig, mockMessageBus);

        // For file-based tools, ensure the file exists if needed
        if (params.file_path) {
          const fullPath = path.isAbsolute(params.file_path)
            ? params.file_path
            : path.join(rootDir, params.file_path);
          fs.writeFileSync(fullPath, 'existing content');
        }

        const invocation = tool.build(params as any);

        // Mock getMessageBusDecision to trigger ASK_USER flow
        vi.spyOn(invocation as any, 'getMessageBusDecision').mockResolvedValue(
          'ASK_USER',
        );

        const confirmation = await invocation.shouldConfirmExecute(
          new AbortController().signal,
        );
        expect(confirmation).not.toBe(false);

        if (confirmation) {
          await confirmation.onConfirm(outcome);

          // Policy updates are no longer published by onConfirm; they are
          // handled centrally by the schedulers.
          const publishCalls = (mockMessageBus.publish as any).mock.calls;
          const hasUpdatePolicy = publishCalls.some(
            (call: any) => call[0].type === MessageBusType.UPDATE_POLICY,
          );
          expect(hasUpdatePolicy).toBe(false);

          if (expectedApprovalMode !== undefined) {
            // expectedApprovalMode in this test (AUTO_EDIT) is now handled
            // by updatePolicy in the scheduler, so it should not be called
            // here either.
            expect(mockConfig.setApprovalMode).not.toHaveBeenCalled();
          }
        }
      },
    );
  });
});
