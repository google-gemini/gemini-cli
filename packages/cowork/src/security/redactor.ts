/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Secret Scanner and PII Redactor — Phase 5 / SOC2-Ready.
 *
 * Intercepts all text that would be sent to the LLM (prompts, tool outputs,
 * context documents) and replaces sensitive values with typed placeholders
 * before they leave the local machine.
 *
 * Pattern taxonomy
 * ────────────────
 *   API_KEY    — Service-specific API key formats (Gemini, OpenAI, AWS, GH, etc.)
 *   JWT        — JSON Web Tokens
 *   SSH_KEY    — PEM-encoded private keys
 *   PASSWORD   — Bare assignments: password=secret, TOKEN="abc"
 *   PII_EMAIL  — Email addresses
 *   PII_PHONE  — US/international phone numbers
 *   PII_SSN    — US Social Security Numbers
 *   PII_CC     — Luhn-valid credit card numbers
 *   IP_PRIVATE — RFC-1918 private IP addresses (optional: can be noisy)
 *
 * Design decisions
 * ────────────────
 *   • Pure-regex, no AST parsing — fast enough for 2M-token documents.
 *   • Replacement is deterministic: same secret → same placeholder within a session,
 *     enabling the agent to reference "[REDACTED:API_KEY:1]" consistently.
 *   • Findings include start/end offsets so callers can highlight them in a UI.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecretCategory =
  | 'API_KEY'
  | 'JWT'
  | 'SSH_KEY'
  | 'PASSWORD'
  | 'PII_EMAIL'
  | 'PII_PHONE'
  | 'PII_SSN'
  | 'PII_CC'
  | 'IP_PRIVATE';

export interface SecretFinding {
  category: SecretCategory;
  /** Matched value — only populated by `scan()`, not `redact()`. */
  value?: string;
  /** 1-based occurrence index for this category in the document. */
  occurrence: number;
  /** Start character offset in the original text. */
  start: number;
  /** End character offset (exclusive). */
  end: number;
  /** Placeholder that replaced this value. */
  placeholder: string;
}

export interface RedactResult {
  /** Redacted text safe to send to the LLM. */
  text: string;
  /** All secrets found and replaced. */
  findings: SecretFinding[];
  /** Count by category. */
  summary: Partial<Record<SecretCategory, number>>;
}

export interface SecretPattern {
  category: SecretCategory;
  /** RegExp with at least one capture group containing the secret value. */
  pattern: RegExp;
  /** Human-readable name. */
  name: string;
}

// ---------------------------------------------------------------------------
// Built-in patterns
// ---------------------------------------------------------------------------

const BUILTIN_PATTERNS: SecretPattern[] = [
  // ── API Keys ──────────────────────────────────────────────────────────────
  {
    category: 'API_KEY',
    name: 'Google / Gemini API key',
    pattern: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'OpenAI API key',
    pattern: /\b(sk-[A-Za-z0-9]{32,})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'Anthropic API key',
    pattern: /\b(sk-ant-[A-Za-z0-9\-_]{80,})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'AWS access key ID',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'AWS secret access key',
    pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
  },
  {
    category: 'API_KEY',
    name: 'GitHub personal access token',
    pattern: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'GitHub OAuth token',
    pattern: /\b(gho_[A-Za-z0-9]{36})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'Stripe secret key',
    pattern: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'Slack bot token',
    pattern: /\b(xox[bprs]-[A-Za-z0-9\-]{10,})\b/g,
  },
  {
    category: 'API_KEY',
    name: 'NPM access token',
    pattern: /\b(npm_[A-Za-z0-9]{36})\b/g,
  },

  // ── Generic password / token assignments ──────────────────────────────────
  {
    category: 'PASSWORD',
    name: 'Generic password/token assignment',
    pattern:
      /(?:password|passwd|secret|token|api[_-]?key|auth[_-]?key|private[_-]?key|access[_-]?token)\s*[=:]\s*["']([^"'\s]{8,})["']/gi,
  },

  // ── JWTs ──────────────────────────────────────────────────────────────────
  {
    category: 'JWT',
    name: 'JSON Web Token',
    pattern: /\b(eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)\b/g,
  },

  // ── SSH / PEM private keys ─────────────────────────────────────────────────
  {
    category: 'SSH_KEY',
    name: 'PEM private key block',
    pattern: /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g,
  },

  // ── PII ───────────────────────────────────────────────────────────────────
  {
    category: 'PII_EMAIL',
    name: 'Email address',
    pattern: /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g,
  },
  {
    category: 'PII_PHONE',
    name: 'Phone number (US/intl)',
    pattern: /(?<!\d)(\+?1?\s?[\(\[]?\d{3}[\)\].\-\s]{1,2}\d{3}[\.\-\s]\d{4})(?!\d)/g,
  },
  {
    category: 'PII_SSN',
    name: 'US Social Security Number',
    pattern: /(?<!\d)(\d{3}[-\s]\d{2}[-\s]\d{4})(?!\d)/g,
  },
  {
    category: 'PII_CC',
    name: 'Credit card number (Luhn-checked)',
    pattern: /\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b/g,
  },

  // ── Private IP addresses ──────────────────────────────────────────────────
  {
    category: 'IP_PRIVATE',
    name: 'RFC-1918 private IP',
    pattern: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
  },
];

