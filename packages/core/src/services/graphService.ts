/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-return */

import * as fs from 'node:fs';
import * as path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export interface GraphNode {
  id: string;
  type: 'function' | 'class';
  name: string;
  line: number;
  args: string | null;
  file: string;
}

export interface GraphEdge {
  from_id: string;
  to_id: string;
  type: 'calls';
}

export interface IndexStats {
  files_indexed: number;
  files_skipped: number;
  total_files: number;
  functions: number;
  classes: number;
  edges: number;
  db_path: string;
}

const DDL = `
CREATE TABLE IF NOT EXISTS nodes (
    id      TEXT PRIMARY KEY,
    type    TEXT NOT NULL,
    name    TEXT NOT NULL,
    line    INTEGER,
    args    TEXT,
    file    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
    from_id TEXT NOT NULL,
    to_id   TEXT NOT NULL,
    type    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manifest (
    file        TEXT PRIMARY KEY,
    hash        TEXT NOT NULL,
    indexed_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS call_index (
    query       TEXT NOT NULL,
    node_id     TEXT NOT NULL,
    hit_count   INTEGER DEFAULT 1,
    last_called TEXT NOT NULL,
    iteration   INTEGER NOT NULL
);
`;

function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

class ParserVisitor {
  nodes: GraphNode[] = [];
  edges: GraphEdge[] = [];

  constructor(public fileRel: string) {}

  addFunction(name: string, line: number, args: string | null) {
    const id = `fn:${name}`;
    this.nodes.push({
      id,
      type: 'function',
      name,
      line,
      args,
      file: this.fileRel,
    });
    return id;
  }

  addClass(name: string, line: number) {
    const id = `cls:${name}`;
    this.nodes.push({
      id,
      type: 'class',
      name,
      line,
      args: null,
      file: this.fileRel,
    });
    return id;
  }

  addCall(fromId: string, toName: string) {
    this.edges.push({ from_id: fromId, to_id: `fn:${toName}`, type: 'calls' });
  }
}

export class GraphService {
  private dbPath: string;
  private db: Database.Database | null = null;
  private root: string;

  constructor(rootPath: string) {
    this.root = rootPath;
    const geminiDir = path.join(this.root, '.gemini');
    if (!fs.existsSync(geminiDir)) {
      fs.mkdirSync(geminiDir, { recursive: true });
    }
    this.dbPath = path.join(geminiDir, 'gemini.idx');
  }

