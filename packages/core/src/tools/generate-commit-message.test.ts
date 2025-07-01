/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { GenerateCommitMessageTool } from './generate-commit-message.js';
import { Config, ApprovalMode } from '../config/config.js';
import { spawn } from 'child_process';
import { GeminiClient } from '../core/client.js';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateContent: vi.fn(),
  })),
}));

interface MockChild extends EventEmitter {
  stdout: { on: Mock };
  stderr: { on: Mock };
  stdin?: { write: Mock; end: Mock; on: Mock };
}

function createMockGitProcess(outputs: Record<string, string>): MockChild {
  const child = new EventEmitter() as MockChild;
  
  child.stdout = {
    on: vi.fn((event: string, listener: (data: Buffer) => void) => {
      if (event === 'data') {
        const args = Object.keys(outputs).find(key => key.includes('status')) || 'default';
        const output = outputs[args] || '';
        listener(Buffer.from(output));
      }
    }),
  };
  
  child.stderr = { on: vi.fn() };
  
  // Simulate successful command execution
  process.nextTick(() => child.emit('close', 0));
  
  return child;
}

describe('GenerateCommitMessageTool', () => {
  let tool: GenerateCommitMessageTool;
  let mockConfig: Config;
  let mockClient: GeminiClient;
  let mockSpawn: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockClient = new GeminiClient({} as Config);
    mockConfig = {
      getGeminiClient: () => mockClient,
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getVerbose: () => false,
    } as unknown as Config;
    
    tool = new GenerateCommitMessageTool(mockConfig);
    mockSpawn = spawn as Mock;
    
    // Mock AI response
    (mockClient.generateContent as Mock).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            text: '```json\n' + JSON.stringify({
              analysis: {
                changedFiles: ['test.js'],
                changeType: 'feat',
                purpose: 'Add test functionality',
                impact: 'Improves testing',
                hasSensitiveInfo: false,
              },
              commitMessage: {
                header: 'feat: add test functionality',
                body: 'Implement new testing features',
              }
            }) + '\n```'
          }]
        }
      }]
    });
  });

  describe('Basic functionality', () => {
    it('should handle no changes scenario', async () => {
      mockSpawn.mockImplementation(() => createMockGitProcess({
        'status': '',
        'diff': '',
      }));

      await expect(tool.execute(undefined, new AbortController().signal))
        .rejects.toThrow('No changes detected to commit');
    });

    it('should generate commit for staged changes', async () => {
      mockSpawn.mockImplementation(() => createMockGitProcess({
        'status': 'M  test.js',
        'diff --cached': 'diff --git a/test.js b/test.js\n+console.log("test");',
        'diff': '',
        'log': 'abc123 Previous commit',
        'write-tree': 'tree-hash-123',
        'commit': '',
      }));

      const result = await tool.execute(undefined, new AbortController().signal);
      expect(result.returnDisplay).toContain('Successfully committed');
      expect(result.returnDisplay).toContain('feat: add test functionality');
    });

    it('should handle unstaged changes', async () => {
      mockSpawn.mockImplementation(() => createMockGitProcess({
        'status': ' M test.js',
        'diff --cached': '',
        'diff': 'diff --git a/test.js b/test.js\n+console.log("test");',
        'log': 'abc123 Previous commit',
        'write-tree': 'tree-hash-123',
        'add': '',
        'commit': '',
      }));

      const result = await tool.execute(undefined, new AbortController().signal);
      expect(result.returnDisplay).toContain('Successfully committed');
    });
  });

  describe('Error handling', () => {
    it('should handle git command failures', async () => {
      mockSpawn.mockImplementation(() => {
        const child = createMockGitProcess({});
        process.nextTick(() => child.emit('close', 1));
        return child;
      });

      await expect(tool.execute(undefined, new AbortController().signal))
        .rejects.toThrow();
    });

    it('should handle AI response failures', async () => {
      (mockClient.generateContent as Mock).mockRejectedValue(new Error('AI Error'));
      
      mockSpawn.mockImplementation(() => createMockGitProcess({
        'status': 'M  test.js',
        'diff --cached': 'diff content',
      }));

      await expect(tool.execute(undefined, new AbortController().signal))
        .rejects.toThrow('AI Error');
    });

    it('should handle invalid AI JSON response', async () => {
      (mockClient.generateContent as Mock).mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: 'invalid json' }] }
        }]
      });
      
      mockSpawn.mockImplementation(() => createMockGitProcess({
        'status': 'M  test.js',
        'diff --cached': 'diff content',
      }));

      await expect(tool.execute(undefined, new AbortController().signal))
        .rejects.toThrow();
    });
  });

  describe('Confirmation workflow', () => {
    beforeEach(() => {
      mockConfig.getApprovalMode = () => ApprovalMode.DEFAULT;
    });

    it('should provide confirmation details', async () => {
      mockSpawn.mockImplementation(() => createMockGitProcess({
        'status': 'M  test.js',
        'diff --cached': 'diff content',
        'diff': '',
        'log': 'abc123 Previous commit',
        'write-tree': 'tree-hash-123',
      }));

      const confirmation = await tool.shouldConfirmExecute(
        undefined, 
        new AbortController().signal
      );
      
      expect(confirmation).toBeTruthy();
      if (confirmation && confirmation.type === 'info') {
        expect(confirmation.title).toBe('Commit Changes');
        expect(confirmation.prompt).toContain('feat: add test functionality');
      }
    });

    it('should skip confirmation in auto mode', async () => {
      mockConfig.getApprovalMode = () => ApprovalMode.AUTO_EDIT;
      
      const confirmation = await tool.shouldConfirmExecute(
        undefined,
        new AbortController().signal
      );
      
      expect(confirmation).toBe(false);
    });
  });

  describe('Tool metadata', () => {
    it('should have correct tool name', () => {
      expect(GenerateCommitMessageTool.Name).toBe('generate_commit_message');
    });

    it('should validate parameters correctly', () => {
      const validation = tool.validateToolParams(undefined);
      expect(validation).toBeNull();
    });

    it('should provide description', () => {
      const description = tool.getDescription(undefined);
      expect(description).toBe('Analyze git changes and create commit.');
    });
  });
});