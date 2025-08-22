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
  CommandContext,
} from './types.js';
import { CBICodebaseIndexer, IndexProgress, AutoIndexService, Config, IndexResult } from '@google/gemini-cli-core';
import * as path from 'path';

interface IndexingContext {
  config: Config;
  context: CommandContext;
  projectRoot: string;
}

function validateConfigAndProjectRoot(context: CommandContext): { config: Config; projectRoot: string } | SlashCommandActionReturn {
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

  return { config, projectRoot };
}

async function handleIndexingOperation(
  indexingContext: IndexingContext,
  operation: 'index' | 'reindex',
  initialMessage: string,
  errorPrefix: string
): Promise<IndexResult> {
  const { config, context, projectRoot } = indexingContext;
  
  const indexer = CBICodebaseIndexer.fromConfig(projectRoot, config);
  
  context.ui.setPendingItem({
    type: 'gemini',
    text: initialMessage
  });

  try {
    const result = operation === 'index' 
      ? await indexer.indexCodebase((progress) => {
          const progressText = formatProgress(progress);
          context.ui.setPendingItem({
            type: 'gemini',
            text: progressText
          });
        })
      : await indexer.reindexCodebase((progress) => {
          const progressText = formatProgress(progress);
          context.ui.setPendingItem({
            type: 'gemini',
            text: progressText
          });
        });

    context.ui.setPendingItem(null);
    
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
    return result;
  } catch (error) {
    context.ui.setPendingItem(null);
    const errorMessage = `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`;
    context.ui.addItem({
      type: 'gemini',
      text: errorMessage
    }, Date.now());
    return {
      success: false,
      stats: { totalFiles: 0, textFiles: 0, binaryFiles: 0, largeFiles: 0, excludedFiles: 0 },
      totalVectors: 0,
      indexSize: 0,
      duration: 0,
      errors: [errorMessage]
    };
  }
}

const indexCommand: SlashCommand = {
  name: 'index',
  description: 'Index the entire codebase',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const validation = validateConfigAndProjectRoot(context);
    if ('type' in validation) {
      return validation;
    }

    const { config, projectRoot } = validation;
    await handleIndexingOperation(
      { config, context, projectRoot },
      'index',
      'Starting codebase indexing...',
      '❌ Indexing failed'
    );
  },
};

const reindexCommand: SlashCommand = {
  name: 'reindex',
  description: 'Index only new/modified files',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const validation = validateConfigAndProjectRoot(context);
    if ('type' in validation) {
      return validation;
    }

    const { config, projectRoot } = validation;
    await handleIndexingOperation(
      { config, context, projectRoot },
      'reindex',
      'Starting incremental codebase indexing...',
      '❌ Re-indexing failed'
    );
  },
};

const deleteCommand: SlashCommand = {
  name: 'delete',
  description: 'Delete the index (index.cbi file)',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const validation = validateConfigAndProjectRoot(context);
    if ('type' in validation) {
      return validation;
    }

    const { config, projectRoot } = validation;

    const indexer = CBICodebaseIndexer.fromConfig(projectRoot, config);
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
    const validation = validateConfigAndProjectRoot(context);
    if ('type' in validation) {
      return validation;
    }

    const { config, projectRoot } = validation;

    const indexer = CBICodebaseIndexer.fromConfig(projectRoot, config);
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

Index location: ${path.join(projectRoot, 'index.cbi')}`;

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
    const validation = validateConfigAndProjectRoot(context);
    if ('type' in validation) {
      return validation;
    }

    const { config, projectRoot } = validation;
    if (context.session.autoIndexing?.enabled) {
      if (context.session.autoIndexing.projectRoot === projectRoot) {
        return {
          type: 'message',
          messageType: 'info',
          content: '✅ Auto-indexing is already enabled for this project.',
        };
      }
      // Stop the old service if it's for a different project
      context.session.autoIndexing.indexer.stop();
    }

    const indexer = CBICodebaseIndexer.fromConfig(projectRoot, config);
    const status = await indexer.getIndexStatus();

    if (!status.exists) {
      const result = await handleIndexingOperation(
        { config, context, projectRoot },
        'index',
        'No index found. Creating initial index...',
        '❌ Failed to create initial index'
      );
      
      if (!result.success) {
        return {
          type: 'message',
          messageType: 'error',
          content: '❌ Failed to create initial index. Auto-indexing cannot be enabled.',
        };
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
        context.ui.addItem({
          type: 'gemini',
          text: `🔄 Auto-update: ${progressText}`
        }, Date.now());
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
        } else {
          const errorMessage = formatErrorMessage(result);
          context.ui.addItem({
            type: 'gemini',
            text: `🔄 Auto-update failed: ${errorMessage}`
          }, Date.now());
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
      return `${progress.message || '🔍 Scanning files...'} ${progress.detail || `(${stats.totalFiles} found)`}`;
    case 'processing':
      return `${progress.message || '📝 Processing files...'} ${progress.detail || `(${progress.processedFiles}/${progress.totalFiles})`}`;
    case 'embedding':
      if (progress.currentEmbedding && progress.totalEmbeddings) {
        const percent = Math.round((progress.currentEmbedding / progress.totalEmbeddings) * 100);
        return `${progress.message || '🧠 Generating embeddings...'} ${progress.detail || `(${progress.currentEmbedding}/${progress.totalEmbeddings}) ${percent}%`}`;
      }
      return `${progress.message || '🧠 Generating embeddings...'} ${progress.detail || ''}`;
    case 'building_index':
      if (progress.currentVector && progress.totalVectors) {
        const percent = Math.round((progress.currentVector / progress.totalVectors) * 100);
        return `${progress.message || '🔗 Building HNSW index...'} ${progress.detail || `(${progress.currentVector}/${progress.totalVectors}) ${percent}%`}`;
      }
      return `${progress.message || '🔗 Building HNSW index...'} ${progress.detail || ''}`;
    case 'saving':
      return `${progress.message || '💾 Saving index...'} ${progress.detail || ''}`;
    case 'complete':
      return `${progress.message || '✅ Indexing completed'} ${progress.detail || ''}`;
    default:
      return 'Processing...';
  }
}



function formatSuccessMessage(result: IndexResult): string {
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

Index updated in index.cbi`;
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

Index saved to index.cbi`;
  }
}

function formatErrorMessage(result: IndexResult): string {
  return `❌ Indexing failed

Errors:
${result.errors.map((error: string) => `• ${error}`).join('\n')}

Please check your configuration and try again.`;
}
