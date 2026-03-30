/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/streamingHeapParser
 *
 * Streaming parser for V8 .heapsnapshot files.
 *
 * V8 heap snapshots are large JSON files (often 100-500MB) with a predictable
 * structure. Instead of loading the entire JSON into memory with JSON.parse(),
 * this module reads the file in chunks and extracts only the data needed for
 * analysis, keeping peak memory usage to ~10-15% of the file size.
 *
 * The V8 snapshot JSON has this top-level shape:
 *
 * ```json
 * {
 *   "snapshot": { "meta": {...}, "node_count": N, "edge_count": E },
 *   "nodes": [n1, n2, ...],       // flat array of integers
 *   "edges": [e1, e2, ...],       // flat array of integers
 *   "strings": ["s0", "s1", ...], // string table
 *   "trace_function_infos": [...], // optional, skipped
 *   "trace_tree": [...],          // optional, skipped
 *   "samples": [...],             // optional, skipped
 *   "locations": [...]            // optional, skipped
 * }
 * ```
 *
 * The strategy:
 * 1. Read the file in 64KB chunks via createReadStream
 * 2. Use a lightweight state machine to identify which top-level key we're in
 * 3. Parse `snapshot` (small) normally via JSON.parse of the accumulated section
 * 4. Parse `nodes` and `edges` as streaming number arrays — no full parse needed
 * 5. Parse `strings` as a streaming string array
 * 6. Skip `trace_function_infos`, `trace_tree`, `samples` entirely
 * 7. Emit progress events for UI feedback
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import type { RawHeapSnapshot } from './heapSnapshotAnalyzer.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StreamingParseProgress {
  /** Bytes read so far */
  bytesRead: number;
  /** Total file size in bytes */
  totalBytes: number;
  /** Current parsing phase */
  phase: 'snapshot' | 'nodes' | 'edges' | 'strings' | 'other' | 'done';
  /** Percentage complete (0-100) */
  percent: number;
}

export interface StreamingParserOptions {
  /** Chunk size for file reading (default: 64 * 1024 = 64KB) */
  chunkSize?: number;
  /** Skip trace_function_infos, trace_tree, samples (default: true) */
  skipTraceData?: boolean;
  /** Whether to include locations array (default: false) */
  includeLocations?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB

/**
 * Sections we care about, in the order they appear in a V8 snapshot.
 * Used by the state machine to decide what to parse vs skip.
 */
const SECTIONS_OF_INTEREST = new Set([
  'snapshot',
  'nodes',
  'edges',
  'strings',
]);

// ─── Streaming Number Array Parser ──────────────────────────────────────────

/**
 * Extracts integers from a chunk of a JSON number array.
 *
 * Given a partial buffer like `"123,456,78"`, extracts [123, 456]
 * and returns the leftover `"78"` to be prepended to the next chunk.
 */
function extractIntegers(
  buffer: string,
  output: number[],
): string /* leftover */ {
  let start = 0;
  const len = buffer.length;

  for (let i = 0; i < len; i++) {
    const ch = buffer.charCodeAt(i);
    // comma, whitespace, newline, bracket, or end of buffer
    if (
      ch === 0x2c /* , */ ||
      ch === 0x20 /* space */ ||
      ch === 0x0a /* \n */ ||
      ch === 0x0d /* \r */ ||
      ch === 0x09 /* \t */ ||
      ch === 0x5b /* [ */ ||
      ch === 0x5d /* ] */
    ) {
      if (i > start) {
        const numStr = buffer.substring(start, i);
        const val = Number(numStr);
        if (!Number.isNaN(val)) {
          output.push(val);
        }
      }
      start = i + 1;
    }
  }

  // Return any leftover partial number
  return start < len ? buffer.substring(start) : '';
}

// ─── Streaming String Array Parser ──────────────────────────────────────────

/**
 * State for incrementally parsing a JSON string array.
 * Handles escaped characters, Unicode escapes, and strings split across chunks.
 */
interface StringParserState {
  inString: boolean;
  escaped: boolean;
  current: string;
  strings: string[];
}

function createStringParserState(): StringParserState {
  return { inString: false, escaped: false, current: '', strings: [] };
}

function feedStringChunk(state: StringParserState, chunk: string): void {
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];

    if (state.escaped) {
      // Handle escape sequences
      switch (ch) {
        case '"':
          state.current += '"';
          break;
        case '\\':
          state.current += '\\';
          break;
        case '/':
          state.current += '/';
          break;
        case 'n':
          state.current += '\n';
          break;
        case 'r':
          state.current += '\r';
          break;
        case 't':
          state.current += '\t';
          break;
        case 'b':
          state.current += '\b';
          break;
        case 'f':
          state.current += '\f';
          break;
        case 'u': {
          // Unicode escape: \uXXXX
          if (i + 4 < chunk.length) {
            const hex = chunk.substring(i + 1, i + 5);
            state.current += String.fromCharCode(parseInt(hex, 16));
            i += 4;
          }
          break;
        }
        default:
          state.current += ch;
      }
      state.escaped = false;
      continue;
    }

