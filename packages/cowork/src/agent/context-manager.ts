/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * ProjectIndexer — feed entire codebases into Gemini's 2 M-token context window.
 *
 * Strategy
 * ────────
 *   1. Walk the project file tree, respecting a curated ignore list
 *      (node_modules, dist, .git, etc.).
 *   2. For each text file, read its content and track a running token estimate
 *      (heuristic: 4 characters ≈ 1 token, matching GPT/Gemini convention).
 *   3. Stop including file contents once the token budget is exhausted —
 *      but continue recording that the file exists in the manifest.
 *   4. Fetch up to 100 recent git commits so the model understands project
 *      history and can correlate changes with bugs.
 *   5. Assemble a structured Markdown document that can be injected directly
 *      into a Gemini system prompt (or the first user turn).
 *
 * Token budget defaults
 * ─────────────────────
 *   Gemini 2.0 Flash  : 1 048 576 tokens input
 *   Gemini 1.5 Pro    : 2 097 152 tokens input
 *
 *   We default to 1 600 000 to leave ~400 K tokens for the conversation.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default token budget (conservative ceiling for a 2M-token context window). */
const DEFAULT_TOKEN_BUDGET = 1_600_000;

/**
 * Directory / file names that are never interesting to index.
 * Applied at every level of the tree.
 */
const IGNORE_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',
  '.tox',
  'venv',
  '.venv',
  '.bundle',
  'vendor',
  'target',       // Rust / Java
  '.cowork',      // Our own output directory
  '.turbo',
  '.parcel-cache',
]);

/** Source-code and config file extensions we consider worth reading. */
const TEXT_EXTENSIONS = new Set([
  // TypeScript / JavaScript
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  // Config / data
  '.json', '.jsonc', '.json5',
  '.yaml', '.yml', '.toml', '.ini',
  '.env.example',
  // Docs
  '.md', '.mdx', '.txt', '.rst', '.adoc',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.svelte', '.vue',
  // Backend
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hpp',
  '.cs',              // C#
  '.php',
  // Shell
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
  // DB / query
  '.sql', '.graphql', '.gql',
  // Infrastructure
  '.xml', '.svg', '.tf', '.hcl',
  '.dockerfile', '.containerfile',
  // Lock files are intentionally excluded (too noisy)
]);

/** Never read files larger than this. */
const MAX_FILE_BYTES = 256 * 1024; // 256 KiB

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FileEntry {
  /** Path relative to project root (forward slashes). */
  relativePath: string;
  /** UTF-8 content. Empty when `skipped === true`. */
  content: string;
  /** Estimated token count for this file. */
  tokens: number;
  skipped: boolean;
  skipReason?: 'binary' | 'too_large' | 'not_text' | 'budget_exhausted';
}

export interface ProjectContext {
  /** Absolute project root. */
  root: string;
  /** Token budget that was applied. */
  tokenBudget: number;
  /** Tokens actually consumed by included files. */
  totalTokens: number;
  /** All files discovered (included + skipped). */
  files: FileEntry[];
  /** Last ≤100 commits from `git log`, or an explanatory message. */
  gitHistory: string;
  /**
   * Ready-to-use context document.
   * Inject into Gemini's system prompt or prepend to the first user turn.
   */
  document: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rough token estimate: ~4 chars per token (standard GPT/Gemini heuristic). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function shouldIgnore(name: string): boolean {
  return IGNORE_NAMES.has(name);
}

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();

  // Exact name matches for extension-less files.
  const exactNames = new Set([
    'dockerfile',
    'containerfile',
    'makefile',
    'rakefile',
    'gemfile',
    'procfile',
    '.gitignore',
    '.npmignore',
    '.eslintrc',
    '.prettierrc',
    '.editorconfig',
    '.nvmrc',
    '.node-version',
  ]);
  if (exactNames.has(lower)) return true;

  const dot = lower.lastIndexOf('.');
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(lower.slice(dot));
}

/** Detect binary content by scanning for null bytes in the first 8 KiB. */
function looksLikeBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}

// ---------------------------------------------------------------------------
// ProjectIndexer
// ---------------------------------------------------------------------------

/**
 * Walk a project directory and build a comprehensive context document for
 * injection into Gemini's system prompt.
 *
 * ```ts
 * const ctx = await new ProjectIndexer('/my/project').index();
 * // ctx.document is ready to prefix onto a Gemini system prompt
 * console.log(`Indexed ${ctx.files.length} files, ~${ctx.totalTokens} tokens`);
 * ```
 */
export class ProjectIndexer {
  constructor(
    private readonly root: string,
    private readonly tokenBudget: number = DEFAULT_TOKEN_BUDGET,
  ) {}

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  async index(): Promise<ProjectContext> {
    const [files, gitHistory] = await Promise.all([
      this.collectFiles(),
      this.fetchGitHistory(),
    ]);

    const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    const document = this.buildDocument(files, gitHistory, totalTokens);

    return {
      root: this.root,
      tokenBudget: this.tokenBudget,
      totalTokens,
      files,
      gitHistory,
      document,
    };
  }

