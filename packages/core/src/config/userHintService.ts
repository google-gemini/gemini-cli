/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service for managing user steering hints during a session.
 */
export class UserHintService {
  private readonly userHints: Array<{ text: string; timestamp: number }> = [];
  private readonly userHintListeners: Set<(hint: string) => void> = new Set();

  constructor(private readonly isEnabled: () => boolean) {}

  /**
   * Adds a new steering hint from the user.
   */
  addUserHint(hint: string): void {
    if (!this.isEnabled()) {
      return;
    }
    const trimmed = hint.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.userHints.push({ text: trimmed, timestamp: Date.now() });
    for (const listener of this.userHintListeners) {
      listener(trimmed);
    }
  }

  /**
   * Registers a listener for new user hints.
   */
  onUserHint(listener: (hint: string) => void): void {
    this.userHintListeners.add(listener);
  }

  /**
   * Unregisters a listener for new user hints.
   */
  offUserHint(listener: (hint: string) => void): void {
    this.userHintListeners.delete(listener);
  }

  /**
   * Returns all collected hints.
   */
  getUserHints(): string[] {
    return this.userHints.map((h) => h.text);
  }

  /**
   * Returns hints added after a specific index.
   */
  getUserHintsAfter(index: number): string[] {
    if (index < 0) {
      return this.getUserHints();
    }
    return this.userHints.slice(index + 1).map((h) => h.text);
  }

  /**
   * Returns the index of the latest hint.
   */
  getLatestHintIndex(): number {
    return this.userHints.length - 1;
  }

  /**
   * Returns the timestamp of the last user hint.
   */
  getLastUserHintAt(): number | null {
    if (this.userHints.length === 0) {
      return null;
    }
    return this.userHints[this.userHints.length - 1].timestamp;
  }

  /**
   * Clears all collected hints.
   */
  clear(): void {
    this.userHints.length = 0;
  }
}
