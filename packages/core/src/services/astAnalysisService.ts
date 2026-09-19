/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
// Debug logging available via: import { debugLogger } from '../utils/debugLogger.js';

/** A symbol extracted from source code. */
export interface ASTSymbol {
  name: string;
  kind: 'class' | 'function' | 'method' | 'interface' | 'type' | 'enum';
  startLine: number;
  endLine: number;
  signature: string;
  children: ASTSymbol[];
}

/** Structural outline of a single file. */
export interface ASTFileOutline {
  filePath: string;
  language: string;
  symbols: ASTSymbol[];
  totalLines: number;
}

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
};

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  'vendor',
  'target',
]);

/**
 * Extracts structural outlines from source files using regex heuristics.
 *
 * Designed as a zero-dependency fallback for when ast-grep (sg) is not installed.
 * Covers the three capabilities outlined in issue #22745:
 *   1. Symbol-boundary detection for precise method-level reads
 *   2. Structural search by symbol name
 *   3. Compressed codebase mapping (class/function/signature outlines)
 */
export class ASTAnalysisService {
  constructor(private readonly targetDir: string) {}

  /**
   * Returns the structural outline of a single source file.
   */
  async getFileOutline(filePath: string): Promise<ASTFileOutline | null> {
    const resolvedTargetDir = path.resolve(this.targetDir);
    const absPath = path.resolve(resolvedTargetDir, filePath);

    // Guard against path traversal
    const relative = path.relative(resolvedTargetDir, absPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }

    const ext = path.extname(absPath);
    const language = LANG_MAP[ext];
    if (!language) return null;

    // Reject files larger than 2MB to prevent OOM or event loop blocking
    // on minified bundles, logs, or database dumps.
    const MAX_FILE_SIZE = 2 * 1024 * 1024;
    try {
      const stat = await fs.stat(absPath);
      if (stat.size > MAX_FILE_SIZE) return null;
    } catch {
      return null;
    }

    let content: string;
    try {
      content = await fs.readFile(absPath, 'utf-8');
    } catch {
      return null;
    }

    const lines = content.split('\n');
    const symbols = extractSymbols(lines, language);
    return { filePath, language, symbols, totalLines: lines.length };
  }

  /**
   * Finds the start/end line bounds of a named symbol in a file.
   */
  async findSymbolBounds(
    filePath: string,
    symbolName: string,
  ): Promise<{ startLine: number; endLine: number } | null> {
    const outline = await this.getFileOutline(filePath);
    if (!outline) return null;

    const found = findSymbolRecursive(outline.symbols, symbolName);
    if (!found) return null;

    return { startLine: found.startLine, endLine: found.endLine };
  }

  /**
   * Generates a compressed codebase map for LLM consumption.
   * Walks source files up to `maxFiles`, extracts top-level symbols,
   * and returns a text outline with file paths and signatures.
   */
  async getCodebaseMap(
    subDir?: string,
    maxFiles: number = 100,
  ): Promise<string> {
    const resolvedTargetDir = path.resolve(this.targetDir);
    const searchDir = subDir
      ? path.resolve(resolvedTargetDir, subDir)
      : resolvedTargetDir;

    // Guard against path traversal
    const relative = path.relative(resolvedTargetDir, searchDir);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return 'Error: path traversal detected, directory must be within workspace.';
    }

    const files = await collectSourceFiles(searchDir, maxFiles);
    const sections: string[] = [];
    let totalSymbols = 0;

    for (const file of files) {
      const relPath = path.relative(resolvedTargetDir, file);
      const outline = await this.getFileOutline(relPath);
      if (!outline || outline.symbols.length === 0) continue;

      totalSymbols += countSymbols(outline.symbols);
      sections.push(formatOutline(outline));
    }

    const header = `Codebase Map: ${sections.length} files, ${totalSymbols} symbols\n${'='.repeat(50)}`;
    return header + '\n\n' + sections.join('\n\n');
  }
}

// ── Pure helpers (exported for unit testing) ───────────────────────────────

