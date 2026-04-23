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
  | 'unicode_invisible'
  | 'decode_limit_reached';

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
 * U+200B zero-width space, U+200C ZWNJ, U+200D ZWJ,
 * U+202A–U+202E directional formatting (incl. RTL override U+202E),
 * U+2060 word joiner, U+FEFF BOM.
 */
const INVISIBLE_UNICODE_RE =
  // eslint-disable-next-line no-misleading-character-class -- intentional match on invisible/bidi codepoints
  /[\u200B\u200C\u200D\u202A-\u202E\u2060\uFEFF]/u;

const INVISIBLE_UNICODE_GLOBAL_RE =
  // eslint-disable-next-line no-misleading-character-class -- intentional match on invisible/bidi codepoints
  /[\u200B\u200C\u200D\u202A-\u202E\u2060\uFEFF]/gu;

/**
 * Base64 subshell patterns including quoted payloads and macOS -D flag:
 *   $(echo <b64> | base64 -d)
 *   $(echo "<b64>" | base64 --decode)
 *   $(printf '%s' <b64> | base64 -D)
 *   $(base64 -d <<< <b64>)
 */
const BASE64_SUBSHELL_RE =
  /\$\(\s*(?:(?:echo|printf\s+['"]?%s['"]?)\s+['"]?([A-Za-z0-9+/=]{8,})['"]?\s*\|\s*base64\s+(?:-d|-D|--decode)|base64\s+(?:-d|-D|--decode)\s*<<<\s*['"]?([A-Za-z0-9+/=]{8,})['"]?)\s*\)/g;

/** Hex escape: $'\xNN\xNN...' */
const HEX_ESCAPE_RE = /\$'((?:\\x[0-9a-fA-F]{2})+)'/g;

/**
 * Variable assignment: handles unquoted, single-quoted, and double-quoted values.
 * Groups: 1=name, 2=single-quoted value, 3=double-quoted value, 4=unquoted value.
 * Uses a lookbehind to avoid matching VAR=val inside larger tokens like `FOO=BAR=baz`.
 */
const VAR_ASSIGN_RE =
  /(?<![=\w])([A-Za-z_][A-Za-z0-9_]*)=(?:'([^']*)'|"([^"]*)"|([^'"\s;&|$][^\s;&|]*))/g;

/** Whitespace padding: 20+ consecutive whitespace chars anywhere in the command. */
const WHITESPACE_PADDING_RE = /\s{20,}/;
const WHITESPACE_PADDING_GLOBAL_RE = /\s{20,}/g;

const MAX_DECODE_ITERATIONS = 10;

function tryDecodeBase64(b64: string): string | null {
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
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
    // Escape name for use in regex; use function replacement to prevent
    // special replacement patterns (e.g. $& $1) from being interpreted.
    result = result.replace(
      new RegExp(`\\$${name}\\b`, 'g'),
      () => value,
    );
  }
  return result;
}

function applyDenyCheck(
  decoded: string,
  findings: DeobfuscationFinding[],
  seenTypes: Set<DeobfuscationFindingType>,
): string {
  if (
    !seenTypes.has('unicode_invisible') &&
    INVISIBLE_UNICODE_RE.test(decoded)
  ) {
    const cleaned = decoded.replace(INVISIBLE_UNICODE_GLOBAL_RE, '');
    findings.push({ type: 'unicode_invisible', severity: 'deny', decoded: cleaned });
    seenTypes.add('unicode_invisible');
    decoded = cleaned;
  }
  if (
    !seenTypes.has('whitespace_padding') &&
    WHITESPACE_PADDING_RE.test(decoded)
  ) {
    const normalized = decoded.replace(WHITESPACE_PADDING_GLOBAL_RE, ' ');
    findings.push({ type: 'whitespace_padding', severity: 'deny', decoded: normalized });
    seenTypes.add('whitespace_padding');
    decoded = normalized;
  }
  return decoded;
}

