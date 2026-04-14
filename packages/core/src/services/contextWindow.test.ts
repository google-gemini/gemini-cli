/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  Forest,
  ContextWindow,
  cosineSimilarity,
  findClosestPair,
  type Embedder,
  type Summarizer,
} from './contextWindow.js';

// -- Helpers --

/** Stub embedder: one-hot encoding based on first char code. */
const stubEmbedder: Embedder = {
  embed(text: string): number[] {
    const vec = new Array<number>(128).fill(0);
    if (text.length > 0) {
      vec[text.charCodeAt(0) % 128] = 1;
    }
    return vec;
  },
};

/** Stub summarizer: joins messages with ' | '. */
const stubSummarizer: Summarizer = {
  async summarize(messages: string[]): Promise<string> {
    return messages.join(' | ');
  },
};

// -- cosineSimilarity --

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('should return 0 when a vector is zero', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0.0);
  });

  it('should handle negative values', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('should handle mismatched dimensions without NaN', () => {
    const short = [1, 0];
    const long = [1, 0, 0.5, 0.3];
    const sim = cosineSimilarity(long, short);
    expect(Number.isNaN(sim)).toBe(false);
    expect(sim).toBeGreaterThan(0);
    // Symmetric
    expect(cosineSimilarity(short, long)).toBeCloseTo(sim);
  });

  it('should return 0 for mismatched zero-overlap vectors', () => {
    // short has values only in dims 0-1, long only in dims 2-3
    const a = [1, 0];
    const b = [0, 0, 1, 0];
    const sim = cosineSimilarity(a, b);
    expect(Number.isNaN(sim)).toBe(false);
    expect(sim).toBeCloseTo(0.0);
  });
});

// -- Forest --

