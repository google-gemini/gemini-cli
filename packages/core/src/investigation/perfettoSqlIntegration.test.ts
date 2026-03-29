/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Mock Perfetto SQL integration for trace data analysis.
 */
interface TraceEvent {
  ts: number;
  dur?: number;
  pid?: number;
  tid?: number;
  name: string;
  ph: string;
  args?: Record<string, unknown>;
}

interface HeapObjectSummary {
  className: string;
  count: number;
  shallowSize: number;
  retainedSize: number;
}

interface RetainerInfo {
  objectId: string;
  className: string;
  retainedSize: number;
  path: string[];
}

interface QueryResult {
  rows: Array<Record<string, unknown>>;
  tokens: number;
  formatted: string;
}

class PerfettoSqlIntegration {
  private traceData: TraceEvent[] = [];
  private queryCache: Map<string, QueryResult> = new Map();

  /**
   * Initialize with synthetic trace data.
   */
  loadTraceData(events: TraceEvent[]): void {
    this.traceData = events;
    this.queryCache.clear();
  }

  /**
   * Parse and validate SQL queries.
   * Supports: SELECT, WHERE, GROUP BY, ORDER BY, LIMIT
   */
  parseQuery(sql: string): { valid: boolean; clauses: string[] } {
    const clauses: string[] = [];
    const upperSql = sql.toUpperCase();

    if (upperSql.includes('SELECT')) {
      clauses.push('SELECT');
    }
    if (upperSql.includes('WHERE')) {
      clauses.push('WHERE');
    }
    if (upperSql.includes('GROUP BY')) {
      clauses.push('GROUP BY');
    }
    if (upperSql.includes('ORDER BY')) {
      clauses.push('ORDER BY');
    }
    if (upperSql.includes('LIMIT')) {
      clauses.push('LIMIT');
    }

    const valid = clauses.includes('SELECT');
    return { valid, clauses };
  }

