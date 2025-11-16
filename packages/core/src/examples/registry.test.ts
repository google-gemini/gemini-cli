/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExampleRegistry, resetExampleRegistry } from './registry.js';
import type { Example } from './types.js';

describe('ExampleRegistry', () => {
  let registry: ExampleRegistry;

  beforeEach(async () => {
    resetExampleRegistry();
    registry = new ExampleRegistry();
    await registry.initialize();
  });

  afterEach(() => {
    resetExampleRegistry();
  });

  describe('initialization', () => {
    it('should initialize only once', async () => {
      const registry2 = new ExampleRegistry();
      await registry2.initialize();
      await registry2.initialize(); // Second call should be no-op
      expect(registry2.getAll().length).toBeGreaterThan(0);
    });

    it('should load built-in examples', () => {
      const examples = registry.getAll();
      expect(examples.length).toBeGreaterThan(0);
    });
  });

  describe('get', () => {
    it('should get example by ID', () => {
      const example = registry.get('explain-codebase-architecture');
      expect(example).toBeDefined();
      expect(example?.title).toBe('Explain Repository Architecture');
    });

    it('should return undefined for non-existent ID', () => {
      const example = registry.get('non-existent-id');
      expect(example).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all examples', () => {
      const examples = registry.getAll();
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
    });

    it('should return examples with all required fields', () => {
      const examples = registry.getAll();
      examples.forEach((ex) => {
        expect(ex.id).toBeDefined();
        expect(ex.title).toBeDefined();
        expect(ex.description).toBeDefined();
        expect(ex.category).toBeDefined();
        expect(ex.tags).toBeInstanceOf(Array);
        expect(ex.difficulty).toBeDefined();
        expect(ex.examplePrompt).toBeDefined();
      });
    });
  });

  describe('search', () => {
    it('should search by text in title', () => {
      const results = registry.search({ text: 'architecture' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title.toLowerCase()).toContain('architecture');
    });

    it('should search by text in description', () => {
      const results = registry.search({ text: 'git' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search by text in tags', () => {
      const results = registry.search({ text: 'security' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by category', () => {
      const results = registry.search({ category: 'code-understanding' });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((ex) => {
        expect(ex.category).toBe('code-understanding');
      });
    });

    it('should filter by difficulty', () => {
      const results = registry.search({ difficulty: 'beginner' });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((ex) => {
        expect(ex.difficulty).toBe('beginner');
      });
    });

    it('should filter by tags', () => {
      const results = registry.search({ tags: ['git'] });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((ex) => {
        expect(ex.tags).toContain('git');
      });
    });

    it('should filter by tools', () => {
      const results = registry.search({ tools: ['read_files'] });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((ex) => {
        expect(ex.requiredTools).toContain('read_files');
      });
    });

    it('should filter featured only', () => {
      const results = registry.search({ featuredOnly: true });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((ex) => {
        expect(ex.featured).toBe(true);
      });
    });

    it('should apply pagination with limit', () => {
      const results = registry.search({ limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should apply pagination with offset', () => {
      const allResults = registry.search({});
      const offsetResults = registry.search({ offset: 1, limit: 2 });

      if (allResults.length > 1) {
        expect(offsetResults[0]).toEqual(allResults[1]);
      }
    });

    it('should combine multiple filters', () => {
      const results = registry.search({
        category: 'development',
        difficulty: 'beginner',
        tags: ['git'],
      });

      results.forEach((ex) => {
        expect(ex.category).toBe('development');
        expect(ex.difficulty).toBe('beginner');
        expect(ex.tags).toContain('git');
      });
    });

    it('should return empty array when no matches', () => {
      const results = registry.search({
        text: 'xyznonexistent',
      });
      expect(results).toEqual([]);
    });
  });

  describe('getByCategory', () => {
    it('should get examples by category', () => {
      const results = registry.getByCategory('file-operations');
      expect(results.length).toBeGreaterThan(0);
      results.forEach((ex) => {
        expect(ex.category).toBe('file-operations');
      });
    });
  });

  describe('getFeatured', () => {
    it('should get only featured examples', () => {
      const results = registry.getFeatured();
      expect(results.length).toBeGreaterThan(0);
      results.forEach((ex) => {
        expect(ex.featured).toBe(true);
      });
    });
  });

  describe('getRandom', () => {
    it('should return a random example', () => {
      const example = registry.getRandom();
      expect(example).toBeDefined();
      expect(example?.id).toBeDefined();
    });

    it('should return undefined when registry is empty', () => {
      const emptyRegistry = new ExampleRegistry();
      const example = emptyRegistry.getRandom();
      expect(example).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      const stats = registry.getStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byCategory).toBeDefined();
      expect(stats.byDifficulty).toBeDefined();
    });

    it('should count examples by category correctly', () => {
      const stats = registry.getStats();
      const codeUnderstanding = registry.getByCategory('code-understanding');
      expect(stats.byCategory['code-understanding']).toBe(
        codeUnderstanding.length,
      );
    });

    it('should count examples by difficulty correctly', () => {
      const stats = registry.getStats();
      const beginners = registry.search({ difficulty: 'beginner' });
      expect(stats.byDifficulty.beginner).toBe(beginners.length);
    });
  });

  describe('register/unregister', () => {
    const testExample: Example = {
      id: 'test-example',
      title: 'Test Example',
      description: 'A test example',
      category: 'development',
      tags: ['test'],
      difficulty: 'beginner',
      estimatedTime: '1 minute',
      requiredTools: [],
      requiredPermissions: [],
      examplePrompt: 'Test prompt',
      expectedOutcome: 'Test outcome',
      tips: [],
      relatedExamples: [],
      documentationLinks: [],
    };

    it('should register a new example', () => {
      registry.register(testExample);
      const retrieved = registry.get('test-example');
      expect(retrieved).toEqual(testExample);
    });

    it('should unregister an example', () => {
      registry.register(testExample);
      expect(registry.get('test-example')).toBeDefined();

      registry.unregister('test-example');
      expect(registry.get('test-example')).toBeUndefined();
    });

    it('should replace existing example when re-registered', () => {
      registry.register(testExample);
      const modified = { ...testExample, title: 'Modified Title' };
      registry.register(modified);

      const retrieved = registry.get('test-example');
      expect(retrieved?.title).toBe('Modified Title');
    });
  });
});