export function extractSymbols(lines: string[], language: string): ASTSymbol[] {
  const symbols: ASTSymbol[] = [];
  const patterns = getDeclarationPatterns(language);

  // Pre-process: strip block comments by replacing their content with spaces.
  // This handles mid-line comments like `code /* comment */ more_code` and
  // multi-line blocks, while preserving line numbers and offsets.
  const cleaned = stripBlockComments(lines, language);

  for (let i = 0; i < cleaned.length; i++) {
    const trimmed = cleaned[i].trim();

    if (
      trimmed === '' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('from ')
    ) {
      continue;
    }

    // Only match at top-level indentation (<=8 spaces for brace langs to support
    // 4-space indented codebases and namespace/module nesting).
    // Use original lines for indent check since cleaned lines may have inflated
    // indentation from blanked block comments.
    const indent = lines[i].length - lines[i].trimStart().length;
    if (language !== 'python' && indent > 8) continue;
    if (language === 'python' && indent > 0) continue;

    for (const { regex, kind } of patterns) {
      const match = regex.exec(trimmed);
      if (!match?.[1]) continue;

      const endLine =
        language === 'python'
          ? findIndentEnd(cleaned, i)
          : findClosingBrace(cleaned, i);

      const sym: ASTSymbol = {
        name: match[1],
        kind,
        startLine: i + 1,
        endLine: endLine + 1,
        signature:
          trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed,
        children:
          kind === 'class' || kind === 'interface'
            ? extractMembers(cleaned, i + 1, endLine, language)
            : [],
      };

      symbols.push(sym);
      // Skip past the symbol body for all block declarations (class, function, enum, etc.)
      // Only 'type' aliases are single-line and should not advance
      if (kind !== 'type') i = endLine;
      break;
    }
  }

  return symbols;
}

/**
 * Strips block comments from source lines by replacing comment
 * characters with spaces. This preserves line count and character offsets
 * so that line-number-based logic (brace counting, indentation) stays correct.
 * Handles mid-line comments, multi-line blocks, and lines with code after a comment.
 */
export function stripBlockComments(
  lines: string[],
  language?: string,
): string[] {
  const result: string[] = [];
  let inComment = false;
  let inString: string | null = null;
  const isPython = language === 'python';

  for (const line of lines) {
    let out = '';
    let j = 0;
    let inLineComment = false;

    while (j < line.length) {
      if (inComment) {
        if (j + 1 < line.length && line[j] === '*' && line[j + 1] === '/') {
          out += '  ';
          j += 2;
          inComment = false;
        } else {
          out += ' ';
          j++;
        }
      } else if (inLineComment) {
        out += ' ';
        j++;
      } else if (inString) {
        // Inside string: blank contents but preserve delimiters
        if (line[j] === '\\' && j + 1 < line.length) {
          out += '  ';
          j += 2;
        } else if (inString.length === 3 && line.startsWith(inString, j)) {
          // Closing triple-quote
          out += inString;
          inString = null;
          j += 3;
        } else if (inString.length === 1 && line[j] === inString) {
          out += line[j];
          inString = null;
          j++;
        } else {
          out += ' ';
          j++;
        }
      } else {
        // Normal code context - language-aware comment detection
        if (
          !isPython &&
          j + 1 < line.length &&
          line[j] === '/' &&
          line[j + 1] === '/'
        ) {
          inLineComment = true;
          out += '//';
          j += 2;
        } else if (isPython && line[j] === '#') {
          inLineComment = true;
          out += '#';
          j++;
        } else if (
          !isPython &&
          j + 1 < line.length &&
          line[j] === '/' &&
          line[j + 1] === '*'
        ) {
          out += '  ';
          j += 2;
          inComment = true;
        } else if (
          isPython &&
          (line.startsWith('"""', j) || line.startsWith("'''", j))
        ) {
          // Python triple-quoted string
          inString = line.startsWith('"""', j) ? '"""' : "'''";
          out += inString;
          j += 3;
        } else if (line[j] === "'" || line[j] === '"' || line[j] === '`') {
          inString = line[j];
          out += line[j];
          j++;
        } else {
          out += line[j];
          j++;
        }
      }
    }
    // Reset single-line string state at end of line. If a single or double
    // quote was not closed (syntax error, unescaped quote, regex), don't let
    // it bleed into subsequent lines. Multi-line delimiters (backtick, triple
    // quotes) intentionally persist across lines.
    if (inString && inString.length === 1 && inString !== '`') {
      inString = null;
    }
    result.push(out);
  }
  return result;
}

