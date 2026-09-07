/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { KnowledgeStore } from './KnowledgeStore.js';

describe('KnowledgeStore', () => {
  const tempDir = path.join(os.tmpdir(), `zoe-test-knowledge-${Date.now()}`);

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (_e) {
      // Ignore cleanup error
    }
  });

  it('initializes and saves concepts to storage file', () => {
    const store = new KnowledgeStore(tempDir);
    store.addOrTouch('Closures', 'language');
    store.advanceMastery('Closures', 'mastered');

    const filePath = store.getFilePath();
    expect(filePath).toBeDefined();
    expect(fs.existsSync(filePath!)).toBe(true);

    const raw = fs.readFileSync(filePath!, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.concepts.length).toBe(1);
    expect(parsed.concepts[0].name).toBe('Closures');
    expect(parsed.concepts[0].mastery).toBe('mastered');
  });

  it('reloads saved concepts across store instances', () => {
    const store1 = new KnowledgeStore(tempDir);
    store1.addOrTouch('Event Loops', 'concurrency');
    store1.advanceMastery('Event Loops', 'practicing');

    // Create second instance reading the same directory
    const store2 = new KnowledgeStore(tempDir);
    const concept = store2.getGraph().getConcept('event loops');
    expect(concept).toBeDefined();
    expect(concept?.name).toBe('Event Loops');
    expect(concept?.mastery).toBe('practicing');
  });

  it('handles missing or unconfigured paths gracefully', () => {
    const inMemoryStore = new KnowledgeStore();
    expect(inMemoryStore.getFilePath()).toBeNull();
    const node = inMemoryStore.addOrTouch('Ephemeral', 'general');
    expect(node.name).toBe('Ephemeral');
    expect(inMemoryStore.save()).toBe(false);
  });
});
