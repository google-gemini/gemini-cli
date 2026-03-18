/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * A single scheduled work item.
 */
export interface ScheduledItem {
  id: string;
  prompt: string;
  fireAt: Date;
  createdAt: Date;
  status: 'pending' | 'fired' | 'cancelled';
}

/**
 * Serializable representation of a scheduled item for persistence.
 */
export interface SerializedScheduledItem {
  id: string;
  prompt: string;
  fireAt: string;
  createdAt: string;
}

export interface WorkSchedulerEvents {
  fire: [prompt: string];
  changed: [];
}

/**
 * Manages a time-based list of scheduled work items.
 * Emits 'fire' when a scheduled item's time arrives, with the prompt text.
 * Emits 'changed' whenever the schedule is mutated.
 */
export class WorkScheduler extends EventEmitter<WorkSchedulerEvents> {
  private items: ScheduledItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Add a scheduled item at an absolute time.
   * @returns The created ScheduledItem.
   */
  add(prompt: string, fireAt: Date): ScheduledItem {
    const item: ScheduledItem = {
      id: randomUUID(),
      prompt,
      fireAt,
      createdAt: new Date(),
      status: 'pending',
    };
    this.items.push(item);
    this.items.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    this.rearm();
    this.emit('changed');
    return item;
  }

  /**
   * Add a scheduled item using a relative delay in minutes.
   * @returns The created ScheduledItem.
   */
  addRelative(prompt: string, inMinutes: number): ScheduledItem {
    const fireAt = new Date(Date.now() + inMinutes * 60 * 1000);
    return this.add(prompt, fireAt);
  }

  /**
   * Cancel a scheduled item by ID.
   * @returns true if the item was found and cancelled, false otherwise.
   */
  cancel(id: string): boolean {
    const item = this.items.find((i) => i.id === id && i.status === 'pending');
    if (!item) {
      return false;
    }
    item.status = 'cancelled';
    this.rearm();
    this.emit('changed');
    return true;
  }

  /**
   * Get all pending items, sorted by fireAt.
   */
  getPendingItems(): readonly ScheduledItem[] {
    return this.items.filter((i) => i.status === 'pending');
  }

  /**
   * Get the next pending item (soonest fireAt).
   */
  getNextPending(): ScheduledItem | undefined {
    return this.items.find((i) => i.status === 'pending');
  }

  /**
   * Serialize pending items for session persistence.
   */
  serialize(): SerializedScheduledItem[] {
    return this.getPendingItems().map((item) => ({
      id: item.id,
      prompt: item.prompt,
      fireAt: item.fireAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
    }));
  }

  /**
   * Restore scheduled items from serialized data (e.g. session resume).
   * Items whose fireAt is in the past fire immediately (queued sequentially).
   * Items in the future get timers re-armed.
   */
  restore(serialized: SerializedScheduledItem[]): void {
    for (const s of serialized) {
      const item: ScheduledItem = {
        id: s.id,
        prompt: s.prompt,
        fireAt: new Date(s.fireAt),
        createdAt: new Date(s.createdAt),
        status: 'pending',
      };
      this.items.push(item);
    }
    this.items.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    this.rearm();
    this.emit('changed');
  }

  /**
   * Format a human-readable summary of the current schedule, including current time.
   */
  formatScheduleSummary(): string {
    const now = new Date();
    const pending = this.getPendingItems();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const localTime = now.toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const lines: string[] = [`Current time: ${localTime} (${tz})`];

    if (pending.length === 0) {
      lines.push('No scheduled items.');
    } else {
      lines.push('');
      lines.push('Active schedule:');
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        const diffMs = item.fireAt.getTime() - now.getTime();
        const diffMins = Math.max(0, Math.ceil(diffMs / 60000));
        const itemTime = item.fireAt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        lines.push(
          `  ${i + 1}. [${item.id.slice(0, 8)}] ${itemTime} (in ${diffMins}m) — "${item.prompt}"`,
        );
      }
    }
    return lines.join('\n');
  }

  /**
   * Stop all timers. Call on cleanup/shutdown.
   */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Re-arm the internal timer to point at the next pending item.
   */
  private rearm(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Fire all past-due items immediately
    const now = Date.now();
    const pastDue = this.items.filter(
      (i) => i.status === 'pending' && i.fireAt.getTime() <= now,
    );
    for (const item of pastDue) {
      item.status = 'fired';
      this.emit('fire', item.prompt);
    }

    // Find next future pending item
    const next = this.items.find(
      (i) => i.status === 'pending' && i.fireAt.getTime() > now,
    );
    if (!next) {
      return;
    }

    const delayMs = Math.max(0, next.fireAt.getTime() - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      if (next.status === 'pending') {
        next.status = 'fired';
        this.emit('fire', next.prompt);
        this.emit('changed');
      }
      // Re-arm for the next item after this one
      this.rearm();
    }, delayMs);
  }
}