export function findClosingBrace(lines: string[], startLine: number): number {
  let depth = 0;
  let parenDepth = 0;
  let opened = false;
  for (let i = startLine; i < lines.length; i++) {
    // Strip string literals (including escaped quotes) and regex literals
    // to avoid false brace matches from patterns like /[{}]/ or /a{1,3}/.
    let stripped = lines[i].replace(
      /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\/(?:[^/\\]|\\.)+\//g,
      '',
    );
    // Strip single-line comments which may contain braces (e.g. "// }")
    const commentIdx = stripped.indexOf('//');
    if (commentIdx >= 0) {
      stripped = stripped.slice(0, commentIdx);
    }
    for (const ch of stripped) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      // Ignore braces inside parentheses (inline object types in params)
      if (parenDepth > 0) continue;
      if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
        if (opened && depth === 0) return i;
      }
    }
  }
  // If brace matching failed, return startLine rather than the end of the file
  // to prevent skipping the entire rest of the file during parsing.
  return startLine;
}

export function findIndentEnd(lines: string[], startLine: number): number {
  const baseIndent =
    lines[startLine].length - lines[startLine].trimStart().length;
  let last = startLine;
  let tripleQuoteChar: '"""' | "'''" | null = null;
  for (let i = startLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track Python triple-quoted strings - must match the same quote type
    let j = 0;
    while (j < trimmed.length) {
      if (tripleQuoteChar) {
        if (trimmed.startsWith(tripleQuoteChar, j)) {
          tripleQuoteChar = null;
          j += 3;
        } else {
          j++;
        }
      } else {
        if (trimmed.startsWith('"""', j)) {
          tripleQuoteChar = '"""';
          j += 3;
        } else if (trimmed.startsWith("'''", j)) {
          tripleQuoteChar = "'''";
          j += 3;
        } else {
          j++;
        }
      }
    }
    if (tripleQuoteChar) {
      last = i;
      continue;
    }

    if (trimmed === '') continue;
    // Skip comment lines - they may have arbitrary indentation and should
    // not terminate the block (e.g. a top-level # comment inside a function)
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      last = i;
      continue;
    }
    const indent = lines[i].length - lines[i].trimStart().length;
    if (indent <= baseIndent) return last;
    last = i;
  }
  return last;
}

function extractMembers(
  lines: string[],
  start: number,
  end: number,
  language: string,
): ASTSymbol[] {
  const members: ASTSymbol[] = [];
  const patterns = getMemberPatterns(language);

  for (let i = start; i < end; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed === '{' || trimmed === '}') continue;
    for (const { regex, kind } of patterns) {
      const match = regex.exec(trimmed);
      if (!match?.[1]) continue;
      const memberEnd =
        language === 'python'
          ? Math.min(findIndentEnd(lines, i), end)
          : Math.min(findClosingBrace(lines, i), end);
      members.push({
        name: match[1],
        kind,
        startLine: i + 1,
        endLine: memberEnd + 1,
        signature:
          trimmed.length > 100 ? trimmed.slice(0, 97) + '...' : trimmed,
        children: [],
      });
      if (kind === 'method' || kind === 'function') i = memberEnd;
      break;
    }
  }

  return members;
}

function findSymbolRecursive(
  symbols: ASTSymbol[],
  name: string,
): ASTSymbol | null {
  for (const s of symbols) {
    if (s.name === name) return s;
    const found = findSymbolRecursive(s.children, name);
    if (found) return found;
  }
  return null;
}

function getDeclarationPatterns(lang: string) {
  const p: Array<{ regex: RegExp; kind: ASTSymbol['kind'] }> = [];
  switch (lang) {
    case 'typescript':
    case 'javascript':
      p.push({
        regex: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
        kind: 'class',
      });
      p.push({ regex: /(?:export\s+)?interface\s+(\w+)/, kind: 'interface' });
      p.push({ regex: /(?:export\s+)?type\s+(\w+)/, kind: 'type' });
      p.push({ regex: /(?:export\s+)?enum\s+(\w+)/, kind: 'enum' });
      p.push({
        regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        kind: 'function',
      });
      break;
    case 'python':
      p.push({ regex: /^class\s+(\w+)/, kind: 'class' });
      p.push({ regex: /^(?:async\s+)?def\s+(\w+)/, kind: 'function' });
      break;
    case 'go':
      p.push({ regex: /^type\s+(\w+)\s+struct/, kind: 'class' });
      p.push({ regex: /^type\s+(\w+)\s+interface/, kind: 'interface' });
      p.push({ regex: /^func\s+(?:\([^)]*\)\s+)?(\w+)/, kind: 'function' });
      break;
    case 'rust':
      p.push({ regex: /(?:pub\s+)?struct\s+(\w+)/, kind: 'class' });
      p.push({ regex: /(?:pub\s+)?trait\s+(\w+)/, kind: 'interface' });
      p.push({ regex: /(?:pub\s+)?enum\s+(\w+)/, kind: 'enum' });
      p.push({ regex: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, kind: 'function' });
      break;
    case 'java':
      p.push({
        regex: /(?:public|private|protected)?\s*class\s+(\w+)/,
        kind: 'class',
      });
      p.push({
        regex: /(?:public|private|protected)?\s*interface\s+(\w+)/,
        kind: 'interface',
      });
      p.push({
        regex: /(?:public|private|protected)?\s*enum\s+(\w+)/,
        kind: 'enum',
      });
      break;
    default:
      break;
  }
  return p;
}