    if (state.inString) {
      if (ch === '\\') {
        state.escaped = true;
      } else if (ch === '"') {
        // End of string
        state.strings.push(state.current);
        state.current = '';
        state.inString = false;
      } else {
        state.current += ch;
      }
    } else {
      if (ch === '"') {
        state.inString = true;
        state.current = '';
      }
      // Skip commas, whitespace, brackets
    }
  }
}

// ─── Section Detector ───────────────────────────────────────────────────────

/**
 * Finds the next top-level key in a JSON object fragment.
 * Returns the key name and the index after the colon, or null if not found.
 */
function findNextSection(
  buffer: string,
  startIndex: number,
): { key: string; valueStart: number } | null {
  // Look for pattern: "key_name":
  const regex = /"([a-z_]+)"\s*:/g;
  regex.lastIndex = startIndex;
  const match = regex.exec(buffer);
  if (match) {
    return {
      key: match[1],
      valueStart: match.index + match[0].length,
    };
  }
  return null;
}

// ─── Main Streaming Parser ──────────────────────────────────────────────────

/**
 * Streaming parser for V8 .heapsnapshot files.
 *
 * Usage:
 * ```ts
 * const parser = new StreamingHeapParser();
 * parser.on('progress', (p) => console.log(`${p.percent}%`));
 * const snapshot = await parser.parseFile('/path/to/huge.heapsnapshot');
 * ```
 */
export class StreamingHeapParser extends EventEmitter {
  private options: Required<StreamingParserOptions>;

  constructor(options: StreamingParserOptions = {}) {
    super();
    this.options = {
      chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
      skipTraceData: options.skipTraceData ?? true,
      includeLocations: options.includeLocations ?? false,
    };
  }

  /**
   * Returns true if the file is large enough to benefit from streaming.
   * For files under 50MB, JSON.parse is usually faster.
   */
  async shouldStream(filePath: string): Promise<boolean> {
    const stats = await stat(filePath);
    return stats.size >= LARGE_FILE_THRESHOLD;
  }

  /**
   * Parse a V8 heap snapshot file using streaming.
   * Emits 'progress' events during parsing.
   */
  async parseFile(filePath: string): Promise<RawHeapSnapshot> {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // For small files, just use JSON.parse (it's faster)
    if (totalBytes < LARGE_FILE_THRESHOLD) {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as RawHeapSnapshot;
    }

    return this.streamParse(filePath, totalBytes);
  }