  private connect() {
    if (!this.db) {
      this.db = new Database(this.dbPath);
      this.db.exec(DDL);
    }
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  indexProject(): IndexStats {
    const db = this.connect();
    let filesIndexed = 0;
    let skipped = 0;

    // Very basic regex-based universal parser for now
    const parseFile = (absPath: string, relPath: string) => {
      const source = fs.readFileSync(absPath, 'utf8');
      const lines = source.split('\n');
      const visitor = new ParserVisitor(relPath);

      // Fix 1: \s* allows indented defs (Python class/static methods)
      const funcRegex =
        /^\s*(?:export\s+)?(?:async\s+)?(?:def|function)\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/;
      const classRegex = /^\s*(?:export\s+)?class\s+([a-zA-Z0-9_]+)/;
      const methodRegex = /^\s+(?:async\s+)?([a-zA-Z0-9_]+)\s*\((.*?)\)\s*[{:]/;
      const callRegex = /([a-zA-Z0-9_]+)\s*\(/g;
      // Fix 2: track Python imports as call edges (from x import name)
      const importRegex = /^\s*from\s+[\w.]+\s+import\s+(.+)$/;

      // Fix 2: synthetic module-level node so top-level code is always tracked
      const moduleNodeId = visitor.addFunction(`_module`, 0, '');
      let currentFunction: string = moduleNodeId;

      const KEYWORDS = new Set([
        'if',
        'for',
        'while',
        'switch',
        'catch',
        'function',
        'def',
        'class',
        'return',
        'import',
        'from',
        'as',
        'with',
        'try',
        'except',
        'raise',
        'yield',
        'await',
        'lambda',
        'pass',
        'break',
        'continue',
        'print',
        'len',
        'range',
        'str',
        'int',
        'float',
        'bool',
        'list',
        'dict',
        'set',
        'tuple',
        'type',
        'isinstance',
        'hasattr',
        'getattr',
        'super',
      ]);

      lines.forEach((line, index) => {
        const lineNum = index + 1;
        const fMatch = line.match(funcRegex);
        if (fMatch) {
          currentFunction = visitor.addFunction(
            fMatch[1],
            lineNum,
            fMatch[2] || '',
          );
        } else {
          const cMatch = line.match(classRegex);
          if (cMatch) {
            visitor.addClass(cMatch[1], lineNum);
            // don't reset currentFunction — keep tracking calls inside class body
          } else {
            const mMatch = line.match(methodRegex);
            if (
              mMatch &&
              !line.includes('if (') &&
              !line.includes('for (') &&
              !line.includes('while (')
            ) {
              currentFunction = visitor.addFunction(
                mMatch[1],
                lineNum,
                mMatch[2] || '',
              );
            } else {
              // Fix 2: track import statements as edges
              const iMatch = line.match(importRegex);
              if (iMatch) {
                const names = iMatch[1]
                  .split(',')
                  .map((s) => s.trim().split(' as ')[0].trim());
                for (const name of names) {
                  if (name && /^[a-zA-Z0-9_]+$/.test(name)) {
                    visitor.addCall(currentFunction, name);
                  }
                }
              }
              // Extract all direct calls
              let match;
              callRegex.lastIndex = 0;
              while ((match = callRegex.exec(line)) !== null) {
                const calledName = match[1];
                if (!KEYWORDS.has(calledName)) {
                  visitor.addCall(currentFunction, calledName);
                }
              }
            }
          }
        }
      });
      return visitor;
    };

    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name.startsWith('.') ||
          ['node_modules', '__pycache__', 'venv'].includes(entry.name)
        ) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.root, fullPath);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (/\.(py|ts|js|jsx|tsx|cpp|go|rs|java)$/.test(entry.name)) {
          const fhash = fileHash(fullPath);
          const existing = db
            .prepare('SELECT hash FROM manifest WHERE file=?')
            .get(relPath) as any;

          if (existing && existing.hash === fhash) {
            skipped++;
            continue;
          }

          const visitor = parseFile(fullPath, relPath);

          // Clear stale nodes/edges
          const staleIds = db
            .prepare('SELECT id FROM nodes WHERE file=?')
            .all(relPath) as any[];
          if (staleIds.length > 0) {
            const idsList = staleIds.map((r) => r.id);
            const bindArgs = '?' + ',?'.repeat(idsList.length - 1);
            db.prepare(`DELETE FROM edges WHERE from_id IN (${bindArgs})`).run(
              ...idsList,
            );
            db.prepare('DELETE FROM nodes WHERE file=?').run(relPath);
          }

          // Insert new nodes
          const insertNode = db.prepare(
            'INSERT OR REPLACE INTO nodes(id,type,name,line,args,file) VALUES(?,?,?,?,?,?)',
          );
          for (const n of visitor.nodes)
            insertNode.run(n.id, n.type, n.name, n.line, n.args, n.file);

          // Insert new edges
          const insertEdge = db.prepare(
            `INSERT INTO edges(from_id,to_id,type) VALUES(?,?,'calls')`,
          );
          for (const e of visitor.edges) insertEdge.run(e.from_id, e.to_id);

          // Update manifest
          db.prepare(
            'INSERT OR REPLACE INTO manifest(file,hash,indexed_at) VALUES(?,?,?)',
          ).run(relPath, fhash, nowIso());

          filesIndexed++;
        }
      }
    };

