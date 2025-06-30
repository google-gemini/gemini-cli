/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from 'react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '@google/gemini-cli-core';

const TOKEN_LIMIT = 1_048_576; // Default token limit, could be made configurable

// --- Interface Definitions ---

export interface FileContextInfo {
  filepath: string;
  size: number;
  estimatedTokens: number;
  addedAt: Date;
  lastAccessed: Date;
  processedByGemini: boolean;
  processedAt: number;
}

export interface FileContextState {
  files: Map<string, FileContextInfo>;
  totalTokens: number;
  totalFiles: number;
}

export interface FileContextActions {
  addFile: (
    filepath: string,
  ) => Promise<{ success: boolean; error?: string; info?: FileContextInfo }>;
  removeFile: (filepath: string) => boolean;
  clearContext: () => void;
  getFileInfo: (filepath: string) => FileContextInfo | undefined;
  isFileInContext: (filepath: string) => boolean;
  getContextStatus: () => {
    files: number;
    processedFiles: number;
    pendingFiles: number;
    tokens: number;
    percentage: number;
  };
  updateFileAccess: (filepath: string) => void;
  markFileAsProcessedByGemini: (filepath: string) => void;
  getGeminiContextFiles: () => string[];
  getPendingFiles: () => string[];
}

interface FileContextValue {
  state: FileContextState;
  actions: FileContextActions;
}

// --- Context Definition ---

const FileContextContext = createContext<FileContextValue | undefined>(
  undefined,
);

// --- Helper Functions ---

/**
 * Estimate token count for a file based on its size
 * Rough approximation: 1 token ≈ 4 characters for English text
 */
function estimateTokenCount(fileSize: number): number {
  return Math.ceil(fileSize / 4);
}

/**
 * Get file information including size and estimated tokens
 */
async function getFileInfoFromFS(
  filepath: string,
  config: Config,
): Promise<FileContextInfo | null> {
  try {
    const absolutePath = path.resolve(config.getTargetDir(), filepath);
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      return null; // Directories are not supported for context
    }

    return {
      filepath,
      size: stats.size,
      estimatedTokens: estimateTokenCount(stats.size),
      addedAt: new Date(),
      lastAccessed: new Date(),
      processedByGemini: false,
      processedAt: 0,
    };
  } catch (_error) {
    return null;
  }
}

// --- Provider Component ---

interface FileContextProviderProps {
  children: React.ReactNode;
  config: Config;
}