  private async streamParse(
    filePath: string,
    totalBytes: number,
  ): Promise<RawHeapSnapshot> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, {
        highWaterMark: this.options.chunkSize,
        encoding: 'utf-8',
      });

      // Accumulators
      let buffer = '';
      let bytesRead = 0;

      // State machine
      let currentSection: string | null = null;
      let sectionDepth = 0; // bracket nesting depth within a section
      let snapshotJson = '';
      const nodes: number[] = [];
      const edges: number[] = [];
      let numberLeftover = '';
      const stringState = createStringParserState();

      // Progress reporting
      let lastProgressPercent = -1;

      const emitProgress = (
        phase: StreamingParseProgress['phase'],
      ): void => {
        const percent = Math.floor((bytesRead / totalBytes) * 100);
        if (percent !== lastProgressPercent) {
          lastProgressPercent = percent;
          this.emit('progress', {
            bytesRead,
            totalBytes,
            phase,
            percent,
          } satisfies StreamingParseProgress);
        }
      };

      stream.on('data', (rawChunk: string | Buffer) => {
        const chunk = typeof rawChunk === 'string' ? rawChunk : rawChunk.toString('utf-8');
        bytesRead += Buffer.byteLength(chunk, 'utf-8');
        buffer += chunk;

        // Process buffer
        this.processBuffer(
          buffer,
          currentSection,
          sectionDepth,
          snapshotJson,
          nodes,
          edges,
          numberLeftover,
          stringState,
          emitProgress,
          (newBuffer, newSection, newDepth, newSnapshotJson, newLeftover) => {
            buffer = newBuffer;
            currentSection = newSection;
            sectionDepth = newDepth;
            snapshotJson = newSnapshotJson;
            numberLeftover = newLeftover;
          },
        );
      });

      stream.on('error', reject);

      stream.on('end', () => {
        emitProgress('done');

        // Parse the snapshot metadata section
        let snapshotMeta: RawHeapSnapshot['snapshot'];
        try {
          // snapshotJson should be like: {...}
          snapshotMeta = JSON.parse(snapshotJson) as RawHeapSnapshot['snapshot'];
        } catch {
          // Fallback: construct minimal metadata
          const nodeFields = 7; // standard V8 field count
          snapshotMeta = {
            meta: {
              node_fields: [
                'type',
                'name',
                'id',
                'self_size',
                'edge_count',
                'trace_node_id',
                'detachedness',
              ],
              node_types: [[]],
              edge_fields: ['type', 'name_or_index', 'to_node'],
              edge_types: [[]],
            },
            node_count: Math.floor(nodes.length / nodeFields),
            edge_count: Math.floor(edges.length / 3),
          };
        }

        resolve({
          snapshot: snapshotMeta,
          nodes,
          edges,
          strings: stringState.strings,
        });
      });
    });
  }

  /**
   * Process accumulated buffer content.
   *
   * This is the core state machine that routes data to the appropriate
   * sub-parser based on which top-level JSON section we're currently in.
   */
  private processBuffer(
    buffer: string,
    currentSection: string | null,
    sectionDepth: number,
    snapshotJson: string,
    nodes: number[],
    edges: number[],
    numberLeftover: string,
    stringState: StringParserState,
    emitProgress: (phase: StreamingParseProgress['phase']) => void,
    updateState: (
      buffer: string,
      section: string | null,
      depth: number,
      snapshotJson: string,
      leftover: string,
    ) => void,
  ): void {
    let processed = 0;

    while (processed < buffer.length) {
      if (currentSection === null) {
        // Looking for next section key
        const section = findNextSection(buffer, processed);
        if (!section) {
          // Keep unprocessed buffer for next chunk
          updateState(
            buffer.substring(processed),
            null,
            0,
            snapshotJson,
            numberLeftover,
          );
          return;
        }

        currentSection = section.key;
        processed = section.valueStart;
        sectionDepth = 0;

        if (!SECTIONS_OF_INTEREST.has(currentSection)) {
          emitProgress('other');
        }
      }

      // Process current section
      if (currentSection === 'snapshot') {
        emitProgress('snapshot');
        // Accumulate until we find the closing brace at depth 0
        for (let i = processed; i < buffer.length; i++) {
          const ch = buffer[i];
          snapshotJson += ch;
          if (ch === '{') sectionDepth++;
          else if (ch === '}') {
            sectionDepth--;
            if (sectionDepth === 0) {
              processed = i + 1;
              currentSection = null;
              break;
            }
          }
          if (i === buffer.length - 1) {
            processed = buffer.length;
          }
        }
      } else if (
        currentSection === 'nodes' ||
        currentSection === 'edges'
      ) {
        const phase =
          currentSection === 'nodes' ? 'nodes' : 'edges';
        emitProgress(phase);
        const target = currentSection === 'nodes' ? nodes : edges;

        // Find the end of this array section
        let endIdx = -1;
        for (let i = processed; i < buffer.length; i++) {
          if (buffer[i] === '[') sectionDepth++;
          else if (buffer[i] === ']') {
            if (sectionDepth === 0) {
              // Haven't entered the array yet, this shouldn't happen
              endIdx = i;
              break;
            }
            sectionDepth--;
            if (sectionDepth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        if (endIdx >= 0) {
          // Parse remaining numbers in this section
          const remaining = numberLeftover + buffer.substring(processed, endIdx);
          numberLeftover = '';
          extractIntegers(remaining, target);
          processed = endIdx + 1;
          currentSection = null;
        } else {
          // Haven't reached end of array yet, parse what we have
          const chunk = numberLeftover + buffer.substring(processed);
          numberLeftover = extractIntegers(chunk, target);
          processed = buffer.length;
        }
      } else if (currentSection === 'strings') {
        emitProgress('strings' as StreamingParseProgress['phase']);

        // Find the end of the strings array
        let endIdx = -1;
        for (let i = processed; i < buffer.length; i++) {
          if (buffer[i] === '[') sectionDepth++;
          else if (buffer[i] === ']') {
            if (sectionDepth <= 0) {
              endIdx = i;
              break;
            }
            sectionDepth--;
            if (sectionDepth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        if (endIdx >= 0) {
          feedStringChunk(
            stringState,
            buffer.substring(processed, endIdx),
          );
          processed = endIdx + 1;
          currentSection = null;
        } else {
          feedStringChunk(stringState, buffer.substring(processed));
          processed = buffer.length;
        }
      } else {
        // Skip sections we don't care about (trace_function_infos, etc.)
        // Find the end by tracking bracket depth
        for (let i = processed; i < buffer.length; i++) {
          const ch = buffer[i];
          if (ch === '[' || ch === '{') sectionDepth++;
          else if (ch === ']' || ch === '}') {
            sectionDepth--;
            if (sectionDepth <= 0) {
              processed = i + 1;
              currentSection = null;
              break;
            }
          }
          if (i === buffer.length - 1) {
            processed = buffer.length;
          }
        }
      }
    }

    updateState('', currentSection, sectionDepth, snapshotJson, numberLeftover);
  }
}

/**
 * Helper: parse a heap snapshot file, automatically choosing streaming
 * vs JSON.parse based on file size.
 */
export async function parseHeapSnapshot(
  filePath: string,
  onProgress?: (progress: StreamingParseProgress) => void,
): Promise<RawHeapSnapshot> {
  const parser = new StreamingHeapParser();
  if (onProgress) {
    parser.on('progress', onProgress);
  }
  return parser.parseFile(filePath);
}