  // -------------------------------------------------------------------------
  // Private — file collection
  // -------------------------------------------------------------------------

  private async collectFiles(): Promise<FileEntry[]> {
    const results: FileEntry[] = [];
    // Shared mutable budget counter threaded through the recursive walk.
    const budget = { remaining: this.tokenBudget };
    await this.walk(this.root, results, budget);
    return results;
  }

  private async walk(
    dir: string,
    out: FileEntry[],
    budget: { remaining: number },
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // silently skip unreadable directories
    }

    // Process files before directories so shallow files are prioritised within
    // the same depth level when the budget is nearly exhausted.
    const files = entries.filter((e) => e.isFile() && !shouldIgnore(e.name));
    const dirs = entries.filter((e) => e.isDirectory() && !shouldIgnore(e.name));

    for (const f of files) {
      const fullPath = join(dir, f.name);
      const relPath = relative(this.root, fullPath).replace(/\\/g, '/');
      out.push(await this.readEntry(fullPath, relPath, budget));
    }

    for (const d of dirs) {
      await this.walk(join(dir, d.name), out, budget);
    }
  }

  private async readEntry(
    fullPath: string,
    relPath: string,
    budget: { remaining: number },
  ): Promise<FileEntry> {
    const skip = (skipReason: FileEntry['skipReason']): FileEntry => ({
      relativePath: relPath,
      content: '',
      tokens: 0,
      skipped: true,
      skipReason,
    });

    if (!isTextFile(fullPath)) return skip('not_text');

    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      return skip('binary');
    }

    if (fileStat.size > MAX_FILE_BYTES) return skip('too_large');

    let buf: Buffer;
    try {
      buf = await readFile(fullPath);
    } catch {
      return skip('binary');
    }

    if (looksLikeBinary(buf)) return skip('binary');

    const content = buf.toString('utf-8');
    const tokens = estimateTokens(content);

    if (budget.remaining <= 0) return skip('budget_exhausted');

    budget.remaining -= tokens;
    return { relativePath: relPath, content, tokens, skipped: false };
  }

  // -------------------------------------------------------------------------
  // Private — git history
  // -------------------------------------------------------------------------

  private fetchGitHistory(): Promise<string> {
    return new Promise<string>((resolve) => {
      const child = spawn(
        'git',
        ['log', '--oneline', '--no-merges', '--decorate=no', '-100'],
        { cwd: this.root, stdio: ['ignore', 'pipe', 'pipe'] },
      );

      let out = '';
      child.stdout.on('data', (c: Buffer) => (out += c.toString()));
      child.on('close', (code) =>
        resolve(
          code === 0
            ? out.trim()
            : '(not a git repository or git is unavailable)',
        ),
      );
      child.on('error', () => resolve('(git unavailable)'));
    });
  }

  // -------------------------------------------------------------------------
  // Private — document assembly
  // -------------------------------------------------------------------------

  private buildDocument(
    files: FileEntry[],
    gitHistory: string,
    totalTokens: number,
  ): string {
    const included = files.filter((f) => !f.skipped);
    const skipped = files.filter((f) => f.skipped);

    // ── Manifest ────────────────────────────────────────────────────────────
    const manifest = files
      .map((f) => {
        const icon = f.skipped ? '○' : '●';
        const note = f.skipped ? ` [${f.skipReason ?? 'skipped'}]` : '';
        return `  ${icon} ${f.relativePath}${note}`;
      })
      .join('\n');

    // ── File contents ────────────────────────────────────────────────────────
    const fileBlocks = included
      .map(
        (f) =>
          `\n${'═'.repeat(72)}\n` +
          `FILE: ${f.relativePath}  (~${f.tokens.toLocaleString()} tokens)\n` +
          `${'─'.repeat(72)}\n` +
          f.content,
      )
      .join('\n');

    // ── Assemble ─────────────────────────────────────────────────────────────
    return [
      '# PROJECT CONTEXT  (generated by Gemini Cowork)',
      `Root    : ${this.root}`,
      `Indexed : ${included.length} files  ·  ${skipped.length} skipped`,
      `Tokens  : ~${totalTokens.toLocaleString()} consumed  /  ${this.tokenBudget.toLocaleString()} budget`,
      '',
      '## FILE MANIFEST',
      '● = included   ○ = skipped',
      manifest,
      '',
      '## GIT HISTORY  (last 100 commits, no merges)',
      gitHistory || '(no history)',
      '',
      '## FILE CONTENTS',
      fileBlocks,
    ].join('\n');
  }
}
