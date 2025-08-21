/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import {
  SlashCommand,
  CommandKind,
  SlashCommandActionReturn,
} from './types.js';
import { CodebaseIndexer, IndexProgress, AutoIndexService } from '@google/gemini-cli-core';
import * as path from 'path';

const indexCommand: SlashCommand = {
  name: 'index',
  description: 'Index the entire codebase',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const projectRoot = config.getProjectRoot();
    if (!projectRoot) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No project root found. Please run this command from a project directory.',
      };
    }

    const indexer = CodebaseIndexer.fromConfig(projectRoot, config);
    
    context.ui.addItem({
      type: 'gemini',
      text: 'Starting codebase indexing...\n'
    }, Date.now());

    try {
      const result = await indexer.indexCodebase((progress) => {
        const progressText = formatProgress(progress);
        context.ui.setDebugMessage(progressText);
      });

      if (result.success) {
        const successMessage = formatSuccessMessage(result);
        context.ui.addItem({
          type: 'gemini',
          text: successMessage
        }, Date.now());

        const geminiClient = config.getGeminiClient();
        if (geminiClient) {
          await geminiClient.refreshIndexContext();
        }
      } else {
        const errorMessage = formatErrorMessage(result);
        context.ui.addItem({
          type: 'gemini',
          text: errorMessage
        }, Date.now());
      }
    } catch (error) {
      const errorMessage = `❌ Indexing failed: ${error instanceof Error ? error.message : String(error)}`;
      context.ui.addItem({
        type: 'gemini',
        text: errorMessage
      }, Date.now());
    }
  },
};

const reindexCommand: SlashCommand = {
  name: 'reindex',
  description: 'Index only new/modified files',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const projectRoot = config.getProjectRoot();
    if (!projectRoot) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No project root found. Please run this command from a project directory.',
      };
    }

    const indexer = CodebaseIndexer.fromConfig(projectRoot, config);
    
    context.ui.addItem({
      type: 'gemini',
      text: 'Starting incremental codebase indexing...\n'
    }, Date.now());

    try {
      const result = await indexer.reindexCodebase((progress) => {
        const progressText = formatProgress(progress);
        context.ui.setDebugMessage(progressText);
      });

      if (result.success) {
        const successMessage = formatSuccessMessage(result);
        context.ui.addItem({
          type: 'gemini',
          text: successMessage
        }, Date.now());

        const geminiClient = config.getGeminiClient();
        if (geminiClient) {
          await geminiClient.refreshIndexContext();
        }
      } else {
        const errorMessage = formatErrorMessage(result);
        context.ui.addItem({
          type: 'gemini',
          text: errorMessage
        }, Date.now());
      }
    } catch (error) {
      const errorMessage = `❌ Re-indexing failed: ${error instanceof Error ? error.message : String(error)}`;
      context.ui.addItem({
        type: 'gemini',
        text: errorMessage
      }, Date.now());
    }
  },
};

