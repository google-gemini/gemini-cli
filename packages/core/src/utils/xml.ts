/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sanitizes a string for inclusion in a CDATA section.
 * Replaces any instance of ']]>' with ']]]]><![CDATA[>'.
 */
export function sanitizeCData(data: string): string {
  return data.replaceAll(']]>', ']]]]><![CDATA[>');
}

/**
 * Wraps a string in a CDATA section, sanitizing it for safety.
 */
export function wrapCData(data: string): string {
  return `<![CDATA[${sanitizeCData(data)}]]>`;
}

/**
 * Escapes special XML characters in a string.
 */
export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&"']/g, (m) => {
    switch (m) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return m;
    }
  });
}
