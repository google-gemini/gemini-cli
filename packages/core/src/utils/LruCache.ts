/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LRUMap } from 'mnemonist';

export class LruCache<K, V> {
  private cache: LRUMap<K, V>;

  constructor(maxSize: number) {
    this.cache = new LRUMap<K, V>(maxSize);
  }

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}