function getMemberPatterns(lang: string) {
  const p: Array<{ regex: RegExp; kind: ASTSymbol['kind'] }> = [];
  switch (lang) {
    case 'typescript':
    case 'javascript':
      p.push({
        regex:
          /(?:public|private|protected|static|async|override|get|set)\s+(\w+)\s*[(<]/,
        kind: 'method',
      });
      p.push({ regex: /^(\w+)\s*\(/, kind: 'method' });
      break;
    case 'python':
      p.push({ regex: /^(?:async\s+)?def\s+(\w+)/, kind: 'method' });
      break;
    case 'go':
      p.push({ regex: /func\s+\([^)]+\)\s+(\w+)/, kind: 'method' });
      break;
    case 'rust':
      p.push({ regex: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, kind: 'method' });
      break;
    case 'java':
      p.push({
        regex: /(?:public|private|protected|static)?\s*\w+\s+(\w+)\s*\(/,
        kind: 'method',
      });
      break;
    default:
      break;
  }
  return p;
}

function formatOutline(outline: ASTFileOutline): string {
  const header = `## ${outline.filePath} (${outline.language}, ${outline.totalLines} lines)`;
  const body = outline.symbols
    .map((s) => {
      const range = `L${s.startLine}-${s.endLine}`;
      let line = `  ${s.kind} ${s.name} [${range}]: ${s.signature}`;
      for (const c of s.children) {
        line += `\n    ${c.kind} ${c.name} [L${c.startLine}-${c.endLine}]: ${c.signature}`;
      }
      return line;
    })
    .join('\n');
  return header + '\n' + body;
}

function countSymbols(syms: ASTSymbol[]): number {
  let n = 0;
  for (const s of syms) {
    n += 1 + countSymbols(s.children);
  }
  return n;
}

/**
 * Walks directories to collect source files with known extensions.
 * Note: This does not currently respect .gitignore or .geminiignore patterns.
 * When called through the `ast_search` tool, path access is validated by the
 * tool's validateToolParamValues and the Config.validatePathAccess check, so
 * ignored files will not be exposed to the user. For codebase map generation,
 * the SKIP_DIRS set covers the most common build/dependency directories.
 * Full ignore-pattern integration should be added via FileDiscoveryService
 * in a follow-up PR.
 */
async function collectSourceFiles(dir: string, max: number): Promise<string[]> {
  // Collect matching files with a hard cap to prevent OOM in huge repos.
  // Entries are sorted at each directory level for deterministic output
  // regardless of OS readdir order, then the final list is sorted and sliced.
  const HARD_CAP = 10_000;
  const files: string[] = [];
  async function walk(d: string, depth: number) {
    if (depth > 15 || files.length >= HARD_CAP) return;
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    // Sort entries alphabetically for deterministic traversal order
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (files.length >= HARD_CAP) return;
      const full = path.join(d, e.name);
      if (
        e.isDirectory() &&
        !SKIP_DIRS.has(e.name) &&
        !e.name.startsWith('.')
      ) {
        await walk(full, depth + 1);
      } else if (e.isFile() && LANG_MAP[path.extname(e.name)]) {
        files.push(full);
      }
    }
  }
  await walk(dir, 0);
  // Already mostly sorted due to per-directory sort; final sort ensures
  // cross-directory ordering, then slice to requested max.
  return files.sort().slice(0, max);
}
