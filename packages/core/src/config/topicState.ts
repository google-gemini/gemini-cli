/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages the current active topic title for a session.
 * Hosted within the Config instance for session-scoping.
 */
export class TopicState {
  private activeTopicTitle?: string;

  /**
   * Sanitizes and sets the topic title.
   * @returns true if the input was valid and set, false otherwise.
   */
  setTopic(title?: string): boolean {
    const sanitizedTitle = title?.trim().replace(/[\r\n]+/g, ' ');

    if (!sanitizedTitle) return false;

    this.activeTopicTitle = sanitizedTitle;

    return true;
  }

  getTopic(): string | undefined {
    return this.activeTopicTitle;
  }

  reset(): void {
    this.activeTopicTitle = undefined;
  }
}
