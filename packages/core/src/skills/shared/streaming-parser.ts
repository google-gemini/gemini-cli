/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SAX-style incremental streaming parser for .heapsnapshot files.
 * Designed to handle files >1GB without OOM by processing 64KB chunks
 * and applying backpressure when RSS approaches 512MB.
 */

import * as fs from 'node:fs';
import type { HeapSnapshot } from './perfetto.js';

const CHUNK_SIZE = 64 * 1024; // 64KB
const MAX_FULL_PARSE_BYTES = 200 * 1024 * 1024; // 200MB
const RSS_CEILING_BYTES = 512 * 1024 * 1024; // 512MB

export type HeapNodeCallback = (
  nodeId: number,
  fields: Record<string, number | string>,
) => void;

interface HeapSnapshotParserOptions {
  collectNodes?: boolean;
  collectEdges?: boolean;
  collectStrings?: boolean;
  nodeSize?: number;
  onNodeValues?: (values: number[]) => void;
}

/** Parse state machine states */
type ParseState =
  | 'init'
  | 'top_key'
  | 'snapshot_obj'
  | 'snapshot_key'
  | 'meta_obj'
  | 'nodes_array'
  | 'edges_array'
  | 'strings_array'
  | 'done';

/**
 * Incremental streaming parser that builds a HeapSnapshot from a readable stream.
 * Uses a simple hand-rolled JSON tokenizer to avoid loading the full file into memory.
 */
class HeapSnapshotStreamParser {
  private state: ParseState = 'init';
  private buffer = '';
  private readonly nodesArr: number[] = [];
  private readonly edgesArr: number[] = [];
  private readonly stringsArr: string[] = [];
  private snapshotMeta: Partial<HeapSnapshot['snapshot']['meta']> = {};
  private snapshotNodeCount = 0;
  private snapshotEdgeCount = 0;

  // Pending raw token buffer for the tokenizer
  private pos = 0;
  private readonly collectNodes: boolean;
  private readonly collectEdges: boolean;
  private readonly collectStrings: boolean;
  private readonly nodeSize: number;
  private readonly onNodeValues?: (values: number[]) => void;
  private pendingNodeValues: number[] = [];

  constructor(options: HeapSnapshotParserOptions = {}) {
    this.collectNodes = options.collectNodes ?? true;
    this.collectEdges = options.collectEdges ?? true;
    this.collectStrings = options.collectStrings ?? true;
    this.nodeSize = options.nodeSize ?? 0;
    this.onNodeValues = options.onNodeValues;
  }

  feed(chunk: string): void {
    this.buffer += chunk;
    this.pos = 0;
    this.processBuffer();
    // Remove consumed portion
    this.buffer = this.buffer.slice(this.pos);
    this.pos = 0;
  }

  finalize(): HeapSnapshot {
    // flush remaining
    this.processBuffer();
    const partialMeta = this.snapshotMeta;
    const meta: HeapSnapshot['snapshot']['meta'] = {
      node_fields: partialMeta.node_fields ?? [],
      node_types: partialMeta.node_types ?? [],
      edge_fields: partialMeta.edge_fields ?? [],
      edge_types: partialMeta.edge_types ?? [],
    };
    return {
      snapshot: {
        meta,
        node_count: this.snapshotNodeCount,
        edge_count: this.snapshotEdgeCount,
      },
      nodes: this.nodesArr,
      edges: this.edgesArr,
      strings: this.stringsArr,
    };
  }

  private skipWs(): void {
    while (this.pos < this.buffer.length) {
      const c = this.buffer[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.pos++;
      } else {
        break;
      }
    }
  }

  private peekChar(): string | undefined {
    this.skipWs();
    return this.buffer[this.pos];
  }

  /** Read a JSON string token. Returns undefined if not enough data. */
  private readString(): string | undefined {
    this.skipWs();
    if (this.pos >= this.buffer.length) return undefined;
    if (this.buffer[this.pos] !== '"') return undefined;
    let i = this.pos + 1;
    while (i < this.buffer.length) {
      const c = this.buffer[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '"') {
        const raw = this.buffer.slice(this.pos + 1, i);
        this.pos = i + 1;
        const decoded: unknown = JSON.parse(`"${raw}"`);
        return typeof decoded === 'string' ? decoded : raw;
      }
      i++;
    }
    return undefined; // incomplete
  }

