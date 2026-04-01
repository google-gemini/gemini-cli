/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreEvents } from '../utils/events.js';

/**
 * Manages the current active topic title and tactical intent for a session.
 * Hosted within the Config instance for session-scoping.
 */
export class TopicState {
  private activeTopicTitle?: string;
  private activeSummary?: string;
  private activeIntent?: string;

  /**
   * Sanitizes and sets the topic title and/or intent.
   * @returns true if the input was valid and set, false otherwise.
   */
  setTopic(title?: string, summary?: string, intent?: string): boolean {
    const sanitizedTitle = title?.trim().replace(/[\r\n]+/g, ' ');
    const sanitizedSummary = summary?.trim().replace(/[\r\n]+/g, ' ');
    const sanitizedIntent = intent?.trim().replace(/[\r\n]+/g, ' ');

    if (!sanitizedTitle && !sanitizedSummary && !sanitizedIntent) return false;

    if (sanitizedTitle) {
      this.activeTopicTitle = sanitizedTitle;
    }

    if (sanitizedSummary) {
      this.activeSummary = sanitizedSummary;
    }

    if (sanitizedIntent) {
      this.activeIntent = sanitizedIntent;
    }

    coreEvents.emitTopicUpdated(this.activeTopicTitle, this.activeSummary);
    return true;
  }

  getTopic(): string | undefined {
    return this.activeTopicTitle;
  }

  getSummary(): string | undefined {
    return this.activeSummary;
  }

  getIntent(): string | undefined {
    return this.activeIntent;
  }

  reset(): void {
    this.activeTopicTitle = undefined;
    this.activeSummary = undefined;
    this.activeIntent = undefined;
  }
}