export const FileContextProvider: React.FC<FileContextProviderProps> = ({
  children,
  config,
}) => {
  const [files, setFiles] = useState<Map<string, FileContextInfo>>(new Map());

  const totalTokens = useMemo(() => {
    let total = 0;
    for (const fileInfo of files.values()) {
      total += fileInfo.estimatedTokens;
    }
    return total;
  }, [files]);

  const totalFiles = useMemo(() => files.size, [files]);

  const addFile = useCallback(
    async (filepath: string) => {
      console.log(`[DEBUG] addFile called with: ${filepath}`);

      const fileInfo = await getFileInfoFromFS(filepath, config);
      if (!fileInfo) {
        console.log(`[DEBUG] Failed to get file info for: ${filepath}`);
        return {
          success: false,
          error: `Could not read file '${filepath}'`,
        };
      }

      setFiles((prevFiles) => {
        // Check if file is already in context using the current state
        if (prevFiles.has(filepath)) {
          console.log(`[DEBUG] File already exists: ${filepath}`);
          return prevFiles; // Don't update if already exists
        }

        console.log(`[DEBUG] Adding file to context: ${filepath}`);
        const newFiles = new Map(prevFiles);
        newFiles.set(filepath, fileInfo);
        console.log(
          `[DEBUG] Context now has ${newFiles.size} files: ${Array.from(newFiles.keys()).join(', ')}`,
        );
        return newFiles;
      });

      return {
        success: true,
        info: fileInfo,
      };
    },
    [config],
  );

  const removeFile = useCallback((filepath: string) => {
    let wasRemoved = false;

    setFiles((prevFiles) => {
      if (prevFiles.has(filepath)) {
        wasRemoved = true;
        const newFiles = new Map(prevFiles);
        newFiles.delete(filepath);
        return newFiles;
      }
      return prevFiles;
    });

    return wasRemoved;
  }, []);

  const clearContext = useCallback(() => {
    setFiles(new Map());
  }, []);

  const getFileInfo = useCallback(
    (filepath: string) => files.get(filepath),
    [files],
  );

  const isFileInContext = useCallback(
    (filepath: string) => files.has(filepath),
    [files],
  );

  const getContextStatus = useCallback(() => {
    const fileEntries = Array.from(files.entries());
    const totalTokens = fileEntries.reduce(
      (sum: number, [_, fileInfo]: [string, FileContextInfo]) =>
        sum + (fileInfo.estimatedTokens || 0),
      0,
    );
    const processedFiles = fileEntries.filter(
      ([_, fileInfo]: [string, FileContextInfo]) => fileInfo.processedByGemini,
    );
    const pendingFiles = fileEntries.filter(
      ([_, fileInfo]: [string, FileContextInfo]) => !fileInfo.processedByGemini,
    );

    console.log(
      `[DEBUG] getContextStatus - Total files: ${fileEntries.length}, Processed: ${processedFiles.length}, Pending: ${pendingFiles.length}`,
    );
    console.log(
      `[DEBUG] All files: ${fileEntries.map(([path, info]) => `${path}(${info.processedByGemini ? 'processed' : 'pending'})`).join(', ')}`,
    );

    return {
      files: fileEntries.length,
      processedFiles: processedFiles.length,
      pendingFiles: pendingFiles.length,
      tokens: totalTokens,
      percentage: Math.round((totalTokens / TOKEN_LIMIT) * 100),
    };
  }, [files]);

  const updateFileAccess = useCallback((filepath: string) => {
    setFiles((prevFiles) => {
      const fileInfo = prevFiles.get(filepath);
      if (fileInfo) {
        const newFiles = new Map(prevFiles);
        newFiles.set(filepath, {
          ...fileInfo,
          lastAccessed: new Date(),
        });
        return newFiles;
      }
      return prevFiles;
    });
  }, []);

  const markFileAsProcessedByGemini = useCallback((filepath: string) => {
    console.log(`[DEBUG] markFileAsProcessedByGemini called with: ${filepath}`);

    setFiles((prev) => {
      const newFiles = new Map(prev);
      const fileInfo = newFiles.get(filepath);
      if (fileInfo) {
        console.log(`[DEBUG] Marking file as processed: ${filepath}`);
        newFiles.set(filepath, {
          ...fileInfo,
          processedByGemini: true,
          processedAt: Date.now(),
        });

        const processedFiles = Array.from(newFiles.entries())
          .filter(([_, info]) => info.processedByGemini)
          .map(([path, _]) => path);
        console.log(`[DEBUG] Processed files: ${processedFiles.join(', ')}`);
      } else {
        console.log(
          `[DEBUG] File not found for marking as processed: ${filepath}`,
        );
      }
      return newFiles;
    });
  }, []);

  const getGeminiContextFiles = useCallback(() => {
    const processedFiles = Array.from(files.entries())
      .filter(([_, fileInfo]) => fileInfo.processedByGemini)
      .map(([filePath, _]) => filePath);

    console.log(
      `[DEBUG] getGeminiContextFiles - Returning: ${processedFiles.join(', ')}`,
    );
    return processedFiles;
  }, [files]);

  const getPendingFiles = useCallback(() => {
    const pendingFiles = Array.from(files.entries())
      .filter(([_, fileInfo]) => !fileInfo.processedByGemini)
      .map(([filePath, _]) => filePath);

    console.log(
      `[DEBUG] getPendingFiles - Returning: ${pendingFiles.join(', ')}`,
    );
    return pendingFiles;
  }, [files]);

  const state: FileContextState = useMemo(
    () => ({
      files,
      totalTokens,
      totalFiles,
    }),
    [files, totalTokens, totalFiles],
  );

  const actions: FileContextActions = useMemo(
    () => ({
      addFile,
      removeFile,
      clearContext,
      getFileInfo,
      isFileInContext,
      getContextStatus,
      updateFileAccess,
      markFileAsProcessedByGemini,
      getGeminiContextFiles,
      getPendingFiles,
    }),
    [
      addFile,
      removeFile,
      clearContext,
      getFileInfo,
      isFileInContext,
      getContextStatus,
      updateFileAccess,
      markFileAsProcessedByGemini,
      getGeminiContextFiles,
      getPendingFiles,
    ],
  );

  const value: FileContextValue = useMemo(
    () => ({
      state,
      actions,
    }),
    [state, actions],
  );

  return (
    <FileContextContext.Provider value={value}>
      {children}
    </FileContextContext.Provider>
  );
};

// --- Consumer Hook ---

export const useFileContext = () => {
  const context = useContext(FileContextContext);
  if (context === undefined) {
    throw new Error('useFileContext must be used within a FileContextProvider');
  }
  return context;
};