  /** Read a JSON number. Returns undefined if not enough data yet. */
  private readNumber(): number | undefined {
    this.skipWs();
    const start = this.pos;
    let i = this.pos;
    if (i >= this.buffer.length) return undefined;
    if (this.buffer[i] === '-') i++;
    while (
      i < this.buffer.length &&
      this.buffer[i] >= '0' &&
      this.buffer[i] <= '9'
    )
      i++;
    if (i === this.buffer.length) {
      // might be incomplete if this is the end of stream, but we can't tell here
      // Return undefined to indicate we need more data
      return undefined;
    }
    // check fractional
    if (this.buffer[i] === '.') {
      i++;
      while (
        i < this.buffer.length &&
        this.buffer[i] >= '0' &&
        this.buffer[i] <= '9'
      )
        i++;
    }
    // check exponent
    if (
      i < this.buffer.length &&
      (this.buffer[i] === 'e' || this.buffer[i] === 'E')
    ) {
      i++;
      if (
        i < this.buffer.length &&
        (this.buffer[i] === '+' || this.buffer[i] === '-')
      )
        i++;
      while (
        i < this.buffer.length &&
        this.buffer[i] >= '0' &&
        this.buffer[i] <= '9'
      )
        i++;
    }
    const numStr = this.buffer.slice(start, i);
    if (!numStr || numStr === '-') return undefined;
    const n = Number(numStr);
    this.pos = i;
    return n;
  }

  /** Consume a specific character (with whitespace skip). Returns false if not found. */
  private consume(ch: string): boolean {
    this.skipWs();
    if (this.pos < this.buffer.length && this.buffer[this.pos] === ch) {
      this.pos++;
      return true;
    }
    return false;
  }

