/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { detectTopLevelPrincipleViolation } from './top-level-principle-validator.js';
import type { GeminiClient } from '../core/client.js';
import { LlmRole } from '../telemetry/types.js';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('detectTopLevelPrincipleViolation', () => {
  let mockClient: {
    generateContent: ReturnType<typeof vi.fn>;
  };
  let tmpDir: string;
  let traceLogPath: string;
  const signal = new AbortController().signal;

  beforeEach(async () => {
    mockClient = {
      generateContent: vi.fn(),
    };
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'top-level-principle-test-'));
    traceLogPath = path.join(tmpDir, 'trace.log');
  });

  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns false immediately if userQuery is empty or only whitespace', async () => {
    const result = await detectTopLevelPrincipleViolation(
      mockClient as unknown as GeminiClient,
      '   ',
      'The agent output.',
      signal,
      'test-prompt',
    );
    expect(result).toBe(false);
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('returns false immediately if agentOutput is empty or only whitespace', async () => {
    const result = await detectTopLevelPrincipleViolation(
      mockClient as unknown as GeminiClient,
      'User query.',
      '\n ',
      signal,
      'test-prompt',
    );
    expect(result).toBe(false);
    expect(mockClient.generateContent).not.toHaveBeenCalled();
  });

  it('returns true if client response contains "VIOLATION"', async () => {
    mockClient.generateContent.mockResolvedValue({
      text: '   VIOLATION\n',
    });

    const result = await detectTopLevelPrincipleViolation(
      mockClient as unknown as GeminiClient,
      'Are you sure?',
      'Yes, I am sure.',
      signal,
      'test-prompt',
    );

    expect(result).toBe(true);
    expect(mockClient.generateContent).toHaveBeenCalledWith(
      { model: 'flash' },
      [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining('You are a strict deterministic Rule Validator'),
            },
          ],
        },
      ],
      signal,
      LlmRole.MAIN,
    );
  });

  it('returns false if client response does not contain "VIOLATION"', async () => {
    mockClient.generateContent.mockResolvedValue({
      text: 'PASS',
    });

    const result = await detectTopLevelPrincipleViolation(
      mockClient as unknown as GeminiClient,
      'Are you sure?',
      'Yes, I am sure.',
      signal,
      'test-prompt',
    );

    expect(result).toBe(false);
  });

  it('returns false if client.generateContent throws (fail-safe)', async () => {
    mockClient.generateContent.mockRejectedValue(new Error('API Error'));

    const result = await detectTopLevelPrincipleViolation(
      mockClient as unknown as GeminiClient,
      'Are you sure?',
      'Yes, I am sure.',
      signal,
      'test-prompt',
    );

    expect(result).toBe(false);
  });

  it('writes debug info to traceLogPath if provided', async () => {
    mockClient.generateContent.mockResolvedValue({
      text: 'PASS',
    });

    const result = await detectTopLevelPrincipleViolation(
      mockClient as unknown as GeminiClient,
      'Are you sure?',
      'Yes, I am sure.',
      signal,
      'test-prompt',
      traceLogPath,
    );

    expect(result).toBe(false);
    expect(fs.existsSync(traceLogPath)).toBe(true);
    const content = fs.readFileSync(traceLogPath, 'utf-8');
    expect(content).toContain('[TopLevelPrincipleValidator] [DEBUG]');
    expect(content).toContain('`detectTopLevelPrincipleViolation` has been called.');
    // Check that it has a valid ISO timestamp format
    const match = content.match(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(match).not.toBeNull();
  });
});
