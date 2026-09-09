/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages the current active topic title and tactical intent for a session.
 * Hosted within the Config instance for session-scoping.
 */
export class TopicState {
  private activeTopicTitle?: string;
  private activeIntent?: string;

  /**
   * Sanitizes and sets the topic title and/or intent.
   * @returns true if the input was valid and set, false otherwise.
   */
  setTopic(title?: string, intent?: string): boolean {
    const sanitizedTitle = title?.trim().replace(/[\r\n]+/g, ' ');
    const sanitizedIntent = intent?.trim().replace(/[\r\n]+/g, ' ');

    if (!sanitizedTitle && !sanitizedIntent) return false;

    if (sanitizedTitle) {
      this.activeTopicTitle = sanitizedTitle;
    }

    if (sanitizedIntent) {
      this.activeIntent = sanitizedIntent;
    }

    return true;
  }

  getTopic(): string | undefined {
    return this.activeTopicTitle;
  }

  getIntent(): string | undefined {
    return this.activeIntent;
  }

  reset(): void {
    this.activeTopicTitle = undefined;
    this.activeIntent = undefined;
  }
}
