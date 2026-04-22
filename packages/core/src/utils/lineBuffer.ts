/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const DEFAULT_MAX_LINE_BYTES = 64 * 1024;
const DEFAULT_TRUNCATION_MARKER = '[…truncated]';

export interface LineBufferOptions {
  /**
   * Maximum allowed length of a single buffered (partial) line before it is
   * force-flushed with a truncation marker. Defaults to 64 KiB.
   */
  maxLineBytes?: number;
  /**
   * Marker appended to the first 64 KiB of an over-sized line. The remainder
   * of that logical line (up to the next newline) is discarded to avoid
   * emitting many truncated fragments for a single runaway line.
   */
  truncationMarker?: string;
}

/**
 * Splits incoming text chunks into complete lines.
 *
 * Used by the shell tool's `stream_output` path to turn Node `Buffer` /
 * decoded-string output from a background process into per-line events for
 * the ACP client.
 *
 * Semantics:
 * - Splits on LF. A preceding CR (CRLF) is stripped.
 * - A lone CR inside a line is preserved (progress-bar redraw is not a line
 *   terminator).
 * - If a partial line grows past `maxLineBytes`, the first `maxLineBytes`
 *   characters are emitted with `truncationMarker` appended, and the rest of
 *   that logical line (up to the next newline) is discarded.
 * - {@link flush} emits any remaining partial line; call on process exit /
 *   abort to avoid dropping the last unterminated fragment.
 */
export class LineBuffer {
  private buffer = '';
  private overflowDiscarding = false;
  private readonly maxLineBytes: number;
  private readonly truncationMarker: string;

  constructor(options: LineBufferOptions = {}) {
    this.maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
    this.truncationMarker =
      options.truncationMarker ?? DEFAULT_TRUNCATION_MARKER;
  }

  /**
   * Feed a chunk of text. Returns zero or more complete lines that became
   * available as a result.
   */
  push(chunk: string): string[] {
    if (!chunk) {
      return [];
    }
    const lines: string[] = [];
    let data = chunk;

    while (data.length > 0) {
      if (this.overflowDiscarding) {
        const nl = data.indexOf('\n');
        if (nl === -1) {
          return lines;
        }
        data = data.slice(nl + 1);
        this.overflowDiscarding = false;
        continue;
      }

      const nl = data.indexOf('\n');
      if (nl === -1) {
        this.buffer += data;
        if (this.buffer.length > this.maxLineBytes) {
          lines.push(
            this.buffer.slice(0, this.maxLineBytes) + this.truncationMarker,
          );
          this.buffer = '';
          this.overflowDiscarding = true;
        }
        return lines;
      }

      let line = this.buffer + data.slice(0, nl);
      this.buffer = '';
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      if (line.length > this.maxLineBytes) {
        line = line.slice(0, this.maxLineBytes) + this.truncationMarker;
      }
      lines.push(line);
      data = data.slice(nl + 1);
    }

    return lines;
  }

  /**
   * Emit the trailing partial line (if any) and reset internal state.
   */
  flush(): string[] {
    if (this.overflowDiscarding) {
      this.overflowDiscarding = false;
      this.buffer = '';
      return [];
    }
    const remaining = this.buffer;
    this.buffer = '';
    if (!remaining) {
      return [];
    }
    const line = remaining.endsWith('\r') ? remaining.slice(0, -1) : remaining;
    return line.length > 0 ? [line] : [];
  }
}
