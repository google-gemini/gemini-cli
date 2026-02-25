/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Config } from '../packages/core/src/config/config.js';
import { ReadFileTool } from '../packages/core/src/tools/read-file.js';
import { ReadManyFilesTool } from '../packages/core/src/tools/read-many-files.ts';
import { GlobTool } from '../packages/core/src/tools/glob.ts';
import { RipGrepTool } from '../packages/core/src/tools/ripGrep.ts';
import { LSTool } from '../packages/core/src/tools/ls.ts';
import { MessageBus } from '../packages/core/src/confirmation-bus/message-bus.js';
import { ApprovalMode } from '../packages/core/src/policy/types.js';
import type {
  ToolInvocation,
  ToolResult,
} from '../packages/core/src/tools/tools.js';

describe('Sensitive Files Hardening', () => {
  let tmpDir: string;
  let config: Config;
  let messageBus: MessageBus;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-test-'));
    tmpDir = await fs.realpath(tmpDir); // Resolve symlinks for consistency

    // Create some sensitive and non-sensitive files
    await fs.writeFile(path.join(tmpDir, 'public.txt'), 'public content');
    await fs.writeFile(path.join(tmpDir, '.env'), 'SECRET_KEY=12345');
    await fs.mkdir(path.join(tmpDir, 'secrets'));
    await fs.writeFile(path.join(tmpDir, 'secrets', 'db.key'), 'database-key');
    await fs.writeFile(path.join(tmpDir, 'id_rsa'), 'private-key');

    config = new Config({
      sessionId: 'test-session',
      targetDir: tmpDir,
      cwd: tmpDir,
      debugMode: false,
      model: 'gemini-2.0-flash',
      approvalMode: ApprovalMode.DEFAULT,
    });

    await config.initialize();

    messageBus = new MessageBus(config.getPolicyEngine(), false);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('ReadFileTool should block access to .env', async () => {
    const tool = new ReadFileTool(config, messageBus);
    expect(() => tool.build({ file_path: '.env' })).toThrow(/Access denied/);
  });

  it('ReadFileTool should block access to files in secrets/ directory', async () => {
    const tool = new ReadFileTool(config, messageBus);
    expect(() => tool.build({ file_path: 'secrets/db.key' })).toThrow(
      /Access denied/,
    );
  });

  it('ReadFileTool should block access to id_rsa', async () => {
    const tool = new ReadFileTool(config, messageBus);
    expect(() => tool.build({ file_path: 'id_rsa' })).toThrow(/Access denied/);
  });

  it('ReadFileTool should allow access to public.txt', async () => {
    const tool = new ReadFileTool(config, messageBus);
    const invocation = tool.build({ file_path: 'public.txt' });
    const result = await (
      invocation as ToolInvocation<unknown, ToolResult>
    ).execute(abortSignal);

    expect(result.error).toBeUndefined();
    expect(result.llmContent).toContain('public content');
  });

  it('ReadManyFilesTool should skip sensitive files', async () => {
    const tool = new ReadManyFilesTool(config, messageBus);
    const invocation = tool.build({ include: ['**/*'] });
    const result = await (
      invocation as ToolInvocation<unknown, ToolResult>
    ).execute(abortSignal);

    const content = JSON.stringify(result.llmContent);
    expect(content).toContain('public content');
    expect(content).not.toContain('SECRET_KEY=12345');
    expect(content).not.toContain('database-key');
    expect(content).not.toContain('private-key');
  });

  it('GlobTool should skip sensitive files', async () => {
    const tool = new GlobTool(config, messageBus);
    const invocation = tool.build({ pattern: '**/*' });
    const result = await (
      invocation as ToolInvocation<unknown, ToolResult>
    ).execute(abortSignal);

    const content = JSON.stringify(result.llmContent);
    expect(content).toContain('public.txt');
    expect(content).not.toContain('.env');
    expect(content).not.toContain('db.key');
    expect(content).not.toContain('id_rsa');
  });

  it('LSTool should skip sensitive files', async () => {
    const tool = new LSTool(config, messageBus);
    const invocation = tool.build({ dir_path: '.' });
    const result = await (
      invocation as ToolInvocation<unknown, ToolResult>
    ).execute(abortSignal);

    const content = JSON.stringify(result.llmContent);
    expect(content).toContain('public.txt');
    expect(content).not.toContain('.env');
    expect(content).not.toContain('secrets');
    expect(content).not.toContain('id_rsa');
  });

  it('RipGrepTool should skip sensitive files', async () => {
    const tool = new RipGrepTool(config, messageBus);
    const invocation = tool.build({ pattern: '.*' });
    const result = await (
      invocation as ToolInvocation<unknown, ToolResult>
    ).execute(abortSignal);

    const content = JSON.stringify(result.llmContent);
    expect(content).toContain('public.txt');
    expect(content).not.toContain('.env');
    expect(content).not.toContain('db.key');
    expect(content).not.toContain('id_rsa');
  });
});