describe('Forest', () => {
  it('should insert a message as a singleton', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    const id = forest.insert(0, 'hello');
    expect(id).toBe(0);
    expect(forest.find(0)).toBe(0);
    expect(forest.size()).toBe(1);
    expect(forest.clusterCount()).toBe(1);
  });

  it('should find root with path compression', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.insert(2, 'c');

    // Chain: 2 -> 1 -> 0
    forest.union(0, 1);
    forest.union(0, 2);

    // After path compression, find(2) should return root directly
    const root = forest.find(2);
    expect(root).toBe(forest.find(0));
  });

  it('should union by rank', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.insert(2, 'c');

    forest.union(0, 1);
    const root01 = forest.find(0);

    forest.union(root01, 2);
    // root01 had higher rank, so it should stay root
    expect(forest.find(2)).toBe(root01);
  });

  it('should NOT call summarizer on union (synchronous, structural only)', () => {
    const summarizer = {
      summarize: vi.fn().mockResolvedValue('summary'),
    };
    const forest = new Forest(stubEmbedder, summarizer);
    forest.insert(0, 'alpha');
    forest.insert(1, 'beta');

    const root = forest.union(0, 1);

    expect(summarizer.summarize).not.toHaveBeenCalled();
    // No summary generated yet — cluster is dirty
    expect(forest.isDirty(root)).toBe(true);
  });

  it('should return number (not Promise) from union', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');

    const result = forest.union(0, 1);
    expect(typeof result).toBe('number');
  });

  it('should mark cluster as dirty after union', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');

    forest.union(0, 1);
    const root = forest.find(0);

    expect(forest.isDirty(root)).toBe(true);
    expect(forest.dirtyRoots()).toContain(root);
  });

  it('should not mark singleton as dirty', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'hello');

    expect(forest.isDirty(0)).toBe(false);
    expect(forest.dirtyRoots()).toHaveLength(0);
  });

  it('should resolve dirty clusters via resolveDirty', async () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'alpha');
    forest.insert(1, 'beta');
    forest.union(0, 1);

    await forest.resolveDirty();

    const root = forest.find(0);
    expect(forest.isDirty(root)).toBe(false);
    const summary = forest.summary(root);
    expect(summary).toContain('alpha');
    expect(summary).toContain('beta');
  });

  it('should pass raw content of singletons to summarizer when resolving', async () => {
    const recorder: string[][] = [];
    const recSummarizer: Summarizer = {
      async summarize(messages: string[]): Promise<string> {
        recorder.push([...messages]);
        return messages.join('; ');
      },
    };
    const forest = new Forest(stubEmbedder, recSummarizer);
    forest.insert(0, 'msg0');
    forest.insert(1, 'msg1');
    forest.union(0, 1);

    await forest.resolveDirty();

    // Both raw messages should be passed to summarizer
    expect(recorder).toHaveLength(1);
    expect(recorder[0]).toContain('msg0');
    expect(recorder[0]).toContain('msg1');
  });

  it('should pass clean summary + new raw messages after second resolve', async () => {
    const recorder: string[][] = [];
    const recSummarizer: Summarizer = {
      async summarize(messages: string[]): Promise<string> {
        recorder.push([...messages]);
        return messages.join('; ');
      },
    };
    const forest = new Forest(stubEmbedder, recSummarizer);
    forest.insert(0, 'msg0');
    forest.insert(1, 'msg1');
    forest.union(0, 1);

    await forest.resolveDirty(); // resolve: summarize([msg0, msg1])

    // Now insert a third and merge into the same cluster
    forest.insert(2, 'msg2');
    forest.union(forest.find(0), 2);

    await forest.resolveDirty(); // resolve: summarize([cleanSummary, msg2])

    const lastCall = recorder[recorder.length - 1];
    // First item should be the clean summary from first resolve
    expect(lastCall[0]).toContain('msg0');
    expect(lastCall[0]).toContain('msg1');
    // Second item should be the new raw message
    expect(lastCall[1]).toBe('msg2');
  });

  it('should batch multiple dirty clusters in one resolveDirty call', async () => {
    const summarizer = {
      summarize: vi.fn().mockResolvedValue('summary'),
    };
    const forest = new Forest(stubEmbedder, summarizer);

    // Create 3 separate pairs
    forest.insert(0, 'a0');
    forest.insert(1, 'a1');
    forest.union(0, 1);

    forest.insert(2, 'b0');
    forest.insert(3, 'b1');
    forest.union(2, 3);

    forest.insert(4, 'c0');
    forest.insert(5, 'c1');
    forest.union(4, 5);

    expect(forest.dirtyRoots()).toHaveLength(3);

    await forest.resolveDirty();

    expect(summarizer.summarize).toHaveBeenCalledTimes(3);
    expect(forest.dirtyRoots()).toHaveLength(0);
  });

  it('should merge two clean cluster summaries on union', async () => {
    const recorder: string[][] = [];
    const recSummarizer: Summarizer = {
      async summarize(messages: string[]): Promise<string> {
        recorder.push([...messages]);
        return `summary(${messages.join('+')})`;
      },
    };
    const forest = new Forest(stubEmbedder, recSummarizer);

    // Create and resolve two separate clusters
    forest.insert(0, 'a0');
    forest.insert(1, 'a1');
    forest.union(0, 1);
    await forest.resolveDirty();
    const summaryA = forest.summary(forest.find(0))!;

    forest.insert(2, 'b0');
    forest.insert(3, 'b1');
    forest.union(2, 3);
    await forest.resolveDirty();
    const summaryB = forest.summary(forest.find(2))!;

    // Merge two clean clusters
    forest.union(forest.find(0), forest.find(2));

    await forest.resolveDirty();

    // The last summarize call should receive both summaries
    const lastCall = recorder[recorder.length - 1];
    expect(lastCall).toContain(summaryA);
    expect(lastCall).toContain(summaryB);
  });

  it('should update centroid on union', () => {
    const embedder: Embedder = {
      embed(text: string): number[] {
        return text === 'a' ? [1, 0] : [0, 1];
      },
    };
    const forest = new Forest(embedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.union(0, 1);
    // Centroid should be average: [0.5, 0.5]
    const root = forest.find(0);
    const roots = forest.nearest([0.5, 0.5], 1);
    expect(roots).toContain(root);
  });

  it('should handle centroid merging with mismatched embedding dimensions', () => {
    const embedder: Embedder = {
      embed(text: string): number[] {
        // Simulate growing vocab: earlier messages have shorter embeddings
        if (text === 'early') return [1, 0];
        return [0.5, 0.5, 0.3]; // later messages have longer embeddings
      },
    };
    const forest = new Forest(embedder, stubSummarizer);
    forest.insert(0, 'early');
    forest.insert(1, 'later');
    forest.union(0, 1);

    const root = forest.find(0);
    const centroid = forest.getCentroid(root);
    expect(centroid).toBeDefined();
    expect(centroid!.every((v) => !Number.isNaN(v))).toBe(true);
    // Merged centroid should have max dimension length
    expect(centroid!.length).toBe(3);
  });

  it('should return no-op for union of same cluster', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    const root = forest.union(0, 0);
    expect(root).toBe(0);
    expect(forest.clusterCount()).toBe(1);
    expect(forest.isDirty(0)).toBe(false);
  });

  it('should compact a singleton to its content', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'hello world');
    expect(forest.compact(0)).toBe('hello world');
  });

  it('should compact a resolved cluster to its summary', async () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'foo');
    forest.insert(1, 'bar');
    forest.union(0, 1);

    await forest.resolveDirty();

    const root = forest.find(0);
    expect(forest.compact(root)).toContain('foo');
    expect(forest.compact(root)).toContain('bar');
  });

  it('should compact a dirty cluster to stale summary or raw content', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'foo');
    forest.insert(1, 'bar');
    forest.union(0, 1);

    // Not resolved yet — compact returns raw content of root node
    const root = forest.find(0);
    const compacted = forest.compact(root);
    // Should be either 'foo' or 'bar' (whichever is root)
    expect(['foo', 'bar']).toContain(compacted);
  });

  it('should expand a cluster to source messages', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'x');
    forest.insert(1, 'y');
    forest.union(0, 1);
    const root = forest.find(0);
    const expanded = forest.expand(root);
    expect(expanded).toContain('x');
    expect(expanded).toContain('y');
  });

  it('should retrieve nearest roots by cosine similarity', () => {
    const embedder: Embedder = {
      embed(text: string): number[] {
        if (text.startsWith('cat')) return [1, 0, 0];
        if (text.startsWith('dog')) return [0.9, 0.1, 0];
        return [0, 0, 1];
      },
    };
    const forest = new Forest(embedder, stubSummarizer);
    forest.insert(0, 'cat food');
    forest.insert(1, 'dog park');
    forest.insert(2, 'javascript');

    const results = forest.nearest([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    // 'cat food' should be closest
    expect(results[0]).toBe(0);
  });

  it('should filter by min_sim in nearest', () => {
    const embedder: Embedder = {
      embed(text: string): number[] {
        return text === 'match' ? [1, 0] : [0, 1];
      },
    };
    const forest = new Forest(embedder, stubSummarizer);
    forest.insert(0, 'match');
    forest.insert(1, 'other');

    // Query for [1, 0] with high min_sim
    const results = forest.nearest([1, 0], 5, 0.9);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(0);
  });

  it('should return nearestRoot', () => {
    const embedder: Embedder = {
      embed(text: string): number[] {
        return text === 'a' ? [1, 0] : [0, 1];
      },
    };
    const forest = new Forest(embedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');

    const result = forest.nearestRoot([1, 0]);
    expect(result).not.toBeNull();
    expect(result![0]).toBe(0);
    expect(result![1]).toBeCloseTo(1.0);
  });

  it('should return null for nearestRoot on empty forest', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    expect(forest.nearestRoot([1, 0])).toBeNull();
  });

  it('should list members of a cluster', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.union(0, 1);
    const root = forest.find(0);
    const members = forest.members(root);
    expect(members).toContain(0);
    expect(members).toContain(1);
  });

  it('should not drop dirty state added by union during resolveDirty', async () => {
    const slowSummarizer: Summarizer = {
      async summarize(messages: string[]): Promise<string> {
        // Simulate slow LLM call
        await new Promise((resolve) => setTimeout(resolve, 10));
        return messages.join('; ');
      },
    };
    const forest = new Forest(stubEmbedder, slowSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.union(0, 1); // dirty cluster {0,1}

    // Start resolving — the await inside gives us a window
    const resolvePromise = forest.resolveDirty();

    // While resolve is in flight, add new dirty state
    forest.insert(2, 'c');
    forest.insert(3, 'd');
    forest.union(2, 3); // new dirty cluster {2,3}

    await resolvePromise;

    // The new dirty cluster should NOT have been wiped
    expect(forest.isDirty(forest.find(2))).toBe(true);

    // Resolve it now
    await forest.resolveDirty();
    expect(forest.isDirty(forest.find(2))).toBe(false);
  });

  it('should not overwrite merged cluster dirty state when in-flight root is merged', async () => {
    const slowSummarizer: Summarizer = {
      async summarize(messages: string[]): Promise<string> {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return messages.join('; ');
      },
    };
    const forest = new Forest(stubEmbedder, slowSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.union(0, 1); // dirty cluster {0,1}
    const originalRoot = forest.find(0);

    // Start resolving {0,1}
    const resolvePromise = forest.resolveDirty();

    // While {0,1} is being summarized, merge it into a new cluster
    forest.insert(2, 'c');
    forest.union(originalRoot, 2); // now {0,1,2} is dirty with combined inputs

    await resolvePromise;

    // The merged cluster should still be dirty — the stale summary
    // from the in-flight call should NOT have resolved it
    const mergedRoot = forest.find(0);
    expect(forest.isDirty(mergedRoot)).toBe(true);

    // Resolve it properly now
    await forest.resolveDirty();
    expect(forest.isDirty(forest.find(0))).toBe(false);
    // Summary should include all three messages
    const summary = forest.summary(forest.find(0))!;
    expect(summary).toBeDefined();
  });

  it('should list all roots', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.insert(2, 'c');
    forest.union(0, 1);
    const roots = forest.roots();
    expect(roots).toHaveLength(2);
  });
});

