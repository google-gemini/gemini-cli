/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

/**
 * A fake implementation of PersistentState for testing.
 * It keeps state in memory and provides spies for get and set.
 */
export class FakePersistentState {
  private data: Record<string, unknown> = {};

  get = vi.fn().mockImplementation((key: string) => this.data[key]);

  set = vi.fn().mockImplementation((key: string, value: unknown) => {
    this.data[key] = value;
  });

  /**
   * Helper to reset the fake state between tests.
   */
  reset() {
    this.data = {};
    this.get.mockClear();
    this.set.mockClear();
  }

  /**
   * Helper to clear mock call history without wiping data.
   */
  mockClear() {
    this.get.mockClear();
    this.set.mockClear();
  }

  /**
   * Helper to set initial data for the fake.
   */
  setData(data: Record<string, unknown>) {
    this.data = { ...data };
  }
}