const deleteCommand: SlashCommand = {
  name: 'delete',
  description: 'Delete the index (.index folder)',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const projectRoot = config.getProjectRoot();
    if (!projectRoot) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No project root found. Please run this command from a project directory.',
      };
    }

    const indexer = CodebaseIndexer.fromConfig(projectRoot, config);
    const status = await indexer.getIndexStatus();

    if (!status.exists) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No index found to delete.',
      };
    }

    if (!context.overwriteConfirmed) {
      const sizeMB = status.sizeBytes ? (status.sizeBytes / (1024 * 1024)).toFixed(1) : 'unknown';
      return {
        type: 'confirm_action',
        prompt: React.createElement(
          Text,
          null,
          'Are you sure you want to delete the codebase index? ',
          React.createElement(Text, { color: Colors.AccentPurple }, `(${sizeMB} MB)`),
        ),
        originalInvocation: {
          raw: context.invocation?.raw || '/codebase delete',
        },
      };
    }

    try {
      await indexer.deleteIndex();
      
      const geminiClient = config.getGeminiClient();
      if (geminiClient) {
        await geminiClient.refreshIndexContext();
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `✅ Index deleted successfully. Freed ${status.sizeBytes ? (status.sizeBytes / (1024 * 1024)).toFixed(1) : 'unknown'} MB of disk space.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ Failed to delete index: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show index status',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const projectRoot = config.getProjectRoot();
    if (!projectRoot) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No project root found. Please run this command from a project directory.',
      };
    }

    const indexer = CodebaseIndexer.fromConfig(projectRoot, config);
    const status = await indexer.getIndexStatus();

    if (!status.exists) {
      return {
        type: 'message',
        messageType: 'info',
        content: '📊 Index Status: No index found\n\nUse /codebase index to create a semantic search index for your codebase.',
      };
    }

    const sizeMB = status.sizeBytes ? (status.sizeBytes / (1024 * 1024)).toFixed(1) : 'unknown';
    const lastUpdated = status.lastUpdated ? status.lastUpdated.toLocaleString() : 'unknown';

    const statusMessage = `📊 Index Status:
• Files indexed: ${status.fileCount || 0}
• Vectors generated: ${status.vectorCount || 0}
• Index size: ${sizeMB} MB
• Last updated: ${lastUpdated}

Index location: ${path.join(projectRoot, '.index')}`;

    return {
      type: 'message',
      messageType: 'info',
      content: statusMessage,
    };
  },
};

const autoCommand: SlashCommand = {
  name: 'auto',
  description: 'Enable automatic index updates for this session',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available',
      };
    }

    const projectRoot = config.getProjectRoot();
    if (!projectRoot) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No project root found. Please run this command from a project directory.',
      };
    }

    const indexer = CodebaseIndexer.fromConfig(projectRoot, config);
    const status = await indexer.getIndexStatus();

    if (!status.exists) {
      context.ui.addItem({
        type: 'gemini',
        text: 'No index found. Creating initial index...\n'
      }, Date.now());

      try {
        const result = await indexer.indexCodebase((progress) => {
          const progressText = formatProgress(progress);
          context.ui.setDebugMessage(progressText);
        });

        if (result.success) {
          const successMessage = formatSuccessMessage(result);
          context.ui.addItem({
            type: 'gemini',
            text: successMessage
          }, Date.now());

          const geminiClient = config.getGeminiClient();
          if (geminiClient) {
            await geminiClient.refreshIndexContext();
          }
        } else {
          const errorMessage = formatErrorMessage(result);
          context.ui.addItem({
            type: 'gemini',
            text: errorMessage
          }, Date.now());
          return;
        }
      } catch (error) {
        const errorMessage = `❌ Failed to create initial index: ${error instanceof Error ? error.message : String(error)}`;
        context.ui.addItem({
          type: 'gemini',
          text: errorMessage
        }, Date.now());
        return;
      }
    }

    context.ui.addItem({
      type: 'gemini',
      text: '🔄 Auto-indexing enabled for this session. Index will be updated automatically when files change.\n'
    }, Date.now());

    const autoIndexService = AutoIndexService.fromConfig(
      projectRoot,
      config,
      (progress) => {
        const progressText = formatProgress(progress);
        context.ui.setDebugMessage(progressText);
      },
      (result) => {
        if (result.success) {
          const successMessage = formatSuccessMessage(result);
          context.ui.addItem({
            type: 'gemini',
            text: `🔄 Auto-update: ${successMessage}`
          }, Date.now());

          const geminiClient = config.getGeminiClient();
          if (geminiClient) {
            geminiClient.refreshIndexContext();
          }
        }
      }
    );

    await autoIndexService.start();

    context.session.autoIndexing = {
      enabled: true,
      projectRoot,
      lastCheck: Date.now(),
      indexer: autoIndexService
    };

    return {
      type: 'message',
      messageType: 'info',
      content: '✅ Auto-indexing enabled. The index will be automatically updated when files change during this session.',
    };
  },
};

export const codebaseCommand: SlashCommand = {
  name: 'codebase',
  description: 'Manage codebase indexing for semantic search',
  kind: CommandKind.BUILT_IN,
  subCommands: [indexCommand, reindexCommand, deleteCommand, statusCommand, autoCommand],
};

function formatProgress(progress: IndexProgress): string {
  const phase = progress.phase;
  const stats = progress.stats;
  
  switch (phase) {
    case 'scanning':
      return `📁 Scanning files... (${stats.totalFiles} found)`;
    case 'processing':
      return `📄 Processing files... (${progress.processedFiles}/${progress.totalFiles})`;
    case 'embedding':
      return `🔗 Generating embeddings... (${progress.currentFile ? path.basename(progress.currentFile) : 'processing'})`;
    case 'saving':
      return `💾 Saving index... (${progress.processedFiles}/${progress.totalFiles})`;
    case 'complete':
      return `✅ Indexing completed`;
    default:
      return 'Processing...';
  }
}

function formatSuccessMessage(result: any): string {
  const stats = result.stats;
  const duration = Math.round(result.duration / 1000);
  const sizeMB = (result.indexSize / (1024 * 1024)).toFixed(1);
  
  if (result.isReindex) {
    return `✅ Incremental indexing completed successfully

📊 Statistics:
• Files scanned: ${stats.totalFiles.toLocaleString()}
• Files processed: ${stats.textFiles.toLocaleString()}
• Files skipped: ${(stats.binaryFiles + stats.largeFiles).toLocaleString()} (binary/large/excluded)
• Text units: ${result.totalVectors.toLocaleString()}
• Vectors generated: ${result.totalVectors.toLocaleString()}
• Index size: ${sizeMB} MB
• Time taken: ${duration}s

Index updated in .index/`;
  } else {
    return `✅ Indexing completed successfully

📊 Statistics:
• Files scanned: ${stats.totalFiles.toLocaleString()}
• Files processed: ${stats.textFiles.toLocaleString()}
• Files skipped: ${(stats.binaryFiles + stats.largeFiles).toLocaleString()} (binary/large/excluded)
• Text units: ${result.totalVectors.toLocaleString()}
• Vectors generated: ${result.totalVectors.toLocaleString()}
• Index size: ${sizeMB} MB
• Time taken: ${duration}s

Index saved to .index/`;
  }
}

function formatErrorMessage(result: any): string {
  return `❌ Indexing failed

Errors:
${result.errors.map((error: string) => `• ${error}`).join('\n')}

Please check your configuration and try again.`;
}