// ---------------------------------------------------------------------------
// Luhn check for credit cards
// ---------------------------------------------------------------------------

function passesLuhn(digits: string): boolean {
  const nums = digits.replace(/\D/g, '');
  if (nums.length < 13 || nums.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i]!, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Redactor
// ---------------------------------------------------------------------------

/**
 * High-performance secret scanner and text redactor.
 *
 * ```ts
 * const redactor = new Redactor();
 *
 * // Check if text contains secrets:
 * const findings = redactor.scan('Token: sk-abc123xxx...');
 *
 * // Redact before sending to LLM:
 * const { text, summary } = redactor.redact(rawPrompt);
 * // text → 'Token: [REDACTED:API_KEY:1]'
 * ```
 */
export class Redactor {
  private readonly patterns: SecretPattern[];
  /** Per-session counter per category → stable placeholder numbering. */
  private readonly counters = new Map<SecretCategory, number>();
  /** Value → placeholder map for deterministic replacement. */
  private readonly cache = new Map<string, string>();

  constructor(extraPatterns: SecretPattern[] = []) {
    this.patterns = [...BUILTIN_PATTERNS, ...extraPatterns];
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Scan `text` and return a list of findings WITHOUT modifying the text.
   * Useful for reporting / alerting before redaction.
   */
  scan(text: string): SecretFinding[] {
    const findings: SecretFinding[] = [];
    const occurrences = new Map<SecretCategory, number>();

    for (const { category, pattern } of this.patterns) {
      // Reset lastIndex to scan from the start for every call.
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const value = match[1] ?? match[0];
        if (!value) continue;

        // Skip credit cards that fail Luhn.
        if (category === 'PII_CC' && !passesLuhn(value)) continue;

        const count = (occurrences.get(category) ?? 0) + 1;
        occurrences.set(category, count);

        findings.push({
          category,
          value,
          occurrence: count,
          start: match.index,
          end: match.index + match[0].length,
          placeholder: `[REDACTED:${category}:${count}]`,
        });
      }
      pattern.lastIndex = 0;
    }

    return findings;
  }

  /**
   * Redact all secrets from `text`, returning the cleaned string and a
   * summary of what was found.
   *
   * Replacements are deterministic within a Redactor instance so the same
   * secret maps to the same placeholder across multiple `redact()` calls.
   */
  redact(text: string): RedactResult {
    const findings: SecretFinding[] = [];
    const summary: Partial<Record<SecretCategory, number>> = {};
    let result = text;

    for (const { category, pattern } of this.patterns) {
      pattern.lastIndex = 0;

      result = result.replace(pattern, (full, group1: string | undefined) => {
        const secret = group1 ?? full;
        if (!secret) return full;

        // Luhn filter for credit cards.
        if (category === 'PII_CC' && !passesLuhn(secret)) return full;

        // Use cache for deterministic replacement.
        if (!this.cache.has(secret)) {
          const n = (this.counters.get(category) ?? 0) + 1;
          this.counters.set(category, n);
          this.cache.set(secret, `[REDACTED:${category}:${n}]`);
        }

        const placeholder = this.cache.get(secret)!;

        // Extract occurrence number from placeholder.
        const occ = parseInt(placeholder.match(/:(\d+)\]$/)![1]!, 10);
        findings.push({
          category,
          occurrence: occ,
          start: result.indexOf(full),
          end: result.indexOf(full) + full.length,
          placeholder,
        });

        summary[category] = (summary[category] ?? 0) + 1;

        // Replace in the full match, preserving prefix/suffix if capture group.
        if (group1) {
          return full.replace(group1, placeholder);
        }
        return placeholder;
      });

      pattern.lastIndex = 0;
    }

    return { text: result, findings, summary };
  }

  /** Add custom patterns at runtime. */
  addPattern(pattern: SecretPattern): void {
    this.patterns.push(pattern);
  }

  /** Reset the per-session counter and cache (useful between sessions). */
  reset(): void {
    this.counters.clear();
    this.cache.clear();
  }
}
