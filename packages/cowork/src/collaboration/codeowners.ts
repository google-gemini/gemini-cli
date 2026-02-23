/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * CODEOWNERS-Aware Reviewer Suggester — Phase 5 (Team Collaboration).
 *
 * After the agent modifies files, this module:
 *   1. Parses the project's CODEOWNERS file (GitHub / GitLab / Bitbucket format).
 *   2. Matches each modified file against the ownership rules.
 *   3. Ranks owners by how many of the modified files they own.
 *   4. Formats a human-readable reviewer recommendation.
 *
 * CODEOWNERS format reference
 * ────────────────────────────
 *   # Comment
 *   *                  @global-owner1 @global-owner2
 *   *.ts               @typescript-team
 *   /src/auth/         @security-team @backend-team
 *   docs/              @docs-team
 *   packages/cowork/   @gemini-cowork-maintainers
 *
 * Rules are evaluated last-to-first (the last matching rule takes precedence),
 * which is the GitHub CODEOWNERS specification.
 *
 * Usage
 * ─────
 *   const parser = new CodeownersParser();
 *   const rules = parser.parse(fs.readFileSync('CODEOWNERS', 'utf-8'));
 *   const suggester = new ReviewerSuggester(rules);
 *   const recs = suggester.analyze(['src/auth/login.ts', 'src/auth/session.ts']);
 *   console.log(suggester.format(recs));
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeOwnerRule {
  /** Raw pattern from the CODEOWNERS file. */
  pattern: string;
  /** Owners: GitHub handles (@user, @org/team) or email addresses. */
  owners: string[];
  /** 1-based line number in the CODEOWNERS file. */
  lineNumber: number;
}

export interface FileOwnership {
  /** Relative path of the modified file. */
  file: string;
  /** Matching owners (empty when no rule matches). */
  owners: string[];
  /** Which rule matched (null when unowned). */
  matchedRule: CodeOwnerRule | null;
}

export interface ReviewerRecommendation {
  /** Reviewer handle. */
  reviewer: string;
  /** Files this reviewer owns (among the modified set). */
  files: string[];
  /** Number of files owned — higher means higher priority. */
  priority: number;
}

// ---------------------------------------------------------------------------
// CodeownersParser
// ---------------------------------------------------------------------------

/**
 * Parse a raw CODEOWNERS file content into `CodeOwnerRule[]`.
 */
export class CodeownersParser {
  parse(content: string): CodeOwnerRule[] {
    const rules: CodeOwnerRule[] = [];

    content.split('\n').forEach((rawLine, i) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;

      const parts = line.split(/\s+/);
      const pattern = parts[0];
      const owners = parts.slice(1).filter((p) => p.startsWith('@') || p.includes('@'));

      if (pattern && owners.length > 0) {
        rules.push({ pattern, owners, lineNumber: i + 1 });
      }
    });

    return rules;
  }

  /**
   * Load and parse the CODEOWNERS file from the project root.
   * Checks the standard locations: CODEOWNERS, .github/CODEOWNERS, docs/CODEOWNERS.
   */
  async loadFromProject(projectRoot: string): Promise<CodeOwnerRule[]> {
    const candidates = [
      join(projectRoot, 'CODEOWNERS'),
      join(projectRoot, '.github', 'CODEOWNERS'),
      join(projectRoot, '.gitlab', 'CODEOWNERS'),
      join(projectRoot, 'docs', 'CODEOWNERS'),
    ];

    for (const path of candidates) {
      if (existsSync(path)) {
        const content = await readFile(path, 'utf-8');
        return this.parse(content);
      }
    }

    return [];
  }
}

// ---------------------------------------------------------------------------
// ReviewerSuggester
// ---------------------------------------------------------------------------

/**
 * Matches a list of modified files against CODEOWNERS rules and ranks reviewers.
 */
export class ReviewerSuggester {
  constructor(private readonly rules: CodeOwnerRule[]) {}

  /**
   * Determine owners for each modified file and aggregate by reviewer.
   *
   * @param modifiedFiles  Project-relative paths of modified files.
   * @param projectRoot    Absolute project root (used for path normalisation).
   */
  analyze(
    modifiedFiles: string[],
    projectRoot = process.cwd(),
  ): ReviewerRecommendation[] {
    const ownerships = modifiedFiles.map((f) =>
      this.resolveOwnership(f, projectRoot),
    );

    // Aggregate: reviewer → [files]
    const reviewerMap = new Map<string, string[]>();
    for (const { file, owners } of ownerships) {
      for (const owner of owners) {
        const list = reviewerMap.get(owner) ?? [];
        list.push(file);
        reviewerMap.set(owner, list);
      }
    }

    return Array.from(reviewerMap.entries())
      .map(([reviewer, files]) => ({
        reviewer,
        files,
        priority: files.length,
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Return per-file ownership details.  Useful for displaying in the PR
   * description or as an agent thought step.
   */
  resolveAll(modifiedFiles: string[], projectRoot = process.cwd()): FileOwnership[] {
    return modifiedFiles.map((f) => this.resolveOwnership(f, projectRoot));
  }

  /** Format reviewer recommendations as a Markdown table. */
  format(recommendations: ReviewerRecommendation[]): string {
    if (recommendations.length === 0) {
      return '> No CODEOWNERS rules matched the modified files. Consider adding CODEOWNERS entries.';
    }

    const lines = [
      '## Suggested Reviewers (from CODEOWNERS)',
      '',
      '| Reviewer | Files Owned | Priority |',
      '|---|---|---|',
    ];

    for (const { reviewer, files, priority } of recommendations.slice(0, 10)) {
      lines.push(`| ${reviewer} | ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` +${files.length - 3} more` : ''} | ${priority} |`);
    }

    return lines.join('\n');
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private resolveOwnership(file: string, projectRoot: string): FileOwnership {
    // Normalise to relative POSIX path.
    const rel = relative(projectRoot, file).split(sep).join('/');

    // GitHub rule: last matching rule wins — iterate in reverse.
    for (let i = this.rules.length - 1; i >= 0; i--) {
      const rule = this.rules[i]!;
      if (this.matches(rel, rule.pattern)) {
        return { file: rel, owners: rule.owners, matchedRule: rule };
      }
    }

    return { file: rel, owners: [], matchedRule: null };
  }

  /**
   * Match a file path against a CODEOWNERS pattern.
   *
   * Converts the CODEOWNERS glob syntax to a RegExp:
   *   *   → [^/]*    (single path component)
   *   **  → .*       (any path)
   *   ?   → [^/]     (single character, not slash)
   */
  private matches(filePath: string, pattern: string): boolean {
    let p = pattern;

    // Patterns starting with / are anchored to the repo root.
    const anchored = p.startsWith('/');
    if (anchored) p = p.slice(1);

    // Patterns ending with / match all files under that directory.
    if (p.endsWith('/')) p += '**';

    // Escape special regex chars (except * and ?).
    p = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // Convert ** to .* and * to [^/]*.
    p = p.replace(/\\\*\\\*/g, '\u0001').replace(/\\\*/g, '[^/]*').replace(/\u0001/g, '.*');
    p = p.replace(/\?/g, '[^/]');

    const regex = anchored
      ? new RegExp(`^${p}($|/)`)
      : new RegExp(`(^|/)${p}($|/)`);

    return regex.test(filePath);
  }
}