    // Run within transaction
    db.transaction(() => walkDir(this.root))();

    // Generate GEMINI.md
    this.writeGeminiMd(db);

    const fnCount = (
      db
        .prepare("SELECT count(*) as c FROM nodes WHERE type='function'")
        .get() as any
    ).c;
    const clsCount = (
      db
        .prepare("SELECT count(*) as c FROM nodes WHERE type='class'")
        .get() as any
    ).c;
    const edgeCount = (
      db.prepare('SELECT count(*) as c FROM edges').get() as any
    ).c;

    return {
      files_indexed: filesIndexed,
      files_skipped: skipped,
      total_files: filesIndexed + skipped,
      functions: fnCount,
      classes: clsCount,
      edges: edgeCount,
      db_path: this.dbPath,
    };
  }

  private writeGeminiMd(_db: Database.Database) {
    const projectName = path.basename(path.resolve(this.root));
    const newLines = [
      `# ${projectName} — Code Index`,
      '',
      'LOCATIONS only — no callers/callees. Use graph_search(name) before editing any symbol.',
      'graph_search=definition+callers+callees | graph_query=full call chain | grep_search=strings only',
    ];

    const geminiMdPath = path.join(this.root, 'GEMINI.md');

    // If file doesn't exist, create it fresh
    if (!fs.existsSync(geminiMdPath)) {
      fs.writeFileSync(geminiMdPath, newLines.join('\n') + '\n');
      return;
    }

    // File exists — prepend only the lines that aren't already present
    const existing = fs.readFileSync(geminiMdPath, 'utf8');
    const missing = newLines.filter(
      (line) => line.trim() !== '' && !existing.includes(line),
    );

    if (missing.length > 0) {
      fs.writeFileSync(geminiMdPath, missing.join('\n') + '\n\n' + existing);
    }
  }

  queryGraph(search: string): any[] {
    const db = this.connect();
    const pattern = `%${search}%`;
    const rows = db
      .prepare(
        'SELECT id, type, name, line, args, file FROM nodes WHERE name LIKE ? ORDER BY file, line',
      )
      .all(pattern) as GraphNode[];

    // Get iteration
    const itRow = db
      .prepare('SELECT MAX(iteration) as maxIt FROM call_index')
      .get() as any;
    const iteration = (itRow.maxIt || 0) + 1;
    const now = nowIso();

    const results = [];
    for (const row of rows) {
      // Deduplicate and strip synthetic _module nodes to keep output compact
      const callees = [
        ...new Set(
          (
            db
              .prepare(
                `SELECT DISTINCT to_id FROM edges WHERE from_id=? AND type='calls'`,
              )
              .all(row.id) as any[]
          )
            .map((r) => r.to_id as string)
            .filter((id) => !id.endsWith(':_module')),
        ),
      ];
      const callers = [
        ...new Set(
          (
            db
              .prepare(
                `SELECT DISTINCT from_id FROM edges WHERE to_id=? AND type='calls'`,
              )
              .all(row.id) as any[]
          )
            .map((r) => r.from_id as string)
            .filter((id) => !id.endsWith(':_module')),
        ),
      ];

      results.push({
        id: row.id,
        type: row.type,
        name: row.name,
        file: row.file,
        line: row.line,
        args: row.args || null,
        calls: callees,
        calledBy: callers,
      });

      // Update call index
      const existing = db
        .prepare('SELECT hit_count FROM call_index WHERE query=? AND node_id=?')
        .get(search, row.id) as any;
      if (existing) {
        db.prepare(
          'UPDATE call_index SET hit_count=hit_count+1, last_called=?, iteration=? WHERE query=? AND node_id=?',
        ).run(now, iteration, search, row.id);
      } else {
        db.prepare(
          'INSERT INTO call_index(query,node_id,hit_count,last_called,iteration) VALUES(?,?,1,?,?)',
        ).run(search, row.id, now, iteration);
      }
    }

    return results;
  }
}
