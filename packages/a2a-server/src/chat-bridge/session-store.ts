/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages mapping between Google Chat threads and A2A sessions.
 * Each Google Chat thread maintains a persistent contextId (conversation)
 * and a transient taskId (active task within that conversation).
 *
 * Supports optional GCS persistence so session mappings survive
 * Cloud Run instance restarts.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export interface PendingToolApproval {
  callId: string;
  taskId: string;
  toolName: string;
}

export interface SessionInfo {
  /** A2A contextId - persists for the lifetime of the Chat thread. */
  contextId: string;
  /** A2A taskId - cleared on terminal states, reused on input-required. */
  taskId?: string;
  /** Space name for async messaging. */
  spaceName: string;
  /** Thread name for async messaging. */
  threadName: string;
  /** Last activity timestamp. */
  lastActivity: number;
  /** Pending tool approval waiting for text-based response. */
  pendingToolApproval?: PendingToolApproval;
  /** When true, all tool calls are auto-approved. */
  yoloMode?: boolean;
  /** When true, an async task is currently processing. */
  asyncProcessing?: boolean;
}

/** Serializable subset of SessionInfo for GCS persistence. */
interface PersistedSession {
  contextId: string;
  taskId?: string;
  spaceName: string;
  threadName: string;
  lastActivity: number;
  yoloMode?: boolean;
}

/**
 * Session store mapping Google Chat thread names to A2A sessions.
 * Optionally backed by GCS for persistence across restarts.
 */
export class SessionStore {
  private sessions = new Map<string, SessionInfo>();
  private gcsBucket?: string;
  private gcsObjectPath = 'chat-bridge/sessions.json';
  private dirty = false;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(gcsBucket?: string) {
    this.gcsBucket = gcsBucket;
    if (gcsBucket) {
      // Flush to GCS every 30 seconds if dirty
      this.flushTimer = setInterval(() => {
        if (this.dirty) {
          this.persistToGCS().catch((err) =>
            logger.warn(`[ChatBridge] GCS session flush failed:`, err),
          );
        }
      }, 30000);
    }
  }

  /**
   * Restores sessions from GCS on startup.
   */
  async restore(): Promise<void> {
    if (!this.gcsBucket) return;

    try {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage();
      const file = storage.bucket(this.gcsBucket).file(this.gcsObjectPath);
      const [exists] = await file.exists();
      if (!exists) {
        logger.info('[ChatBridge] No persisted sessions found in GCS.');
        return;
      }

      const [contents] = await file.download();
      const persisted: PersistedSession[] = JSON.parse(contents.toString());
      for (const s of persisted) {
        this.sessions.set(s.threadName, {
          contextId: s.contextId,
          taskId: s.taskId,
          spaceName: s.spaceName,
          threadName: s.threadName,
          lastActivity: s.lastActivity,
          yoloMode: s.yoloMode,
        });
      }
      logger.info(
        `[ChatBridge] Restored ${persisted.length} sessions from GCS.`,
      );
    } catch (err) {
      logger.warn(`[ChatBridge] Could not restore sessions from GCS:`, err);
    }
  }

  /**
   * Persists current sessions to GCS.
   */
  private async persistToGCS(): Promise<void> {
    if (!this.gcsBucket) return;

    try {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage();
      const file = storage.bucket(this.gcsBucket).file(this.gcsObjectPath);

      const persisted: PersistedSession[] = [];
      for (const session of this.sessions.values()) {
        persisted.push({
          contextId: session.contextId,
          taskId: session.taskId,
          spaceName: session.spaceName,
          threadName: session.threadName,
          lastActivity: session.lastActivity,
          yoloMode: session.yoloMode,
        });
      }

      await file.save(JSON.stringify(persisted), {
        contentType: 'application/json',
      });
      this.dirty = false;
      logger.info(
        `[ChatBridge] Persisted ${persisted.length} sessions to GCS.`,
      );
    } catch (err) {
      logger.warn(`[ChatBridge] Failed to persist sessions to GCS:`, err);
    }
  }

  /**
   * Gets or creates a session for a Google Chat thread.
   */
  getOrCreate(threadName: string, spaceName: string): SessionInfo {
    let session = this.sessions.get(threadName);
    if (!session) {
      session = {
        contextId: uuidv4(),
        spaceName,
        threadName,
        lastActivity: Date.now(),
      };
      this.sessions.set(threadName, session);
      this.dirty = true;
      logger.info(
        `[ChatBridge] New session for thread ${threadName}: contextId=${session.contextId}`,
      );
    }
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Gets an existing session by thread name.
   */
  get(threadName: string): SessionInfo | undefined {
    return this.sessions.get(threadName);
  }

  /**
   * Updates the taskId for a session.
   */
  updateTaskId(threadName: string, taskId: string | undefined): void {
    const session = this.sessions.get(threadName);
    if (session) {
      session.taskId = taskId;
      this.dirty = true;
      logger.info(
        `[ChatBridge] Session ${threadName}: taskId=${taskId ?? 'cleared'}`,
      );
    }
  }

  /**
   * Removes a session (e.g. when bot is removed from space).
   */
  remove(threadName: string): void {
    this.sessions.delete(threadName);
    this.dirty = true;
  }

  /**
   * Cleans up stale sessions older than the given max age (ms).
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [threadName, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxAgeMs) {
        this.sessions.delete(threadName);
        this.dirty = true;
        logger.info(`[ChatBridge] Cleaned up stale session: ${threadName}`);
      }
    }
  }

  /**
   * Forces an immediate flush to GCS.
   */
  async flush(): Promise<void> {
    if (this.dirty) {
      await this.persistToGCS();
    }
  }

  /**
   * Stops the periodic flush timer.
   */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}