/**
 * Deobfuscates a shell command string, detecting and decoding known obfuscation techniques.
 * Pure string processing — no shell execution, no LLM, no network.
 *
 * Performs iterative decoding (up to MAX_DECODE_ITERATIONS passes) to handle
 * layered obfuscation, and re-checks deny conditions after decoding so that
 * invisible Unicode or whitespace padding hidden inside encoded payloads is caught.
 */
export function deobfuscateCommand(raw: string): DeobfuscationResult {
  const findings: DeobfuscationFinding[] = [];
  const seenTypes = new Set<DeobfuscationFindingType>();
  let decoded = raw;

  // 1. Deny checks on raw input — catch obvious obfuscation before decoding
  decoded = applyDenyCheck(decoded, findings, seenTypes);

  // 2. Iterative decoding: hex → base64 → variable substitution, until stable
  let stabilized = false;
  for (let iter = 0; iter < MAX_DECODE_ITERATIONS; iter++) {
    const prev = decoded;

    // Hex escape sequences
    const hexMatches = [...decoded.matchAll(HEX_ESCAPE_RE)];
    if (hexMatches.length > 0) {
      let hexDecoded = decoded;
      for (const m of hexMatches) {
        const resolved = resolveHexEscapes(m[1]);
        hexDecoded = hexDecoded.replace(m[0], () => resolved);
      }
      if (hexDecoded !== decoded) {
        if (!seenTypes.has('hex_escape')) {
          findings.push({ type: 'hex_escape', severity: 'warn', decoded: hexDecoded });
          seenTypes.add('hex_escape');
        }
        decoded = hexDecoded;
      }
    }

    // Base64-encoded subshells
    const base64Matches = [...decoded.matchAll(BASE64_SUBSHELL_RE)];
    if (base64Matches.length > 0) {
      let b64Decoded = decoded;
      for (const m of base64Matches) {
        const b64 = m[1] ?? m[2];
        const plain = tryDecodeBase64(b64);
        if (plain !== null) {
          b64Decoded = b64Decoded.replace(m[0], () => plain);
        }
      }
      if (b64Decoded !== decoded) {
        if (!seenTypes.has('base64_subshell')) {
          findings.push({ type: 'base64_subshell', severity: 'warn', decoded: b64Decoded });
          seenTypes.add('base64_subshell');
        }
        decoded = b64Decoded;
      }
    }

    // Variable indirection (single-level substitution)
    const varMap = new Map<string, string>();
    let varMatch: RegExpExecArray | null;
    VAR_ASSIGN_RE.lastIndex = 0;
    while ((varMatch = VAR_ASSIGN_RE.exec(decoded)) !== null) {
      const value = varMatch[2] ?? varMatch[3] ?? varMatch[4];
      if (value !== undefined) {
        varMap.set(varMatch[1], value);
      }
    }
    if (varMap.size > 0) {
      const varSubstituted = substituteVariables(decoded, varMap);
      if (varSubstituted !== decoded) {
        if (!seenTypes.has('variable_indirection')) {
          findings.push({ type: 'variable_indirection', severity: 'warn', decoded: varSubstituted });
          seenTypes.add('variable_indirection');
        }
        decoded = varSubstituted;
      }
    }

    if (decoded === prev) {
      stabilized = true;
      break; // stable — no further decoding possible
    }
  }

  // If the loop exited without stabilizing, residual obfuscation may remain.
  // Surface a deny finding so the caller treats it as "unsafe to silently pass".
  if (!stabilized) {
    findings.push({
      type: 'decode_limit_reached',
      severity: 'deny',
      decoded,
    });
    seenTypes.add('decode_limit_reached');
  }

  // 3. Re-run deny checks on the fully decoded output — catches deny patterns
  //    that were hidden inside encoded payloads and only revealed after decoding.
  decoded = applyDenyCheck(decoded, findings, seenTypes);

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
    decode_limit_reached: 'layered obfuscation beyond decode limit',
  };
  return result.findings.map((f) => names[f.type]).join('; ');
}
