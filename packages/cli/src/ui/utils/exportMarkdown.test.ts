/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  generateComprehensiveMarkdown,
  type ExportData,
} from './exportMarkdown.js';

describe('exportMarkdown', () => {
  describe('generateComprehensiveMarkdown', () => {
    const createMockExportData = (
      overrides: Partial<ExportData> = {},
    ): ExportData => ({
      metadata: {
        exportInfo: {
          exportTime: '2025-01-01T12:00:00.000Z',
          cliVersion: '1.0.0',
          gitCommit: 'abc123',
          osVersion: 'linux 20.04',
          modelVersion: 'gemini-1.5-pro',
          selectedAuthType: 'api_key',
          gcpProject: 'test-project',
          sessionId: 'session-123',
          memoryUsage: '128 MB',
          sandboxEnv: 'docker',
        },
        sessionStats: {
          sessionStartTime: '2025-01-01T11:00:00.000Z',
          wallDuration: '1h 0m 0s',
          cumulative: {
            turnCount: 2,
            totalTokenCount: 1000,
            promptTokenCount: 600,
            candidatesTokenCount: 400,
            cachedContentTokenCount: 50,
            toolUsePromptTokenCount: 30,
            thoughtsTokenCount: 20,
            apiTimeMs: 5000,
          },
          currentTurn: {
            promptTokenCount: 100,
            candidatesTokenCount: 80,
          },
        },
        conversationLength: 2,
        coreHistoryLength: 2,
      },
      uiHistory: [
        {
          id: 1,
          type: 'user',
          text: 'Hello, how are you?',
        },
        {
          id: 2,
          type: 'gemini',
          text: 'I am doing well, thank you!',
        },
      ],
      coreHistory: [
        { role: 'user', parts: [{ text: 'Hello, how are you?' }] },
        { role: 'model', parts: [{ text: 'I am doing well, thank you!' }] },
      ],
      ...overrides,
    });

    it('should generate basic markdown structure with metadata', () => {
      const exportData = createMockExportData();
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('# Gemini CLI Conversation Export');
      expect(result).toContain('## 📋 Session Information');
      expect(result).toContain('## 📊 Session Statistics');
      expect(result).toContain('## 💬 Conversation History');
    });

    it('should include session information table', () => {
      const exportData = createMockExportData();
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain(
        '| **Export Time** | 2025-01-01T12:00:00.000Z |',
      );
      expect(result).toContain('| **CLI Version** | 1.0.0 |');
      expect(result).toContain('| **Git Commit** | abc123 |');
      expect(result).toContain('| **OS Version** | linux 20.04 |');
      expect(result).toContain('| **Model Version** | gemini-1.5-pro |');
      expect(result).toContain('| **Auth Type** | api_key |');
      expect(result).toContain('| **GCP Project** | test-project |');
      expect(result).toContain('| **Sandbox Environment** | docker |');
      expect(result).toContain('| **Session ID** | session-123 |');
      expect(result).toContain('| **Memory Usage** | 128 MB |');
    });

    it('should handle missing GCP project with N/A', () => {
      const exportData = createMockExportData({
        metadata: {
          ...createMockExportData().metadata,
          exportInfo: {
            ...createMockExportData().metadata.exportInfo,
            gcpProject: '',
          },
        },
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('| **GCP Project** | N/A |');
    });

    it('should include session statistics with proper formatting', () => {
      const exportData = createMockExportData();
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain(
        '| **Session Start** | 2025-01-01T11:00:00.000Z |',
      );
      expect(result).toContain('| **Total Duration** | 1h 0m 0s |');
      expect(result).toContain('| **Total Turns** | 2 |');
      expect(result).toContain('| **Total Tokens** | 1,000 |');
      expect(result).toContain('| **Prompt Tokens** | 600 |');
      expect(result).toContain('| **Response Tokens** | 400 |');
      expect(result).toContain('| **Total API Time** | 5,000 ms |');
      expect(result).toContain('| **UI History Items** | 2 |');
      expect(result).toContain('| **Core History Items** | 2 |');
    });

    it('should format user messages correctly', () => {
      const exportData = createMockExportData();
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('### Item 1 (ID: 1) - Type: `user`');
      expect(result).toContain('**👤 User Input:**');
      expect(result).toContain('Hello, how are you?');
    });

    it('should format gemini messages correctly', () => {
      const exportData = createMockExportData();
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('### Item 2 (ID: 2) - Type: `gemini`');
      expect(result).toContain('**🤖 Assistant Response:**');
      expect(result).toContain('I am doing well, thank you!');
    });

    it('should format shell commands correctly', () => {
      const exportData = createMockExportData({
        uiHistory: [
          {
            id: 1,
            type: 'user_shell',
            text: 'ls -la',
          },
        ],
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('**💻 Shell Command:**');
      expect(result).toContain('```bash\nls -la\n```');
    });

    it('should format tool group messages correctly', () => {
      const exportData = createMockExportData({
        uiHistory: [
          {
            id: 1,
            type: 'tool_group',
            tools: [
              {
                callId: 'call-123',
                name: 'read_file',
                description: 'Read a file',
                status: 'completed',
                renderOutputAsMarkdown: true,
                resultDisplay: 'File contents here',
              },
            ],
          },
        ],
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('**🔧 Tool Execution Group:**');
      expect(result).toContain('#### Tool 1: `read_file`');
      expect(result).toContain('| **Call ID** | call-123 |');
      expect(result).toContain('| **Name** | read_file |');
      expect(result).toContain('| **Description** | Read a file |');
      expect(result).toContain('| **Status** | completed |');
      expect(result).toContain('| **Render as Markdown** | true |');
      expect(result).toContain('**Tool Result:**');
      expect(result).toContain('```\nFile contents here\n```');
    });

    it('should format info messages correctly', () => {
      const exportData = createMockExportData({
        uiHistory: [
          {
            id: 1,
            type: 'info',
            text: 'This is an info message',
          },
        ],
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('**ℹ️ System Info:**');
      expect(result).toContain('> This is an info message');
    });

    it('should format error messages correctly', () => {
      const exportData = createMockExportData({
        uiHistory: [
          {
            id: 1,
            type: 'error',
            text: 'Something went wrong',
          },
        ],
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('**❌ Error:**');
      expect(result).toContain('> ⚠️ Something went wrong');
    });

    it('should format compression messages correctly', () => {
      const exportData = createMockExportData({
        uiHistory: [
          {
            id: 1,
            type: 'compression',
            compression: {
              isPending: false,
              originalTokenCount: 1000,
              newTokenCount: 500,
            },
          },
        ],
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('**🗜️ Chat Compression:**');
      expect(result).toContain('| **Is Pending** | false |');
      expect(result).toContain('| **Original Tokens** | 1,000 |');
      expect(result).toContain('| **Compressed Tokens** | 500 |');
      expect(result).toContain('| **Compression Ratio** | 50.0% |');
    });

    it('should handle compression with missing token counts', () => {
      const exportData = createMockExportData({
        uiHistory: [
          {
            id: 1,
            type: 'compression',
            compression: {
              isPending: true,
              originalTokenCount: null,
              newTokenCount: null,
            },
          },
        ],
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('| **Original Tokens** | N/A |');
      expect(result).toContain('| **Compressed Tokens** | N/A |');
      expect(result).not.toContain('**Compression Ratio**');
    });

    it('should include core history when available', () => {
      const exportData = createMockExportData();
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('## 🔧 Raw Core Conversation History');
      expect(result).toContain('<details>');
      expect(result).toContain(
        'Click to expand raw API conversation data (2 items)',
      );
      expect(result).toContain('```json');
    });

    it('should not include core history section when empty', () => {
      const exportData = createMockExportData({
        coreHistory: [],
        metadata: {
          ...createMockExportData().metadata,
          coreHistoryLength: 0,
        },
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).not.toContain('## 🔧 Raw Core Conversation History');
    });

    it('should include footer with generation info', () => {
      const exportData = createMockExportData();
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain(
        '*Generated by Gemini CLI v1.0.0 on 2025-01-01T12:00:00.000Z*',
      );
      expect(result).toContain(
        '*Export includes 2 UI history items and 2 core history items*',
      );
    });

    it('should handle unknown message types gracefully', () => {
      const exportData = createMockExportData({
        uiHistory: [
          {
            id: 1,
            type: 'unknown_type',
            someData: 'test data',
          },
        ],
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('**🔍 Unknown Item Type:**');
      expect(result).toContain('```json');
      expect(result).toContain('"someData": "test data"');
    });

    it('should handle empty conversation history', () => {
      const exportData = createMockExportData({
        uiHistory: [],
        metadata: {
          ...createMockExportData().metadata,
          conversationLength: 0,
        },
      });
      const result = generateComprehensiveMarkdown(exportData);

      expect(result).toContain('## 💬 Conversation History');
      expect(result).toContain('*Export includes 0 UI history items');
    });
  });
});
