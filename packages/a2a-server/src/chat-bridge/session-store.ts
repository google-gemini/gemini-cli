/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages mapping between Google Chat threads and A2A sessions.
 * Each Google Chat thread maintains a persistent contextId (conversation)
 * and a transient taskId (active task within that conversation).
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
}

/**
 * In-memory session store mapping Google Chat thread names to A2A sessions.
 */
export class SessionStore {
  private sessions = new Map<string, SessionInfo>();

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
  }

  /**
   * Cleans up stale sessions older than the given max age (ms).
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [threadName, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxAgeMs) {
        this.sessions.delete(threadName);
        logger.info(`[ChatBridge] Cleaned up stale session: ${threadName}`);
      }
    }
  }
}