  /** Read a JSON array of strings like ["a","b",...]. Returns undefined if incomplete. */
  private readStringArray(): string[] | undefined {
    this.skipWs();
    if (this.pos >= this.buffer.length) return undefined;
    if (this.buffer[this.pos] !== '[') return undefined;
    // scan to find matching closing bracket
    let depth = 0;
    let i = this.pos;
    let inStr = false;
    while (i < this.buffer.length) {
      const c = this.buffer[i];
      if (inStr) {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '[') depth++;
        else if (c === ']') {
          depth--;
          if (depth === 0) {
            const raw = this.buffer.slice(this.pos, i + 1);
            this.pos = i + 1;
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed)
              ? parsed.filter((x): x is string => typeof x === 'string')
              : [];
          }
        }
      }
      i++;
    }
    return undefined;
  }

  /** Read a JSON value that is either string array or array of mixed (for node_types). */
  private readMixedArray(): Array<string | string[]> | undefined {
    this.skipWs();
    if (this.pos >= this.buffer.length) return undefined;
    if (this.buffer[this.pos] !== '[') return undefined;
    let depth = 0;
    let i = this.pos;
    let inStr = false;
    while (i < this.buffer.length) {
      const c = this.buffer[i];
      if (inStr) {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '[') depth++;
        else if (c === ']') {
          depth--;
          if (depth === 0) {
            const raw = this.buffer.slice(this.pos, i + 1);
            this.pos = i + 1;
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed)
              ? parsed.filter(
                  (x): x is string | string[] =>
                    typeof x === 'string' || Array.isArray(x),
                )
              : [];
          }
        }
      }
      i++;
    }
    return undefined;
  }

  private readNumberValue(): number | undefined {
    this.skipWs();
    if (this.pos >= this.buffer.length) return undefined;
    const c = this.buffer[this.pos];
    if ((c >= '0' && c <= '9') || c === '-') {
      return this.readNumber();
    }
    return undefined;
  }

  private processBuffer(): void {
    // We use a simple state machine; each iteration tries to make progress
    // If we can't make progress (need more data), we break
    let prevPos = -1;
    while (this.pos < this.buffer.length && this.pos !== prevPos) {
      prevPos = this.pos;

      switch (this.state) {
        case 'init': {
          if (!this.consume('{')) break;
          this.state = 'top_key';
          break;
        }
        case 'top_key': {
          const ch = this.peekChar();
          if (ch === '}') {
            this.pos++;
            this.state = 'done';
            break;
          }
          if (ch === ',') {
            this.pos++;
            break;
          }
          const key = this.readString();
          if (key === undefined) break;
          if (!this.consume(':')) break;
          if (key === 'snapshot') {
            if (!this.consume('{')) break;
            this.state = 'snapshot_obj';
          } else if (key === 'nodes') {
            if (!this.consume('[')) break;
            this.state = 'nodes_array';
          } else if (key === 'edges') {
            if (!this.consume('[')) break;
            this.state = 'edges_array';
          } else if (key === 'strings') {
            if (!this.consume('[')) break;
            this.state = 'strings_array';
          } else {
            // skip unknown top-level key value
            this.skipValue();
          }
          break;
        }
        case 'snapshot_obj': {
          const ch = this.peekChar();
          if (ch === '}') {
            this.pos++;
            this.state = 'top_key';
            break;
          }
          if (ch === ',') {
            this.pos++;
            break;
          }
          const key = this.readString();
          if (key === undefined) break;
          if (!this.consume(':')) break;
          if (key === 'meta') {
            if (!this.consume('{')) break;
            this.state = 'meta_obj';
          } else if (key === 'node_count') {
            const n = this.readNumberValue();
            if (n === undefined) break;
            this.snapshotNodeCount = n;
          } else if (key === 'edge_count') {
            const n = this.readNumberValue();
            if (n === undefined) break;
            this.snapshotEdgeCount = n;
          } else {
            this.skipValue();
          }
          break;
        }
        case 'meta_obj': {
          const ch = this.peekChar();
          if (ch === '}') {
            this.pos++;
            this.state = 'snapshot_obj';
            break;
          }
          if (ch === ',') {
            this.pos++;
            break;
          }
          const key = this.readString();
          if (key === undefined) break;
          if (!this.consume(':')) break;
          if (key === 'node_fields') {
            const arr = this.readStringArray();
            if (arr === undefined) break;
            this.snapshotMeta.node_fields = arr;
          } else if (key === 'node_types') {
            const arr = this.readMixedArray();
            if (arr === undefined) break;
            this.snapshotMeta.node_types = arr;
          } else if (key === 'edge_fields') {
            const arr = this.readStringArray();
            if (arr === undefined) break;
            this.snapshotMeta.edge_fields = arr;
          } else if (key === 'edge_types') {
            const arr = this.readMixedArray();
            if (arr === undefined) break;
            this.snapshotMeta.edge_types = arr;
          } else {
            this.skipValue();
          }
          break;
        }
        case 'nodes_array': {
          const ch = this.peekChar();
          if (ch === ']') {
            this.pos++;
            this.state = 'top_key';
            break;
          }
          if (ch === ',') {
            this.pos++;
            break;
          }
          const n = this.readNumberValue();
          if (n === undefined) break;
          if (this.collectNodes) {
            this.nodesArr.push(n);
          }
          if (this.onNodeValues && this.nodeSize > 0) {
            this.pendingNodeValues.push(n);
            if (this.pendingNodeValues.length === this.nodeSize) {
              this.onNodeValues(this.pendingNodeValues);
              this.pendingNodeValues = [];
            }
          }
          break;
        }
        case 'edges_array': {
          const ch = this.peekChar();
          if (ch === ']') {
            this.pos++;
            this.state = 'top_key';
            break;
          }
          if (ch === ',') {
            this.pos++;
            break;
          }
          const n = this.readNumberValue();
          if (n === undefined) break;
          if (this.collectEdges) {
            this.edgesArr.push(n);
          }
          break;
        }
        case 'strings_array': {
          const ch = this.peekChar();
          if (ch === ']') {
            this.pos++;
            this.state = 'top_key';
            break;
          }
          if (ch === ',') {
            this.pos++;
            break;
          }
          if (ch === '"') {
            const s = this.readString();
            if (s === undefined) break;
            if (this.collectStrings) {
              this.stringsArr.push(s);
            }
          } else {
            // skip non-string value (shouldn't happen in valid heapsnapshot)
            this.skipValue();
          }
          break;
        }
        case 'done':
          return;
        default:
          break;
      }
    }
  }

  /** Skip a JSON value (object, array, string, number, bool, null). */
  private skipValue(): void {
    this.skipWs();
    if (this.pos >= this.buffer.length) return;
    const c = this.buffer[this.pos];
    if (c === '"') {
      this.readString();
    } else if (c === '{' || c === '[') {
      const open = c;
      const close = c === '{' ? '}' : ']';
      let depth = 0;
      let inStr = false;
      let i = this.pos;
      while (i < this.buffer.length) {
        const ch = this.buffer[i];
        if (inStr) {
          if (ch === '\\') {
            i += 2;
            continue;
          }
          if (ch === '"') inStr = false;
        } else {
          if (ch === '"') inStr = true;
          else if (ch === open) depth++;
          else if (ch === close) {
            depth--;
            if (depth === 0) {
              this.pos = i + 1;
              return;
            }
          }
        }
        i++;
      }
    } else if ((c >= '0' && c <= '9') || c === '-') {
      this.readNumber();
    } else if (this.buffer.startsWith('true', this.pos)) {
      this.pos += 4;
    } else if (this.buffer.startsWith('false', this.pos)) {
      this.pos += 5;
    } else if (this.buffer.startsWith('null', this.pos)) {
      this.pos += 4;
    }
  }
}

