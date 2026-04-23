/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type DeobfuscationFindingType =
  | 'base64_subshell'
  | 'hex_escape'
  | 'variable_indirection'
  | 'whitespace_padding'
  | 'unicode_invisible';

export type DeobfuscationSeverity = 'deny' | 'warn';

export interface DeobfuscationFinding {
  type: DeobfuscationFindingType;
  severity: DeobfuscationSeverity;
  decoded: string;
}

export interface DeobfuscationResult {
  original: string;
  decoded: string;
  findings: DeobfuscationFinding[];
}

/**
 * Unicode codepoints with no visible representation and no legitimate use in shell commands.
 * Written as explicit \uXXXX escapes so the regex survives editor/git normalization intact:
 *   U+200B zero-width space, U+200C ZWNJ, U+200D ZWJ,
 *   U+202A–U+202E directional formatting (incl. RTL override U+202E),
 *   U+2060 word joiner, U+FEFF BOM.
 */
const INVISIBLE_UNICODE_RE = /[​‌‍‪‫‬‭‮⁠﻿]/;

/**
 * Base64 subshell patterns:
 *   $(echo <b64> | base64 -d)
 *   $(echo <b64> | base64 --decode)
 *   $(printf '%s' <b64> | base64 -d)
 *   $(base64 -d <<< <b64>)
 *   $(base64 --decode <<< <b64>)
 */
const BASE64_SUBSHELL_RE =
  /\$\(\s*(?:(?:echo|printf\s+['"]?%s['"]?)\s+([A-Za-z0-9+/=]{8,})\s*\|\s*base64\s+(?:-d|--decode)|base64\s+(?:-d|--decode)\s*<<<\s*([A-Za-z0-9+/=]{8,}))\s*\)/g;

/** Hex escape: $'\xNN\xNN...' */
const HEX_ESCAPE_RE = /\$'((?:\\x[0-9a-fA-F]{2})+)'/g;

/** Simple variable indirection: A=value; $A or A=value && $A */
const VAR_ASSIGN_RE = /\b([A-Za-z_][A-Za-z0-9_]*)=([^\s;&|]+)/g;

function tryDecodeBase64(b64: string): string | null {
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    // Only treat as decoded if the result is valid printable text
    if (/^[\x20-\x7E\t\n\r]+$/.test(decoded) && decoded.trim().length > 0) {
      return decoded.trim();
    }
  } catch {
    // fall through
  }
  return null;
}

function resolveHexEscapes(escaped: string): string {
  return escaped.replace(/\\x([0-9a-fA-F]{2})/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function substituteVariables(
  command: string,
  vars: Map<string, string>,
): string {
  let result = command;
  for (const [name, value] of vars) {
    result = result.replace(new RegExp(`\\$${name}\\b`, 'g'), value);
  }
  return result;
}

/**
 * Deobfuscates a shell command string, detecting and decoding known obfuscation techniques.
 * Pure string processing — no shell execution, no LLM, no network.
 */
export function deobfuscateCommand(raw: string): DeobfuscationResult {
  const findings: DeobfuscationFinding[] = [];
  let decoded = raw;

  // 1. Unicode invisible characters — deny immediately
  if (INVISIBLE_UNICODE_RE.test(raw)) {
    const cleaned = raw.replace(
      new RegExp(INVISIBLE_UNICODE_RE.source, 'g'),
      '',
    );
    findings.push({
      type: 'unicode_invisible',
      severity: 'deny',
      decoded: cleaned,
    });
    decoded = cleaned;
  }

  // 2. Whitespace padding — deny
  // Detect meaningful content after >20 spaces before a separator
  const paddingMatch = raw.match(/\S+\s{20,}([;&|]{1,2})\s*\S/);
  if (paddingMatch) {
    const normalized = raw.replace(/\s{20,}([;&|]{1,2})/g, ' $1');
    findings.push({
      type: 'whitespace_padding',
      severity: 'deny',
      decoded: normalized,
    });
    decoded = normalized;
  }

  // 3. Hex escape sequences — warn
  const hexMatches = [...decoded.matchAll(HEX_ESCAPE_RE)];
  if (hexMatches.length > 0) {
    let hexDecoded = decoded;
    for (const m of hexMatches) {
      const resolved = resolveHexEscapes(m[1]!);
      hexDecoded = hexDecoded.replace(m[0], resolved);
    }
    findings.push({
      type: 'hex_escape',
      severity: 'warn',
      decoded: hexDecoded,
    });
    decoded = hexDecoded;
  }

  // 4. Base64-encoded subshells — warn (recurse once into decoded content)
  const base64Matches = [...decoded.matchAll(BASE64_SUBSHELL_RE)];
  if (base64Matches.length > 0) {
    let b64Decoded = decoded;
    for (const m of base64Matches) {
      const b64 = (m[1] ?? m[2])!;
      const plain = tryDecodeBase64(b64);
      if (plain !== null) {
        b64Decoded = b64Decoded.replace(m[0], plain);
      }
    }
    if (b64Decoded !== decoded) {
      findings.push({
        type: 'base64_subshell',
        severity: 'warn',
        decoded: b64Decoded,
      });
      decoded = b64Decoded;
    }
  }

  // 5. Variable indirection — warn (single-level substitution)
  const varMap = new Map<string, string>();
  let varMatch: RegExpExecArray | null;
  VAR_ASSIGN_RE.lastIndex = 0;
  while ((varMatch = VAR_ASSIGN_RE.exec(decoded)) !== null) {
    varMap.set(varMatch[1]!, varMatch[2]!);
  }

  if (varMap.size > 0) {
    const varSubstituted = substituteVariables(decoded, varMap);
    if (varSubstituted !== decoded) {
      findings.push({
        type: 'variable_indirection',
        severity: 'warn',
        decoded: varSubstituted,
      });
      decoded = varSubstituted;
    }
  }

  return { original: raw, decoded, findings };
}

/** Returns true if any deny-severity finding was detected. */
export function hasDenyFinding(result: DeobfuscationResult): boolean {
  return result.findings.some((f) => f.severity === 'deny');
}

/** Returns true if any finding was detected (warn or deny). */
export function hasAnyFinding(result: DeobfuscationResult): boolean {
  return result.findings.length > 0;
}

/** Returns a human-readable summary of what was found. */
export function summarizeFindings(result: DeobfuscationResult): string {
  const names: Record<DeobfuscationFindingType, string> = {
    base64_subshell: 'base64-encoded subshell',
    hex_escape: 'hex escape sequences',
    variable_indirection: 'variable indirection',
    whitespace_padding: 'whitespace padding (potential hidden command)',
    unicode_invisible: 'invisible Unicode characters',
  };
  return result.findings.map((f) => names[f.type]).join('; ');
}