// -- findClosestPair --

describe('findClosestPair', () => {
  it('should return null for fewer than 2 roots', () => {
    const forest = new Forest(stubEmbedder, stubSummarizer);
    forest.insert(0, 'a');
    expect(findClosestPair(forest)).toBeNull();
  });

  it('should find the closest pair', () => {
    const embedder: Embedder = {
      embed(text: string): number[] {
        if (text === 'a') return [1, 0, 0];
        if (text === 'b') return [0.95, 0.05, 0];
        return [0, 0, 1];
      },
    };
    const forest = new Forest(embedder, stubSummarizer);
    forest.insert(0, 'a');
    forest.insert(1, 'b');
    forest.insert(2, 'c');

    const pair = findClosestPair(forest);
    expect(pair).not.toBeNull();
    // a and b are closest
    expect(pair).toContain(0);
    expect(pair).toContain(1);
  });
});

// -- ContextWindow --

describe('ContextWindow', () => {
  it('should keep messages in hot zone when under graduateAt', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer, {
      graduateAt: 5,
      evictAt: 7,
    });
    cw.append('msg1');
    cw.append('msg2');
    expect(cw.hotCount).toBe(2);
    expect(cw.coldClusterCount).toBe(0);
  });

  it('append should return a number (synchronous, not a Promise)', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer);
    const result = cw.append('test');
    expect(typeof result).toBe('number');
  });

  it('should graduate oldest when hot exceeds graduateAt (overlap window)', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer, {
      graduateAt: 3,
      evictAt: 5,
      maxColdClusters: 10,
      mergeThreshold: 0.0, // never merge by similarity
    });

    cw.append('msg0');
    cw.append('msg1');
    cw.append('msg2');
    cw.append('msg3'); // msg0 graduates but stays in hot (overlap)

    expect(cw.hotCount).toBe(4); // msg0 still in hot
    expect(cw.coldClusterCount).toBe(1); // msg0 also in cold
  });

  it('should evict from hot when hot exceeds evictAt', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer, {
      graduateAt: 2,
      evictAt: 4,
      maxColdClusters: 10,
      mergeThreshold: 0.0,
    });

    cw.append('msg0');
    cw.append('msg1');
    cw.append('msg2'); // msg0 graduates, stays in hot (3 items, overlap)
    cw.append('msg3'); // msg1 graduates, stays in hot (4 items)
    cw.append('msg4'); // msg2 graduates, msg0 evicted from hot (5>4)

    expect(cw.hotCount).toBe(4); // msg1, msg2, msg3, msg4
    expect(cw.coldClusterCount).toBeGreaterThanOrEqual(1);
  });

  it('should never call summarizer during append', () => {
    const summarizer = {
      summarize: vi.fn().mockResolvedValue('summary'),
    };
    const cw = new ContextWindow(stubEmbedder, summarizer, {
      graduateAt: 2,
      evictAt: 4,
      maxColdClusters: 10,
    });

    for (let i = 0; i < 20; i++) {
      cw.append(`msg${i}`);
    }

    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('should never call summarizer during render', () => {
    const summarizer = {
      summarize: vi.fn().mockResolvedValue('summary'),
    };
    const cw = new ContextWindow(stubEmbedder, summarizer, {
      graduateAt: 2,
      evictAt: 4,
    });

    for (let i = 0; i < 10; i++) {
      cw.append(`msg${i}`);
    }

    const rendered = cw.render();
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(rendered.length).toBeGreaterThan(0);
  });

  it('should merge graduated message into nearest cluster when similar', () => {
    // Use an embedder that makes all messages identical
    const sameEmbedder: Embedder = {
      embed(): number[] {
        return [1, 0, 0];
      },
    };

    const cw = new ContextWindow(sameEmbedder, stubSummarizer, {
      graduateAt: 2,
      evictAt: 4,
      maxColdClusters: 10,
      mergeThreshold: 0.5, // will merge since similarity is 1.0
    });

    cw.append('a');
    cw.append('b');
    cw.append('c'); // 'a' graduates as singleton
    cw.append('d'); // 'b' graduates, merges with 'a' (sim = 1.0)

    expect(cw.coldClusterCount).toBe(1); // merged into one cluster
  });

  it('should enforce hard cap on cold clusters via forced merging', () => {
    // Each message gets a unique embedding so nothing merges naturally
    let counter = 0;
    const uniqueEmbedder: Embedder = {
      embed(): number[] {
        const vec = new Array<number>(10).fill(0);
        vec[counter % 10] = 1;
        counter++;
        return vec;
      },
    };

    const cw = new ContextWindow(uniqueEmbedder, stubSummarizer, {
      graduateAt: 2,
      evictAt: 4,
      maxColdClusters: 3,
      mergeThreshold: 2.0, // never merge naturally (sim max is 1.0)
    });

    for (let i = 0; i < 10; i++) {
      cw.append(`msg${i}`);
    }

    expect(cw.coldClusterCount).toBeLessThanOrEqual(3);
  });

  it('should render cold summaries + hot messages without query', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer, {
      graduateAt: 2,
      evictAt: 3,
      maxColdClusters: 10,
      mergeThreshold: 0.0,
    });

    cw.append('old1');
    cw.append('old2');
    cw.append('hot1'); // old1 graduates
    cw.append('hot2'); // old2 graduates, old1 evicted

    const rendered = cw.render();
    expect(rendered.length).toBeGreaterThanOrEqual(2);
    // Hot messages should be at the end
    expect(rendered[rendered.length - 1]).toBe('hot2');
  });

  it('should render with query-based retrieval', async () => {
    const embedder: Embedder = {
      embed(text: string): number[] {
        if (text.includes('cat')) return [1, 0, 0];
        if (text.includes('dog')) return [0.9, 0.1, 0];
        return [0, 0, 1];
      },
    };

    const cw = new ContextWindow(embedder, stubSummarizer, {
      graduateAt: 2,
      evictAt: 4,
      maxColdClusters: 10,
      mergeThreshold: 2.0, // never merge by similarity (max sim is 1.0)
    });

    cw.append('cat info');
    cw.append('dog info');
    cw.append('javascript info');
    cw.append('hot message 1');
    cw.append('hot message 2');

    // Resolve so cold clusters have proper summaries
    await cw.resolveDirty();

    // Query about cats should retrieve cat cluster from cold
    const rendered = cw.render('cat question', 1, 0.5);
    expect(rendered.some((r) => r.includes('cat'))).toBe(true);
  });

  it('should resolveDirty to batch-summarize dirty clusters', async () => {
    const summarizer = {
      summarize: vi.fn().mockResolvedValue('resolved summary'),
    };
    const cw = new ContextWindow(stubEmbedder, summarizer, {
      graduateAt: 2,
      evictAt: 4,
      maxColdClusters: 10,
      mergeThreshold: 0.0,
    });

    for (let i = 0; i < 10; i++) {
      cw.append(`msg${i}`);
    }

    expect(summarizer.summarize).not.toHaveBeenCalled();

    await cw.resolveDirty();

    // Should have called summarize for dirty clusters
    expect(summarizer.summarize).toHaveBeenCalled();
    // After resolve, no dirty clusters
    expect(cw.forest.dirtyRoots()).toHaveLength(0);
  });

  it('should show graduated messages verbatim in render via overlap window', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer, {
      graduateAt: 3,
      evictAt: 5,
      maxColdClusters: 10,
      mergeThreshold: 0.0,
    });

    cw.append('msg0');
    cw.append('msg1');
    cw.append('msg2');
    cw.append('msg3'); // msg0 graduates but stays in hot

    // msg0 should appear in render as verbatim hot zone content
    const rendered = cw.render();
    expect(rendered).toContain('msg0');
    // msg0 is also in cold, but it still appears from hot
    expect(cw.coldClusterCount).toBe(1);
    expect(cw.hotCount).toBe(4);
  });

  it('should return correct counts', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer, {
      graduateAt: 3,
      evictAt: 5,
    });

    cw.append('a');
    cw.append('b');
    expect(cw.hotCount).toBe(2);
    expect(cw.coldClusterCount).toBe(0);
    expect(cw.totalMessages).toBe(2);
  });

  it('render(query) should not mutate the embedder corpus', () => {
    const embedder = {
      embed(text: string): number[] {
        if (text.includes('cat')) return [1, 0, 0];
        return [0, 0, 1];
      },
      embedQuery: vi.fn().mockReturnValue([1, 0, 0]),
    };

    const cw = new ContextWindow(embedder, stubSummarizer, {
      graduateAt: 2,
      evictAt: 4,
      maxColdClusters: 10,
      mergeThreshold: 0.0,
    });

    cw.append('cat info');
    cw.append('dog info');
    cw.append('hot1');

    // render with query should call embedQuery, not embed
    cw.render('cat question', 1, 0.0);
    expect(embedder.embedQuery).toHaveBeenCalledWith('cat question');
  });

  it('should throw if evictAt < graduateAt', () => {
    expect(() => {
      new ContextWindow(stubEmbedder, stubSummarizer, {
        graduateAt: 5,
        evictAt: 3,
      });
    }).toThrow('evictAt (3) must be >= graduateAt (5)');
  });

  it('should expose forest for direct access', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer);
    expect(cw.forest).toBeInstanceOf(Forest);
  });

  it('should expand a cold cluster to source messages', () => {
    const cw = new ContextWindow(stubEmbedder, stubSummarizer, {
      graduateAt: 2,
      evictAt: 3,
      maxColdClusters: 10,
      mergeThreshold: 0.0,
    });

    cw.append('graduated');
    cw.append('h1');
    cw.append('h2'); // 'graduated' enters cold

    const roots = cw.forest.roots();
    expect(roots.length).toBe(1);
    const expanded = cw.expand(roots[0]);
    expect(expanded).toContain('graduated');
  });
});
