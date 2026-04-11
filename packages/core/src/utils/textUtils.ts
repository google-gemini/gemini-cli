/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely replaces text with literal strings, avoiding ECMAScript GetSubstitution issues.
 * Escapes $ characters to prevent template interpretation.
 */
export function safeLiteralReplace(
  str: string,
  oldString: string,
  newString: string,
): string {
  if (oldString === '' || !str.includes(oldString)) {
    return str;
  }

  if (!newString.includes('$')) {
    return str.replaceAll(oldString, newString);
  }

  const escapedNewString = newString.replaceAll('$', '$$$$');
  return str.replaceAll(oldString, escapedNewString);
}

/**
 * Checks if a Buffer is likely binary by testing for the presence of NULL bytes.
 * The presence of NULL bytes is a strong indicator that the data is not plain text.
 *
 * When `isPtyOutput` is true, the check strips ANSI escape sequences first and
 * uses a ratio-based threshold instead of failing on a single NULL byte. This
 * prevents false positives caused by PTY control sequences on Windows, which
 * can contain NULL bytes in ANSI/VT escape data.
 *
 * @param data The Buffer to check.
 * @param sampleSize The number of bytes from the start of the buffer to test.
 * @param isPtyOutput If true, apply PTY-aware heuristics to avoid false positives
 *                    from ANSI control sequences (fixes Windows node-pty issue #25164).
 * @returns True if the data appears to be binary, false otherwise.
 */
export function isBinary(
  data: Buffer | null | undefined,
  sampleSize = 512,
  isPtyOutput = false,
): boolean {
  if (!data) {
    return false;
  }

  let sample: Buffer | Uint8Array =
    data.length > sampleSize ? data.subarray(0, sampleSize) : data;

  if (isPtyOutput) {
    // Strip ANSI escape sequences before performing the binary check.
    // PTY streams (especially on Windows) emit VT/ANSI control sequences
    // that can contain null bytes, causing false positives.
    sample = stripAnsiFromBuffer(sample);

    if (sample.length === 0) {
      // If the entire sample was ANSI escape sequences, it's not binary.
      return false;
    }

    // Use a ratio-based threshold for PTY output: if more than 10% of the
    // (non-ANSI) bytes are NULL, consider it binary. A stray null byte in
    // a PTY stream should not trigger binary detection.
    const NULL_BYTE_THRESHOLD = 0.1;
    let nullCount = 0;
    for (const byte of sample) {
      if (byte === 0) {
        nullCount++;
      }
    }
    return nullCount / sample.length > NULL_BYTE_THRESHOLD;
  }

  // Non-PTY path: original strict check — any single NULL byte means binary.
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Strips ANSI/VT escape sequences from a raw byte buffer.
 * This handles CSI sequences (ESC [ ... final_byte), OSC sequences (ESC ] ... ST),
 * and simple two-byte escape sequences (ESC + single char).
 *
 * @param buf The raw buffer to strip ANSI sequences from.
 * @returns A new Buffer with ANSI escape sequences removed.
 */
function stripAnsiFromBuffer(buf: Buffer | Uint8Array): Buffer {
  const ESC = 0x1b;
  const result: number[] = [];
  let i = 0;

  while (i < buf.length) {
    if (buf[i] === ESC) {
      i++; // skip ESC
      if (i >= buf.length) break;

      if (buf[i] === 0x5b) {
        // '[' — CSI sequence: ESC [ <params> <final_byte>
        i++; // skip '['
        // Skip parameter bytes (0x30–0x3F) and intermediate bytes (0x20–0x2F)
        while (i < buf.length && buf[i]! >= 0x20 && buf[i]! <= 0x3f) {
          i++;
        }
        // Skip the final byte (0x40–0x7E)
        if (i < buf.length && buf[i]! >= 0x40 && buf[i]! <= 0x7e) {
          i++;
        }
      } else if (buf[i] === 0x5d) {
        // ']' — OSC sequence: ESC ] ... (ST or BEL)
        i++; // skip ']'
        while (i < buf.length) {
          // ST = ESC '\' (0x1b 0x5c) or BEL (0x07)
          if (buf[i] === 0x07) {
            i++;
            break;
          }
          if (buf[i] === ESC && i + 1 < buf.length && buf[i + 1] === 0x5c) {
            i += 2;
            break;
          }
          i++;
        }
      } else {
        // Simple two-byte escape sequence (ESC + single char)
        i++;
      }
    } else {
      result.push(buf[i]!);
      i++;
    }
  }

  return Buffer.from(result);
}

/**
 * Detects the line ending style of a string.
 * @param content The string content to analyze.
 * @returns '\r\n' for Windows-style, '\n' for Unix-style.
 */
export function detectLineEnding(content: string): '\r\n' | '\n' {
  // If a Carriage Return is found, assume Windows-style endings.
  // This is a simple but effective heuristic.
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Truncates a string to a maximum length, appending a suffix if truncated.
 * @param str The string to truncate.
 * @param maxLength The maximum length of the string.
 * @param suffix The suffix to append if truncated (default: '...[TRUNCATED]').
 * @returns The truncated string.
 */
export function truncateString(
  str: string,
  maxLength: number,
  suffix = '...[TRUNCATED]',
): string {
  if (str.length <= maxLength) {
    return str;
  }

  // This regex matches a "Grapheme Cluster" manually:
  // 1. A surrogate pair OR a single character...
  // 2. Followed by any number of "Combining Marks" (\p{M})
  // 'u' flag is required for Unicode property escapes
  const graphemeRegex = /(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|.)\p{M}*/gu;

  let truncatedStr = '';
  let match: RegExpExecArray | null;

  while ((match = graphemeRegex.exec(str)) !== null) {
    const segment = match[0];

    // If adding the whole cluster (base char + accent) exceeds maxLength, stop.
    if (truncatedStr.length + segment.length > maxLength) {
      break;
    }

    truncatedStr += segment;
    if (truncatedStr.length >= maxLength) break;
  }

  // Final safety check for dangling high surrogates
  if (truncatedStr.length > 0) {
    const lastCode = truncatedStr.charCodeAt(truncatedStr.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      truncatedStr = truncatedStr.slice(0, -1);
    }
  }

  return truncatedStr + suffix;
}

/**
 * Safely replaces placeholders in a template string with values from a replacements object.
 * This performs a single-pass replacement to prevent double-interpolation attacks.
 *
 * @param template The template string containing {{key}} placeholders.
 * @param replacements A record of keys to their replacement values.
 * @returns The resulting string with placeholders replaced.
 */
export function safeTemplateReplace(
  template: string,
  replacements: Record<string, string>,
): string {
  // Regex to match {{key}} in the template string. The regex enforces string naming rules.
  const placeHolderRegex = /\{\{(\w+)\}\}/g;
  return template.replace(placeHolderRegex, (match, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key)
      ? replacements[key]
      : match,
  );
}

/**
 * Sanitizes output for injection into the model conversation.
 * Wraps output in a secure <output> tag and handles potential injection vectors
 * (like closing tags or template patterns) within the data.
 * @param output The raw output to sanitize.
 * @returns The sanitized string ready for injection.
 */
export function sanitizeOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return '';
  }

  // Prevent direct closing tag injection.
  const escaped = trimmed.replaceAll('</output>', '&lt;/output&gt;');
  return `<output>\n${escaped}\n</output>`;
}