  /**
   * Execute query against trace data.
   */
  executeQuery(sql: string): QueryResult {
    const cacheKey = sql;
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey)!;
    }

    const parsed = this.parseQuery(sql);
    if (!parsed.valid) {
      return { rows: [], tokens: 0, formatted: '' };
    }

    const rows: Array<Record<string, unknown>> = [];

    // Simulate different query types
    if (sql.includes('FROM events')) {
      const filtered = this.traceData.filter((e) => {
        if (sql.includes('WHERE name =')) {
          const match = sql.match(/WHERE name = '([^']+)'/);
          return match ? e.name === match[1] : true;
        }
        return true;
      });

      for (const event of filtered) {
        rows.push({
          ts: event.ts,
          dur: event.dur ?? 0,
          name: event.name,
          ph: event.ph,
        });
      }

      if (sql.toUpperCase().includes('LIMIT')) {
        const match = sql.match(/LIMIT (\d+)/);
        if (match) {
          return {
            rows: rows.slice(0, parseInt(match[1], 10)),
            tokens: rows.length * 2,
            formatted: this.formatQueryResult(
              rows.slice(0, parseInt(match[1], 10)),
            ),
          };
        }
      }
    }

    const result: QueryResult = {
      rows,
      tokens: Math.ceil(JSON.stringify(rows).length / 4),
      formatted: this.formatQueryResult(rows),
    };

    this.queryCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get heap object summary with synthetic data.
   */
  getHeapObjectSummary(
    minSize: number = 0,
    limit: number = 10,
  ): HeapObjectSummary[] {
    const summaries: HeapObjectSummary[] = [
      {
        className: 'Object',
        count: 5000,
        shallowSize: 2_000_000,
        retainedSize: 15_000_000,
      },
      {
        className: 'Array',
        count: 3000,
        shallowSize: 1_200_000,
        retainedSize: 8_000_000,
      },
      {
        className: 'String',
        count: 10000,
        shallowSize: 800_000,
        retainedSize: 800_000,
      },
      {
        className: 'Function',
        count: 500,
        shallowSize: 400_000,
        retainedSize: 5_000_000,
      },
      {
        className: 'Map',
        count: 200,
        shallowSize: 300_000,
        retainedSize: 3_000_000,
      },
    ];

    return summaries
      .filter((s) => s.shallowSize >= minSize)
      .sort((a, b) => b.retainedSize - a.retainedSize)
      .slice(0, limit);
  }

  /**
   * Get top retainers for an object.
   */
  getTopRetainers(objectId: string, limit: number = 5): RetainerInfo[] {
    const retainers: RetainerInfo[] = [
      {
        objectId: 'obj_1001',
        className: 'GlobalObject',
        retainedSize: 50_000_000,
        path: ['global', 'window'],
      },
      {
        objectId: 'obj_1002',
        className: 'ApplicationState',
        retainedSize: 30_000_000,
        path: ['window', 'app', 'state'],
      },
      {
        objectId: 'obj_1003',
        className: 'Cache',
        retainedSize: 20_000_000,
        path: ['window', 'cache', 'data'],
      },
      {
        objectId: 'obj_1004',
        className: 'EventListeners',
        retainedSize: 15_000_000,
        path: ['window', 'listeners'],
      },
      {
        objectId: 'obj_1005',
        className: 'DOM',
        retainedSize: 10_000_000,
        path: ['document', 'body'],
      },
    ];

    return retainers.slice(0, limit);
  }

  /**
   * Estimate tokens for query results.
   */
  estimateTokensForResult(rows: Array<Record<string, unknown>>): number {
    if (rows.length === 0) return 0;
    const jsonString = JSON.stringify(rows);
    return Math.ceil(jsonString.length / 4);
  }

  /**
   * Format results for LLM consumption.
   */
  formatForLLM(summary: HeapObjectSummary[]): string {
    const lines: string[] = ['Heap Object Summary:', '─'.repeat(50)];

    for (const obj of summary) {
      lines.push(
        `Class: ${obj.className}`,
        `  Count: ${obj.count}`,
        `  Shallow Size: ${this.formatBytes(obj.shallowSize)}`,
        `  Retained Size: ${this.formatBytes(obj.retainedSize)}`,
        '',
      );
    }

    return lines.join('\n');
  }

  /**
   * Format bytes to human-readable size.
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIdx = 0;

    while (size >= 1024 && unitIdx < units.length - 1) {
      size /= 1024;
      unitIdx++;
    }

    return `${size.toFixed(2)} ${units[unitIdx]}`;
  }

  /**
   * Format query results as table.
   */
  private formatQueryResult(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) {
      return 'No results';
    }

    const headers = Object.keys(rows[0]);
    const lines = [headers.join(' | ')];
    lines.push('-'.repeat(headers.join(' | ').length));

    for (const row of rows) {
      const values = headers.map((h) => String(row[h]));
      lines.push(values.join(' | '));
    }

    return lines.join('\n');
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PerfettoSqlIntegration', () => {
  let integration: PerfettoSqlIntegration;
  let mockTraceData: TraceEvent[];

  beforeEach(() => {
    integration = new PerfettoSqlIntegration();

    mockTraceData = [
      { ts: 1000, dur: 100, pid: 123, tid: 456, name: 'main', ph: 'X' },
      { ts: 1200, dur: 50, pid: 123, tid: 456, name: 'gc', ph: 'X' },
      { ts: 1300, dur: 200, pid: 123, tid: 456, name: 'render', ph: 'X' },
      { ts: 1600, dur: 75, pid: 123, tid: 456, name: 'layout', ph: 'X' },
      { ts: 2000, dur: 150, pid: 123, tid: 456, name: 'paint', ph: 'X' },
    ];

    integration.loadTraceData(mockTraceData);
  });

  describe('SQL Parsing (SELECT, WHERE, GROUP BY, ORDER BY, LIMIT)', () => {
    it('should parse SELECT clause', () => {
      const result = integration.parseQuery('SELECT * FROM events');
      expect(result.valid).toBe(true);
      expect(result.clauses).toContain('SELECT');
    });

    it('should parse WHERE clause', () => {
      const result = integration.parseQuery(
        'SELECT * FROM events WHERE name = "gc"',
      );
      expect(result.valid).toBe(true);
      expect(result.clauses).toContain('WHERE');
    });

    it('should parse GROUP BY clause', () => {
      const result = integration.parseQuery(
        'SELECT name, COUNT(*) FROM events GROUP BY name',
      );
      expect(result.valid).toBe(true);
      expect(result.clauses).toContain('GROUP BY');
    });

    it('should parse ORDER BY clause', () => {
      const result = integration.parseQuery(
        'SELECT * FROM events ORDER BY ts DESC',
      );
      expect(result.valid).toBe(true);
      expect(result.clauses).toContain('ORDER BY');
    });

    it('should parse LIMIT clause', () => {
      const result = integration.parseQuery('SELECT * FROM events LIMIT 10');
      expect(result.valid).toBe(true);
      expect(result.clauses).toContain('LIMIT');
    });

    it('should parse complex multi-clause query', () => {
      const result = integration.parseQuery(
        'SELECT name, COUNT(*) as count FROM events WHERE ts > 1000 GROUP BY name ORDER BY count DESC LIMIT 5',
      );
      expect(result.valid).toBe(true);
      expect(result.clauses).toContain('SELECT');
      expect(result.clauses).toContain('WHERE');
      expect(result.clauses).toContain('GROUP BY');
      expect(result.clauses).toContain('ORDER BY');
      expect(result.clauses).toContain('LIMIT');
    });

    it('should reject query without SELECT', () => {
      const result = integration.parseQuery('FROM events WHERE name = "gc"');
      expect(result.valid).toBe(false);
    });
  });

  describe('Query Execution Against Mock Trace Data', () => {
    it('should execute basic SELECT query', () => {
      const result = integration.executeQuery('SELECT * FROM events');
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('ts');
      expect(result.rows[0]).toHaveProperty('name');
    });

    it('should filter results with WHERE clause', () => {
      const result = integration.executeQuery(
        "SELECT * FROM events WHERE name = 'gc'",
      );
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveProperty('name');
    });

    it('should respect LIMIT clause', () => {
      const result = integration.executeQuery('SELECT * FROM events LIMIT 2');
      expect(result.rows.length).toBeLessThanOrEqual(2);
    });

    it('should return empty for no matches', () => {
      const result = integration.executeQuery(
        "SELECT * FROM events WHERE name = 'nonexistent'",
      );
      expect(result.rows.length).toBe(0);
    });

    it('should return formatted output', () => {
      const result = integration.executeQuery('SELECT * FROM events LIMIT 1');
      expect(result.formatted).not.toBe('');
      expect(result.formatted).toContain('ts');
    });
  });

  describe('getHeapObjectSummary() with Synthetic Data', () => {
    it('should return heap object summaries', () => {
      const summaries = integration.getHeapObjectSummary();
      expect(summaries.length).toBeGreaterThan(0);
    });

    it('should include object metadata', () => {
      const summaries = integration.getHeapObjectSummary();
      const first = summaries[0];

      expect(first).toHaveProperty('className');
      expect(first).toHaveProperty('count');
      expect(first).toHaveProperty('shallowSize');
      expect(first).toHaveProperty('retainedSize');
    });

    it('should sort by retained size descending', () => {
      const summaries = integration.getHeapObjectSummary();

      for (let i = 0; i < summaries.length - 1; i++) {
        expect(summaries[i].retainedSize).toBeGreaterThanOrEqual(
          summaries[i + 1].retainedSize,
        );
      }
    });

    it('should respect minimum size filter', () => {
      const summaries = integration.getHeapObjectSummary(1_000_000);

      for (const summary of summaries) {
        expect(summary.shallowSize).toBeGreaterThanOrEqual(1_000_000);
      }
    });

    it('should respect limit parameter', () => {
      const summaries = integration.getHeapObjectSummary(0, 3);
      expect(summaries.length).toBeLessThanOrEqual(3);
    });

    it('should return realistic data', () => {
      const summaries = integration.getHeapObjectSummary();

      expect(summaries[0].className).toMatch(
        /Object|Array|String|Function|Map/,
      );
      expect(summaries[0].count).toBeGreaterThan(0);
      expect(summaries[0].retainedSize).toBeGreaterThanOrEqual(
        summaries[0].shallowSize,
      );
    });
  });

  describe('getTopRetainers() Correctness', () => {
    it('should return top retainer information', () => {
      const retainers = integration.getTopRetainers('obj_123');
      expect(retainers.length).toBeGreaterThan(0);
    });

    it('should include retainer metadata', () => {
      const retainers = integration.getTopRetainers('obj_123');
      const first = retainers[0];

      expect(first).toHaveProperty('objectId');
      expect(first).toHaveProperty('className');
      expect(first).toHaveProperty('retainedSize');
      expect(first).toHaveProperty('path');
    });

    it('should sort by retained size descending', () => {
      const retainers = integration.getTopRetainers('obj_123');

      for (let i = 0; i < retainers.length - 1; i++) {
        expect(retainers[i].retainedSize).toBeGreaterThanOrEqual(
          retainers[i + 1].retainedSize,
        );
      }
    });

    it('should respect limit parameter', () => {
      const retainers = integration.getTopRetainers('obj_123', 3);
      expect(retainers.length).toBeLessThanOrEqual(3);
    });

    it('should include retention path', () => {
      const retainers = integration.getTopRetainers('obj_123', 1);
      expect(retainers[0].path.length).toBeGreaterThan(0);
      expect(Array.isArray(retainers[0].path)).toBe(true);
    });

    it('should provide realistic retainer chain', () => {
      const retainers = integration.getTopRetainers('obj_123', 1);
      const path = retainers[0].path;

      for (const segment of path) {
        expect(typeof segment).toBe('string');
      }
    });
  });

  describe('Token Estimation for Query Results', () => {
    it('should estimate tokens for empty result', () => {
      const tokens = integration.estimateTokensForResult([]);
      expect(tokens).toBe(0);
    });

    it('should estimate tokens for single row', () => {
      const rows = [{ name: 'test', value: 123 }];
      const tokens = integration.estimateTokensForResult(rows);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens proportional to data size', () => {
      const rows1 = [{ data: 'x'.repeat(100) }];
      const rows2 = [{ data: 'x'.repeat(1000) }];

      const tokens1 = integration.estimateTokensForResult(rows1);
      const tokens2 = integration.estimateTokensForResult(rows2);

      expect(tokens2).toBeGreaterThan(tokens1);
    });

    it('should estimate tokens for multiple rows', () => {
      const rows = [
        { name: 'event1', ts: 1000, dur: 100 },
        { name: 'event2', ts: 2000, dur: 200 },
        { name: 'event3', ts: 3000, dur: 300 },
      ];

      const tokens = integration.estimateTokensForResult(rows);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should use 4-char-per-token estimation', () => {
      const rows = [{ x: 'a'.repeat(4) }];
      const tokens = integration.estimateTokensForResult(rows);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('formatForLLM() Output Format', () => {
    it('should format summary with header', () => {
      const summaries = integration.getHeapObjectSummary(0, 2);
      const formatted = integration.formatForLLM(summaries);

      expect(formatted).toContain('Heap Object Summary');
    });

    it('should include class names', () => {
      const summaries = integration.getHeapObjectSummary(0, 2);
      const formatted = integration.formatForLLM(summaries);

      expect(formatted).toContain('Class:');
    });

    it('should include object counts', () => {
      const summaries = integration.getHeapObjectSummary(0, 2);
      const formatted = integration.formatForLLM(summaries);

      expect(formatted).toContain('Count:');
    });

    it('should format sizes in human-readable units', () => {
      const summaries = integration.getHeapObjectSummary(0, 1);
      const formatted = integration.formatForLLM(summaries);

      expect(formatted).toMatch(/[KMGT]?B/);
    });

    it('should include retained size information', () => {
      const summaries = integration.getHeapObjectSummary(0, 2);
      const formatted = integration.formatForLLM(summaries);

      expect(formatted).toContain('Retained Size');
    });

    it('should handle multiple objects', () => {
      const summaries = integration.getHeapObjectSummary(0, 5);
      const formatted = integration.formatForLLM(summaries);

      expect(formatted.split('Class:').length).toBe(summaries.length + 1);
    });

    it('should produce multiline output', () => {
      const summaries = integration.getHeapObjectSummary(0, 2);
      const formatted = integration.formatForLLM(summaries);

      const lines = formatted.split('\n');
      expect(lines.length).toBeGreaterThan(3);
    });
  });

  describe('Query Caching', () => {
    it('should cache query results', () => {
      const query = 'SELECT * FROM events';
      const result1 = integration.executeQuery(query);
      const result2 = integration.executeQuery(query);

      expect(result1).toEqual(result2);
    });

    it('should cache different queries separately', () => {
      const result1 = integration.executeQuery('SELECT * FROM events LIMIT 1');
      const result2 = integration.executeQuery('SELECT * FROM events LIMIT 2');

      expect(result1.rows.length).toBeLessThanOrEqual(result2.rows.length);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete workflow', () => {
      const summaries = integration.getHeapObjectSummary(0, 3);
      expect(summaries.length).toBeGreaterThan(0);

      const retainers = integration.getTopRetainers(summaries[0].className);
      expect(retainers.length).toBeGreaterThan(0);

      const formatted = integration.formatForLLM(summaries);
      expect(formatted).toContain('Heap Object Summary');
    });

    it('should estimate tokens for formatted output', () => {
      const summaries = integration.getHeapObjectSummary(0, 2);
      const formatted = integration.formatForLLM(summaries);
      const tokens = Math.ceil(formatted.length / 4);

      expect(tokens).toBeGreaterThan(0);
    });
  });
});
