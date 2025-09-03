/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Config } from '@google/gemini-cli-core';
import type { HistoryItem } from '../types.js';

interface UseAutoSaveOptions {
  config: Config | null;
  history: HistoryItem[];
  onAutoSave: (tag: string) => Promise<void>;
}

interface UseAutoSaveReturn {
  triggerAutoSaveIfNeeded: () => Promise<void>;
  resetMessageCount: () => void;
}

/**
 * Custom hook to handle auto-saving functionality.
 * Tracks user message count and idle timeout to automatically save conversation history.
 */
export function useAutoSave({
  config,
  history,
  onAutoSave,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const userMessageCountRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get auto-save settings from config
  const isAutoSaveEnabled = config?.getAutoSaveEnabled() ?? false;
  const conversationInterval = config?.getAutoSaveConversationInterval() ?? 5;
  const maxSaves = config?.getAutoSaveMaxSaves() ?? 5;
  const idleTimeoutSeconds = config?.getAutoSaveIdleTimeout() ?? 120; // Get idle timeout in seconds

  /**
   * Creates a timestamped auto-save tag
   */
  const createAutoSaveTag = useCallback(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `auto-save-${timestamp}`;
  }, []);

  /**
   * Performs the auto-save operation
   */
  const performAutoSave = useCallback(async () => {
    if (!isAutoSaveEnabled || !config) {
      return;
    }

    const tag = createAutoSaveTag();
    await onAutoSave(tag);
  }, [isAutoSaveEnabled, config, createAutoSaveTag, onAutoSave]);

  /**
   * Cleans up old auto-saves to maintain the maxSaves limit
   */
  const cleanupOldAutoSaves = useCallback(async () => {
    if (!config) return;

    const tempDir = config.storage?.getProjectTempDir();

    if (!tempDir) return;

    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      // Get all auto-save files
      const files = await fs.readdir(tempDir);
      const autoSaveFiles = files
        .filter(
          (file) =>
            file.startsWith('checkpoint-auto-save-') && file.endsWith('.json'),
        )
        .map((file) => ({
          name: file,
          path: path.join(tempDir, file),
          mtime: 0, // Will be filled by stat
        }));

      // Get modification times
      for (const file of autoSaveFiles) {
        try {
          const stats = await fs.stat(file.path);
          file.mtime = stats.mtime.getTime();
        } catch {
          // Ignore files that can't be accessed
        }
      }

      // Sort by modification time (newest first) and remove excess files
      autoSaveFiles.sort((a, b) => b.mtime - a.mtime);

      if (autoSaveFiles.length > maxSaves) {
        const filesToDelete = autoSaveFiles.slice(maxSaves);
        for (const file of filesToDelete) {
          try {
            await fs.unlink(file.path);
          } catch {
            // Ignore errors - file might already be deleted
          }
        }
      }
    } catch {
      // Ignore cleanup errors - not critical
    }
  }, [config, maxSaves]);

  /**
   * Triggers auto-save if conditions are met
   */
  const triggerAutoSaveIfNeeded = useCallback(async () => {
    if (!isAutoSaveEnabled) return;

    // Check message count trigger
    if (userMessageCountRef.current >= conversationInterval) {
      // Perform save first, then cleanup to avoid race conditions
      await performAutoSave();
      userMessageCountRef.current = 0;

      // Clean up old auto-saves after successful save
      await cleanupOldAutoSaves();
    }

    // Update last activity time
    lastActivityRef.current = Date.now();
  }, [
    isAutoSaveEnabled,
    conversationInterval,
    performAutoSave,
    cleanupOldAutoSaves,
  ]);

  /**
   * Resets the message count (typically called after manual save)
   */
  const resetMessageCount = useCallback(() => {
    userMessageCountRef.current = 0;
  }, []);

  /**
   * Sets up and manages idle timeout
   */
  const setupIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }

    if (!isAutoSaveEnabled) return;

    idleTimeoutRef.current = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      const idleThreshold = idleTimeoutSeconds * 1000; // Convert seconds to milliseconds

      if (timeSinceLastActivity >= idleThreshold) {
        // Perform save first, then cleanup to avoid race conditions
        performAutoSave()
          .then(() => {
            cleanupOldAutoSaves();
          })
          .catch(() => {
            // Ignore errors in idle timeout auto-save
          });
      }
    }, idleTimeoutSeconds * 1000);
  }, [
    isAutoSaveEnabled,
    idleTimeoutSeconds,
    performAutoSave,
    cleanupOldAutoSaves,
  ]);

  // Track user messages in history
  useEffect(() => {
    if (!isAutoSaveEnabled || !history.length) return;

    const lastItem = history[history.length - 1];
    if (lastItem?.type === 'user') {
      userMessageCountRef.current += 1;
    }
  }, [history, isAutoSaveEnabled]);

  // Set up idle timeout when auto-save is enabled
  useEffect(() => {
    if (isAutoSaveEnabled) {
      setupIdleTimeout();
    }

    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    };
  }, [isAutoSaveEnabled, setupIdleTimeout]);

  // Update activity time on any history change
  useEffect(() => {
    lastActivityRef.current = Date.now();
    if (isAutoSaveEnabled) {
      setupIdleTimeout();
    }
  }, [history, isAutoSaveEnabled, setupIdleTimeout]);

  return {
    triggerAutoSaveIfNeeded,
    resetMessageCount,
  };
}
