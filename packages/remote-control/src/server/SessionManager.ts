/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { SessionInfo, RemoteControlOptions } from '../protocol/types.js';

/** Session idle timeout: 10 minutes. */
const DEFAULT_SESSION_EXPIRY_MS = 10 * 60 * 1000;

interface ActiveSession extends SessionInfo {
  /** HMAC-safe hex token used to authenticate remote clients. */
  readonly sessionToken: string;
}

/**
 * Manages the lifecycle of a single remote-control session.
 *
 * Only one session can be active at a time per CLI process.
 */
export class SessionManager {
  private activeSession: ActiveSession | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly expiryMs: number;

  constructor(expiryMs = DEFAULT_SESSION_EXPIRY_MS) {
    this.expiryMs = expiryMs;
  }

  /**
   * Creates a new session and starts the expiry ticker.
   *
   * @throws if a session is already active.
   */
  createSession(options: RemoteControlOptions, port: number): SessionInfo {
    if (this.activeSession) {
      throw new Error(
        'A remote-control session is already active. ' +
          'Stop it with /remote-control stop before starting a new one.',
      );
    }

    const sessionId = uuidv4();
    const sessionToken = this.generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.expiryMs);

    const host = options.host ?? this.getLocalIpAddress();
    const url = `ws://${host}:${port}`;

    const session: ActiveSession = {
      sessionId,
      url,
      token: sessionToken,
      sessionToken,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      projectName: options.name,
    };

    this.activeSession = session;
    this.scheduleExpiry();
    return session;
  }

  /** Returns the current active session, or null. */
  getActiveSession(): SessionInfo | null {
    return this.activeSession;
  }

  /** Resets the idle expiry timer (called on each received message). */
  resetExpiry(): void {
    if (!this.activeSession) return;
    this.activeSession = {
      ...this.activeSession,
      expiresAt: new Date(Date.now() + this.expiryMs).toISOString(),
    };
    this.scheduleExpiry();
  }

  /** Clears the session and cancels the expiry timer. */
  clearSession(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.activeSession = null;
  }

  /**
   * Returns true when the supplied token matches the active session token.
   * Timing-safe comparison is used to prevent timing attacks.
   */
  validateToken(token: string): boolean {
    const expected = this.activeSession?.sessionToken;
    if (!expected) return false;
    // Constant-time comparison via XOR of character codes
    if (expected.length !== token.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return diff === 0;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private generateToken(): string {
    // Use Web Crypto API which is available in Node ≥ 19 (and ≥ 20 is required)
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('hex');
  }

  private getLocalIpAddress(): string {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const addrs = ifaces[name];
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }
    this.expiryTimer = setTimeout(() => {
      this.clearSession();
    }, this.expiryMs);
    // Allow the timer to be GC-ed if the process exits normally
    if (typeof this.expiryTimer.unref === 'function') {
      this.expiryTimer.unref();
    }
  }
}
