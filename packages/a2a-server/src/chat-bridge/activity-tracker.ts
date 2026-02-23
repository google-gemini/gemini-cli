/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tracks text deltas and tool activity during A2A streaming
 * to build a collapsible activity log for Google Chat Cards V2.
 */

export interface ActivityEntry {
  timestamp: number;
  text: string;
  type: 'thought' | 'tool' | 'text';
}

/** Maximum length for a single activity entry text. */
const MAX_ENTRY_LENGTH = 200;

/**
 * Minimum new chars before a text delta becomes an activity entry.
 * Prevents fragmentary entries from small streaming chunks.
 */
const MIN_DELTA_SIZE = 100;

/** Truncates text to max length with ellipsis. */
function truncate(text: string, max: number = MAX_ENTRY_LENGTH): string {
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + '...';
}

export class ActivityTracker {
  private entries: ActivityEntry[] = [];
  private previousText = '';
  private pendingDelta = '';

  /**
   * Called with each extracted text from a stream event.
   * Accumulates deltas and only creates an entry when enough
   * new content has arrived (MIN_DELTA_SIZE chars).
   * Returns the new delta text, or null if below threshold.
   */
  addText(text: string): string | null {
    if (!text || text === this.previousText) return null;

    let delta: string;

    if (text.startsWith(this.previousText) && this.previousText.length > 0) {
      // Accumulated text — extract just the new suffix
      delta = text.substring(this.previousText.length).trim();
    } else {
      // Full replacement — use the whole text as delta
      delta = text.trim();
    }

    this.previousText = text;

    if (!delta) return null;

    // Accumulate small deltas until we have enough for a meaningful entry
    this.pendingDelta += (this.pendingDelta ? ' ' : '') + delta;

    if (this.pendingDelta.length >= MIN_DELTA_SIZE) {
      this.entries.push({
        timestamp: Date.now(),
        text: truncate(this.pendingDelta),
        type: 'text',
      });
      this.pendingDelta = '';
      return delta;
    }

    return null;
  }

  /**
   * Flushes any remaining pending delta as a final entry.
   * Call this when the stream ends.
   */
  flush(): void {
    if (this.pendingDelta.length > 0) {
      this.entries.push({
        timestamp: Date.now(),
        text: truncate(this.pendingDelta),
        type: 'text',
      });
      this.pendingDelta = '';
    }
  }

  /**
   * Adds a direct text entry (e.g., narration captured at a tool boundary).
   */
  addTextEntry(text: string): void {
    this.entries.push({
      timestamp: Date.now(),
      text: truncate(text),
      type: 'text',
    });
  }

  /**
   * Adds a thought entry from A2UI thought surfaces.
   */
  addThought(subject: string, description: string): void {
    const text = description
      ? `${subject}: ${truncate(description, MAX_ENTRY_LENGTH - subject.length - 2)}`
      : subject;
    this.entries.push({
      timestamp: Date.now(),
      text,
      type: 'thought',
    });
  }

  /**
   * Adds a tool activity entry (e.g., auto-approved tool in YOLO mode).
   * Returns the index of the new entry for later updates.
   */
  addToolActivity(toolName: string, status: string): number {
    this.entries.push({
      timestamp: Date.now(),
      text: `${toolName} — ${status}`,
      type: 'tool',
    });
    return this.entries.length - 1;
  }

  /**
   * Updates the status of an existing tool activity entry.
   */
  updateToolStatus(index: number, toolName: string, newStatus: string): void {
    if (index >= 0 && index < this.entries.length) {
      this.entries[index].text = `${toolName} — ${newStatus}`;
      this.entries[index].timestamp = Date.now();
    }
  }

  /**
   * Returns all tracked activity entries.
   */
  getEntries(): ActivityEntry[] {
    return [...this.entries];
  }

  /**
   * Returns true if there are entries worth showing in a card.
   */
  hasActivity(): boolean {
    return this.entries.length > 0;
  }

  /**
   * Returns the number of entries.
   */
  get count(): number {
    return this.entries.length;
  }
}
