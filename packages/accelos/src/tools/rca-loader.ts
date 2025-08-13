import { createTool } from '@mastra/core';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { defaultConfig } from '../config.js';

interface RCADocument {
  filename: string;
  filepath: string;
  content: string;
  lastModified: Date;
  size: number;
}

export const rcaLoaderTool = createTool({
  id: 'load-rcas',
  description: 'Load RCA (Root Cause Analysis) documents from a directory of markdown files into memory with pagination support',
  inputSchema: z.object({
    directory: z.string().optional().describe('Path to the directory containing RCA markdown files (uses configured default if not provided)'),
    pattern: z.string().default('*.md').describe('File pattern to match (default: *.md)'),
    recursive: z.boolean().default(false).describe('Whether to search subdirectories recursively'),
    page: z.number().default(1).describe('Page number to load (starting from 1)'),
    pageSize: z.number().default(5).describe('Number of RCA documents per page'),
    maxContentLength: z.number().default(50000).describe('Maximum content length per RCA document (characters)'),
    includeMetadataOnly: z.boolean().default(false).describe('If true, only return file metadata without content'),
  }),
  outputSchema: z.object({
    rcas: z.array(z.object({
      filename: z.string(),
      filepath: z.string(),
      content: z.string().optional(),
      contentTruncated: z.boolean().optional(),
      lastModified: z.string(),
      size: z.number(),
    })),
    pagination: z.object({
      currentPage: z.number(),
      pageSize: z.number(),
      totalPages: z.number(),
      totalFiles: z.number(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean(),
    }),
    summary: z.object({
      totalFiles: z.number(),
      totalSize: z.number(),
      directory: z.string(),
      loadedAt: z.string(),
      filesInCurrentPage: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const { directory = defaultConfig.rcaDirectoryPath, recursive, page, pageSize, maxContentLength, includeMetadataOnly } = context;

    try {
      // Verify directory exists
      const stats = await fs.stat(directory);
      if (!stats.isDirectory()) {
        throw new Error(`Path ${directory} is not a directory`);
      }

      const rcas: RCADocument[] = [];
      
      // Function to process files in a directory
      const processDirectory = async (dirPath: string): Promise<void> => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory() && recursive) {
            await processDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            try {
              const fileStats = await fs.stat(fullPath);
              
              // For metadata-only mode, don't read content
              let content = '';
              if (!includeMetadataOnly) {
                content = await fs.readFile(fullPath, 'utf-8');
              }
              
              rcas.push({
                filename: entry.name,
                filepath: fullPath,
                content,
                lastModified: fileStats.mtime,
                size: fileStats.size,
              });
            } catch (fileError) {
              console.warn(`Failed to read file ${fullPath}:`, fileError);
            }
          }
        }
      };

      await processDirectory(directory);

      // Sort by last modified date (newest first)
      rcas.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      // Calculate pagination
      const totalFiles = rcas.length;
      const totalPages = Math.ceil(totalFiles / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalFiles);
      
      // Get current page items
      const paginatedRcas = rcas.slice(startIndex, endIndex);
      
      const totalSize = rcas.reduce((sum, rca) => sum + rca.size, 0);

      return {
        rcas: paginatedRcas.map(rca => {
          let content = rca.content;
          let contentTruncated = false;
          
          // Truncate content if it exceeds maxContentLength
          if (!includeMetadataOnly && content.length > maxContentLength) {
            content = content.substring(0, maxContentLength) + '\n\n[Content truncated...]';
            contentTruncated = true;
          }
          
          return {
            filename: rca.filename,
            filepath: rca.filepath,
            ...(includeMetadataOnly ? {} : { content, contentTruncated }),
            lastModified: rca.lastModified.toISOString(),
            size: rca.size,
          };
        }),
        pagination: {
          currentPage: page,
          pageSize,
          totalPages,
          totalFiles,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        summary: {
          totalFiles,
          totalSize,
          directory,
          loadedAt: new Date().toISOString(),
          filesInCurrentPage: paginatedRcas.length,
        },
      };
    } catch (error) {
      throw new Error(`Failed to load RCAs from ${directory}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});