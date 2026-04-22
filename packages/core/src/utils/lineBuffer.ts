/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const DEFAULT_MAX_LINE_CODE_POINTS = 64 * 1024;
const DEFAULT_TRUNCATION_MARKER = '[…truncated]';

export interface LineBufferOptions {
  /**
   * Maximum allowed number of Unicode code points in a single buffered
   * (partial) line before it is force-flushed with a truncation marker.
   * Defaults to 64 * 1024. Counted via `Array.from(str)` so truncation never
   * splits a surrogate pair or multi-unit emoji.
   */
  maxLineCodePoints?: number;
  /**
   * Marker appended to an over-sized line's prefix. The remainder of that
   * logical line (up to the next newline) is discarded to avoid emitting many
   * truncated fragments for a single runaway line.
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
 * - If a partial line grows past `maxLineCodePoints`, the first
 *   `maxLineCodePoints` code points are emitted with `truncationMarker`
 *   appended, and the rest of that logical line (up to the next newline) is
 *   discarded. Code-point-based slicing guarantees emoji and other extended
 *   Unicode characters are never split mid-surrogate-pair.
 * - {@link flush} emits any remaining partial line; call on process exit /
 *   abort to avoid dropping the last unterminated fragment.
 */
export class LineBuffer {
  private buffer = '';
  private overflowDiscarding = false;
  private readonly maxLineCodePoints: number;
  private readonly truncationMarker: string;

  constructor(options: LineBufferOptions = {}) {
    this.maxLineCodePoints =
      options.maxLineCodePoints ?? DEFAULT_MAX_LINE_CODE_POINTS;
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
        // Slicing via UTF-16 code units (`this.buffer.length` /
        // `.slice(n)`) would split a multi-unit Unicode character at the
        // boundary. Count + slice by code point instead.
        const bufferChars = Array.from(this.buffer);
        if (bufferChars.length > this.maxLineCodePoints) {
          lines.push(
            bufferChars.slice(0, this.maxLineCodePoints).join('') +
              this.truncationMarker,
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
      const lineChars = Array.from(line);
      if (lineChars.length > this.maxLineCodePoints) {
        line =
          lineChars.slice(0, this.maxLineCodePoints).join('') +
          this.truncationMarker;
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