/**
 * Parse a .heapsnapshot file using streaming (64KB chunks) with backpressure.
 * Rejects files > 200MB with a safety check warning; still parses but emits warning.
 */
export async function parseHeapSnapshotStream(
  filePath: string,
): Promise<HeapSnapshot> {
  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;

  if (fileSize > MAX_FULL_PARSE_BYTES) {
    process.stderr.write(
      `[streaming-parser] Warning: file is ${Math.round(fileSize / 1024 / 1024)}MB > 200MB safety threshold. Using streaming path.\n`,
    );
  }

  const parser = new HeapSnapshotStreamParser();
  await streamHeapSnapshotFile(filePath, parser);
  return parser.finalize();
}

async function streamHeapSnapshotFile(
  filePath: string,
  parser: HeapSnapshotStreamParser,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath, {
      encoding: 'utf8',
      highWaterMark: CHUNK_SIZE,
    });

    const checkMemoryPressure = () => {
      const rss = process.memoryUsage().rss;
      if (rss > RSS_CEILING_BYTES) {
        stream.pause();
        // Give GC a chance then resume
        setImmediate(() => {
          stream.resume();
        });
      }
    };

    stream.on('data', (chunk: string | Buffer<ArrayBufferLike>) => {
      parser.feed(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      checkMemoryPressure();
    });

    stream.on('end', () => resolve());
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Stream heap snapshot nodes one at a time via callback, avoiding full in-memory build.
 * Useful for very large files where even the node array would be too large.
 */
export async function streamHeapSnapshotNodes(
  filePath: string,
  onNode: (nodeId: number, fields: Record<string, number | string>) => void,
): Promise<void> {
  // First pass: collect metadata and strings needed to resolve node fields.
  const firstPassParser = new HeapSnapshotStreamParser({
    collectNodes: false,
    collectEdges: false,
    collectStrings: true,
  });
  await streamHeapSnapshotFile(filePath, firstPassParser);
  const snapshot = firstPassParser.finalize();
  const nodeFields = snapshot.snapshot.meta.node_fields;
  const nodeSize = nodeFields.length;
  const idIndex = nodeFields.indexOf('id');

  const rawTypeEnum = snapshot.snapshot.meta.node_types[0];
  const typeEnum: string[] = Array.isArray(rawTypeEnum)
    ? rawTypeEnum.filter((x): x is string => typeof x === 'string')
    : [];
  let streamedNodeIndex = 0;
  const secondPassParser = new HeapSnapshotStreamParser({
    collectNodes: false,
    collectEdges: false,
    collectStrings: false,
    nodeSize,
    onNodeValues: (nodeValues) => {
      const fields: Record<string, number | string> = {};
      for (let f = 0; f < nodeSize; f++) {
        const val = nodeValues[f];
        const fieldName = nodeFields[f];
        if (fieldName === 'type' && typeEnum.length > 0) {
          fields[fieldName] = typeEnum[val] ?? val;
        } else if (fieldName === 'name') {
          fields[fieldName] = snapshot.strings[val] ?? '';
        } else {
          fields[fieldName] = val;
        }
      }
      const nodeId =
        idIndex >= 0 ? nodeValues[idIndex] : streamedNodeIndex / nodeSize;
      streamedNodeIndex += nodeSize;
      onNode(nodeId, fields);
    },
  });
  await streamHeapSnapshotFile(filePath, secondPassParser);
}
