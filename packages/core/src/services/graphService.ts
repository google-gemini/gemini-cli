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
  class_id?: string | null; // Improvement 2: which class this method belongs to
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

export interface ChainNode {
  id: string;
  name: string;
  file: string;
  line: number;
  depth: number;
}

export interface DeepQueryResult {
  id: string;
  type: string;
  name: string;
  file: string;
  line: number;
  args: string | null;
  class_id?: string | null;
  callChain: ChainNode[];
  callerChain: ChainNode[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// DDL
// class_id column is in the CREATE TABLE for new databases.
// Existing databases get it via migrateClassId() ALTER TABLE (safe, nullable).
// idx_nodes_class is created in migrateClassId() after the column is guaranteed
// to exist — cannot be in DDL because existing DBs don't have the column yet
// when DDL runs.
// ---------------------------------------------------------------------------
const DDL = `
CREATE TABLE IF NOT EXISTS nodes (
    id       TEXT PRIMARY KEY,
    type     TEXT NOT NULL,
    name     TEXT NOT NULL,
    line     INTEGER,
    args     TEXT,
    file     TEXT NOT NULL,
    class_id TEXT
);

CREATE TABLE IF NOT EXISTS edges (
    from_id TEXT NOT NULL,
    to_id   TEXT NOT NULL,
    type    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_id);

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

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    name,
    content=nodes,
    content_rowid=rowid,
    tokenize="trigram"
);

CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES('delete', old.rowid, old.name);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, name) VALUES('delete', old.rowid, old.name);
  INSERT INTO nodes_fts(rowid, name) VALUES (new.rowid, new.name);
END;
`;

function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

// ---------------------------------------------------------------------------
// Parser visitor — class_id field added
// ---------------------------------------------------------------------------
class ParserVisitor {
  nodes: GraphNode[] = [];
  edges: GraphEdge[] = [];

  constructor(public fileRel: string) {}

  addFunction(
    name: string,
    line: number,
    args: string | null,
    classId: string | null = null,
  ) {
    const id = `fn:${name}`;
    this.nodes.push({
      id,
      type: 'function',
      name,
      line,
      args,
      file: this.fileRel,
      class_id: classId,
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
      class_id: null,
    });
    return id;
  }

  addCall(fromId: string, toName: string) {
    this.edges.push({ from_id: fromId, to_id: `fn:${toName}`, type: 'calls' });
  }
}

// ---------------------------------------------------------------------------
// Language configs (unchanged from previous version)
// ---------------------------------------------------------------------------
interface LangConfig {
  funcRegex: RegExp | null;
  classRegex: RegExp | null;
  methodRegex: RegExp | null;
  arrowRegex: RegExp | null;
  importRegex: RegExp | null;
}

function getLangConfig(ext: string): LangConfig {
  switch (ext) {
    case '.py':
      return {
        funcRegex: /^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/,
        classRegex: /^\s*class\s+([a-zA-Z0-9_]+)/,
        methodRegex: null,
        arrowRegex: null,
        importRegex: /^\s*from\s+[\w.]+\s+import\s+(.+)$/,
      };
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return {
        funcRegex:
          /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([a-zA-Z0-9_$]+)\s*\((.*?)\)/,
        classRegex:
          /^\s*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/,
        methodRegex:
          /^\s+(?:(?:public|private|protected|static|async|override|abstract|readonly|get|set|declare)\s+)*([a-zA-Z0-9_$]+)\s*\((.*?)\)\s*(?::\s*[^{;]+)?\s*[{;]/,
        arrowRegex:
          /^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*(?::[^=]*)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*(?::[^=>{]*)?\s*=>/,
        importRegex: null,
      };
    case '.go':
      return {
        // Go uses a separate receiver-aware regex in parseFile; this is kept
        // as a fallback shape but go handling is explicit below.
        funcRegex: /^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/,
        classRegex: /^type\s+([a-zA-Z0-9_]+)\s+(?:struct|interface)/,
        methodRegex: null,
        arrowRegex: null,
        importRegex: null,
      };
    case '.rs':
      return {
        funcRegex:
          /^\s*(?:pub\s+(?:crate\s+)?)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*(?:<[^>]*)?\s*\(([^)]*)\)/,
        classRegex: /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([a-zA-Z0-9_]+)/,
        methodRegex: null,
        arrowRegex: null,
        importRegex: null,
      };
    case '.java':
      return {
        funcRegex: null,
        classRegex:
          /^\s*(?:(?:public|private|protected|abstract|final|static)\s+)*(?:class|interface|enum)\s+([a-zA-Z0-9_$]+)/,
        methodRegex:
          /^\s+(?:(?:@\w+\s+)?(?:public|private|protected|static|final|synchronized|abstract|native|default)\s+)*(?:[a-zA-Z0-9_$<>[\]]+\s+)+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\s*[{;]/,
        arrowRegex: null,
        importRegex: null,
      };
    default:
      return {
        funcRegex:
          /^\s*(?:export\s+)?(?:async\s+)?(?:def|function)\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/,
        classRegex: /^\s*(?:export\s+)?class\s+([a-zA-Z0-9_]+)/,
        methodRegex: /^\s+(?:async\s+)?([a-zA-Z0-9_]+)\s*\((.*?)\)\s*[{:]/,
        arrowRegex: null,
        importRegex: /^\s*from\s+[\w.]+\s+import\s+(.+)$/,
      };
  }
}

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
  'new',
  'delete',
  'typeof',
  'instanceof',
  'void',
  'throw',
  'async',
  'const',
  'let',
  'var',
  'require',
  'describe',
  'it',
  'test',
  'expect',
]);

// Go receiver regex: captures (receiver?, name, args)
const GO_FUNC_REGEX =
  /^func\s+(?:\(([^)]*)\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/;

// ---------------------------------------------------------------------------
// GraphService
// ---------------------------------------------------------------------------
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
      this.migrateFts(this.db);
      this.migrateClassId(this.db);
    }
    return this.db;
  }

  /** Backfill FTS5 on first open of a pre-FTS5 database. */
  private migrateFts(db: Database.Database) {
    try {
      const ftsCount = (
        db.prepare('SELECT COUNT(*) as c FROM nodes_fts').get() as any
      ).c as number;
      const nodesCount = (
        db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any
      ).c as number;
      if (ftsCount < nodesCount) {
        db.exec("INSERT INTO nodes_fts(nodes_fts) VALUES('rebuild')");
      }
    } catch {
      // FTS5 unavailable; queries fall back to LIKE
    }
  }

  /**
   * Improvement 2: add class_id column + index to existing databases.
   * ALTER TABLE ADD COLUMN is safe in SQLite — existing rows get NULL.
   * The try/catch handles the "column already exists" error idempotently.
   */
  private migrateClassId(db: Database.Database) {
    try {
      db.exec('ALTER TABLE nodes ADD COLUMN class_id TEXT');
    } catch {
      // Column already exists — nothing to do
    }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_class ON nodes(class_id)');
    } catch {
      // Index creation failed — non-fatal
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // -------------------------------------------------------------------------
  // Parser: language-aware with class context stack (Improvement 2)
  // -------------------------------------------------------------------------
  private parseFile(absPath: string, relPath: string): ParserVisitor {
    const ext = path.extname(relPath).toLowerCase();
    const source = fs.readFileSync(absPath, 'utf8');
    const lines = source.split('\n');
    const visitor = new ParserVisitor(relPath);
    const cfg = getLangConfig(ext);
    const callRegex = /([a-zA-Z0-9_$]+)\s*\(/g;
    const isGo = ext === '.go';

    // Class context stack: tracks nested class scopes by indentation.
    // Each entry: { name, indent } where indent is the column of the
    // `class`/`struct`/`impl` keyword on that line.
    const classStack: Array<{ name: string; indent: number }> = [];

    const moduleNodeId = visitor.addFunction('_module', 0, '');
    let currentFunction: string = moduleNodeId;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      // indent=-1 for blank/whitespace-only lines; blank lines never pop context
      const indent = line.search(/\S/);
      let matched = false;

      // --- Update class context stack based on indentation ---
      // Pop any classes whose scope we have indented out of.
      // Go uses receiver syntax so it doesn't need the stack.
      if (!isGo && indent >= 0) {
        while (
          classStack.length > 0 &&
          indent <= classStack[classStack.length - 1].indent
        ) {
          classStack.pop();
        }
      }

      const topClass = classStack[classStack.length - 1] ?? null;

      // ---------------------------------------------------------------
      // Go: special-cased because receiver syntax gives class directly
      // ---------------------------------------------------------------
      if (isGo) {
        const m = line.match(GO_FUNC_REGEX);
        if (m) {
          let classId: string | null = null;
          if (m[1]) {
            // receiver string e.g. "r *PoissonVlasov" or "p ParticleSystem"
            const parts = m[1].trim().split(/\s+/);
            const rawType = parts[parts.length - 1]?.replace(/^\*/, '') ?? '';
            if (rawType) classId = `cls:${rawType}`;
          }
          currentFunction = visitor.addFunction(
            m[2],
            lineNum,
            m[3] || '',
            classId,
          );
          matched = true;
        }
        if (!matched && cfg.classRegex) {
          const mc = line.match(cfg.classRegex);
          if (mc) {
            visitor.addClass(mc[1], lineNum);
            matched = true;
          }
        }
      } else {
        // ---------------------------------------------------------------
        // All other languages: indentation-based class context stack
        // ---------------------------------------------------------------

        // 1. Named function / def / fn
        if (cfg.funcRegex) {
          const m = line.match(cfg.funcRegex);
          if (m) {
            const classId =
              topClass && indent > topClass.indent
                ? `cls:${topClass.name}`
                : null;
            currentFunction = visitor.addFunction(
              m[1],
              lineNum,
              m[2] || '',
              classId,
            );
            matched = true;
          }
        }

        // 2. Class / struct / interface / enum / trait
        if (!matched && cfg.classRegex) {
          const m = line.match(cfg.classRegex);
          if (m) {
            visitor.addClass(m[1], lineNum);
            // Push AFTER processing so inner defs on same line aren't affected
            classStack.push({ name: m[1], indent: indent >= 0 ? indent : 0 });
            matched = true;
          }
        }

        // 3. Arrow functions (TS/JS)
        if (!matched && cfg.arrowRegex) {
          const m = line.match(cfg.arrowRegex);
          if (m) {
            const classId =
              topClass && indent > topClass.indent
                ? `cls:${topClass.name}`
                : null;
            currentFunction = visitor.addFunction(m[1], lineNum, '', classId);
            matched = true;
          }
        }

        // 4. Class-body methods
        if (!matched && cfg.methodRegex) {
          const m = line.match(cfg.methodRegex);
          if (
            m &&
            !KEYWORDS.has(m[1]) &&
            !line.includes('if (') &&
            !line.includes('for (') &&
            !line.includes('while (')
          ) {
            const classId =
              topClass && indent > topClass.indent
                ? `cls:${topClass.name}`
                : null;
            currentFunction = visitor.addFunction(
              m[1],
              lineNum,
              m[2] || '',
              classId,
            );
            matched = true;
          }
        }
      }

      // ---------------------------------------------------------------
      // Call extraction (same for all languages)
      // ---------------------------------------------------------------
      if (!matched) {
        if (cfg.importRegex) {
          const iMatch = line.match(cfg.importRegex);
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
        }
        callRegex.lastIndex = 0;
        let m;
        while ((m = callRegex.exec(line)) !== null) {
          if (!KEYWORDS.has(m[1])) {
            visitor.addCall(currentFunction, m[1]);
          }
        }
      }
    }
    return visitor;
  }

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------
  indexProject(): IndexStats {
    const db = this.connect();
    let filesIndexed = 0;
    let skipped = 0;

    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name.startsWith('.') ||
          [
            'node_modules',
            '__pycache__',
            'venv',
            'dist',
            'build',
            '.git',
          ].includes(entry.name)
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

          const visitor = this.parseFile(fullPath, relPath);

          // Clear stale data (DELETE triggers auto-remove from FTS5)
          const staleIds = db
            .prepare('SELECT id FROM nodes WHERE file=?')
            .all(relPath) as any[];
          if (staleIds.length > 0) {
            const idsList = staleIds.map((r: any) => r.id as string);
            const bindArgs = '?' + ',?'.repeat(idsList.length - 1);
            db.prepare(`DELETE FROM edges WHERE from_id IN (${bindArgs})`).run(
              ...idsList,
            );
            db.prepare('DELETE FROM nodes WHERE file=?').run(relPath);
          }

          // Insert nodes (INSERT triggers auto-add to FTS5)
          const insertNode = db.prepare(
            'INSERT OR REPLACE INTO nodes(id,type,name,line,args,file,class_id) VALUES(?,?,?,?,?,?,?)',
          );
          for (const n of visitor.nodes) {
            insertNode.run(
              n.id,
              n.type,
              n.name,
              n.line,
              n.args,
              n.file,
              n.class_id ?? null,
            );
          }

          // Insert edges
          const insertEdge = db.prepare(
            `INSERT INTO edges(from_id,to_id,type) VALUES(?,?,'calls')`,
          );
          for (const e of visitor.edges) insertEdge.run(e.from_id, e.to_id);

          db.prepare(
            'INSERT OR REPLACE INTO manifest(file,hash,indexed_at) VALUES(?,?,?)',
          ).run(relPath, fhash, nowIso());

          filesIndexed++;
        }
      }
    };

    db.transaction(() => walkDir(this.root))();
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
      'graph_search=definition+callers+callees+class-methods | graph_query=full call chain (BFS) | grep_search=strings only',
      'graph_search("ClassName.methodName") for exact class-scoped method lookup',
    ];

    const geminiMdPath = path.join(this.root, 'GEMINI.md');

    if (!fs.existsSync(geminiMdPath)) {
      fs.writeFileSync(geminiMdPath, newLines.join('\n') + '\n');
      return;
    }

    const existing = fs.readFileSync(geminiMdPath, 'utf8');
    const missing = newLines.filter(
      (line) => line.trim() !== '' && !existing.includes(line),
    );
    if (missing.length > 0) {
      fs.writeFileSync(geminiMdPath, missing.join('\n') + '\n\n' + existing);
    }
  }

  // -------------------------------------------------------------------------
  // Improvement 3: dot-notation aware FTS5 search
  // "ClassName.method" → FTS5 match on method name + class_id filter
  // Fallback: plain name LIKE for <3 char queries
  // -------------------------------------------------------------------------
  private searchNodes(
    db: Database.Database,
    search: string,
    limit = 200,
  ): GraphNode[] {
    // Dot notation: "ClassName.methodName"
    const dotIdx = search.indexOf('.');
    if (dotIdx > 0 && dotIdx < search.length - 1) {
      const className = search.slice(0, dotIdx);
      const methodName = search.slice(dotIdx + 1);
      const classId = `cls:${className}`;

      if (methodName.length >= 3) {
        try {
          const ftsQuery = '"' + methodName.replace(/"/g, '""') + '"';
          const rows = db
            .prepare(
              `SELECT id, type, name, line, args, file, class_id FROM nodes
               WHERE rowid IN (SELECT rowid FROM nodes_fts WHERE nodes_fts MATCH ?)
                 AND class_id = ?
               ORDER BY file, line
               LIMIT ?`,
            )
            .all(ftsQuery, classId, limit) as GraphNode[];
          if (rows.length > 0) return rows;
        } catch {
          // FTS5 unavailable — fall through to LIKE
        }
      }
      // LIKE fallback for dot notation
      return db
        .prepare(
          `SELECT id, type, name, line, args, file, class_id FROM nodes
           WHERE name LIKE ? AND class_id = ?
           ORDER BY file, line LIMIT ?`,
        )
        .all(`%${methodName}%`, classId, limit) as GraphNode[];
    }

    // Plain search: FTS5 trigram (≥3 chars) or LIKE fallback
    if (search.length >= 3) {
      try {
        const ftsQuery = '"' + search.replace(/"/g, '""') + '"';
        return db
          .prepare(
            `SELECT id, type, name, line, args, file, class_id FROM nodes
             WHERE rowid IN (SELECT rowid FROM nodes_fts WHERE nodes_fts MATCH ?)
             ORDER BY file, line
             LIMIT ?`,
          )
          .all(ftsQuery, limit) as GraphNode[];
      } catch {
        // FTS5 unavailable — fall through
      }
    }
    return db
      .prepare(
        `SELECT id, type, name, line, args, file, class_id FROM nodes
         WHERE name LIKE ? ORDER BY file, line LIMIT ?`,
      )
      .all(`%${search}%`, limit) as GraphNode[];
  }

  // -------------------------------------------------------------------------
  // queryGraph: 1-hop search (graph_search tool)
  // Improvement 1: ghost edges filtered via INNER JOIN on nodes
  // Improvement 2: class nodes include their methods list
  // -------------------------------------------------------------------------
  queryGraph(search: string): any[] {
    const db = this.connect();
    const nodes = this.searchNodes(db, search);
    if (nodes.length === 0) return [];

    const ids = nodes.map((n) => n.id);
    const ph = ids.map(() => '?').join(',');

    // Batch callee fetch — Improvement 1: INNER JOIN filters ghost edges
    const calleesMap = new Map<string, string[]>(ids.map((id) => [id, []]));
    const callersMap = new Map<string, string[]>(ids.map((id) => [id, []]));

    for (const row of db
      .prepare(
        `SELECT DISTINCT e.from_id, e.to_id
         FROM edges e
         INNER JOIN nodes n ON n.id = e.to_id
         WHERE e.from_id IN (${ph}) AND e.type='calls' AND e.to_id NOT LIKE '%:_module'`,
      )
      .all(...ids) as any[]) {
      calleesMap.get(row.from_id)?.push(row.to_id as string);
    }

    for (const row of db
      .prepare(
        `SELECT DISTINCT e.from_id, e.to_id
         FROM edges e
         INNER JOIN nodes n ON n.id = e.from_id
         WHERE e.to_id IN (${ph}) AND e.type='calls' AND e.from_id NOT LIKE '%:_module'`,
      )
      .all(...ids) as any[]) {
      callersMap.get(row.to_id)?.push(row.from_id as string);
    }

    // Improvement 2: batch-fetch methods for any class nodes in results
    const classNodeIds = ids.filter((id) =>
      nodes.find((n) => n.id === id && n.type === 'class'),
    );
    const methodsMap = new Map<string, any[]>();
    if (classNodeIds.length > 0) {
      const clsPh = classNodeIds.map(() => '?').join(',');
      for (const row of db
        .prepare(
          `SELECT id, name, line, args, file, class_id FROM nodes
           WHERE class_id IN (${clsPh}) ORDER BY line`,
        )
        .all(...classNodeIds) as any[]) {
        const key = row.class_id as string;
        if (!methodsMap.has(key)) methodsMap.set(key, []);
        methodsMap.get(key)!.push(row);
      }
    }

    const itRow = db
      .prepare('SELECT MAX(iteration) as maxIt FROM call_index')
      .get() as any;
    const iteration = (itRow.maxIt || 0) + 1;
    const now = nowIso();

    return nodes.map((node) => {
      const existing = db
        .prepare('SELECT hit_count FROM call_index WHERE query=? AND node_id=?')
        .get(search, node.id) as any;
      if (existing) {
        db.prepare(
          'UPDATE call_index SET hit_count=hit_count+1, last_called=?, iteration=? WHERE query=? AND node_id=?',
        ).run(now, iteration, search, node.id);
      } else {
        db.prepare(
          'INSERT INTO call_index(query,node_id,hit_count,last_called,iteration) VALUES(?,?,1,?,?)',
        ).run(search, node.id, now, iteration);
      }

      const result: any = {
        id: node.id,
        type: node.type,
        name: node.name,
        file: node.file,
        line: node.line,
        args: node.args || null,
        class_id: node.class_id || null,
        calls: [...new Set(calleesMap.get(node.id) ?? [])],
        calledBy: [...new Set(callersMap.get(node.id) ?? [])],
      };

      // Class nodes get a methods list (Improvement 2)
      if (node.type === 'class') {
        result.methods = (methodsMap.get(node.id) ?? []).map((m: any) => ({
          id: m.id as string,
          name: m.name as string,
          line: m.line as number,
          args: (m.args as string) || null,
          file: m.file as string,
        }));
      }

      return result;
    });
  }

  // -------------------------------------------------------------------------
  // queryGraphDeep: BFS traversal (graph_query tool)
  // Improvement 1: ghost edges filtered in recursive CTE via JOIN on nodes
  // -------------------------------------------------------------------------
  queryGraphDeep(
    search: string,
    maxDepth = 4,
    maxNodes = 500,
  ): DeepQueryResult[] {
    const db = this.connect();
    const startNodes = this.searchNodes(db, search, 10);
    if (startNodes.length === 0) return [];

    return startNodes.map((startNode) => {
      // Improvement 1: JOIN nodes in recursive step filters ghost edges,
      // preventing BFS from traversing into stdlib dead-ends.
      const calleeRows = db
        .prepare(
          `WITH RECURSIVE call_chain(node_id, depth) AS (
            SELECT ?, 0
            UNION
            SELECT e.to_id, cc.depth + 1
            FROM edges e
            JOIN call_chain cc ON e.from_id = cc.node_id
            JOIN nodes n ON n.id = e.to_id
            WHERE cc.depth < ?
              AND e.type = 'calls'
              AND e.to_id NOT LIKE '%:_module'
          )
          SELECT n.id, n.type, n.name, n.file, n.line, MIN(cc.depth) AS depth
          FROM call_chain cc
          JOIN nodes n ON n.id = cc.node_id
          WHERE cc.node_id != ?
          GROUP BY cc.node_id
          ORDER BY depth, n.file
          LIMIT ?`,
        )
        .all(startNode.id, maxDepth, startNode.id, maxNodes) as any[];

      const callerRows = db
        .prepare(
          `WITH RECURSIVE caller_chain(node_id, depth) AS (
            SELECT ?, 0
            UNION
            SELECT e.from_id, cc.depth + 1
            FROM edges e
            JOIN caller_chain cc ON e.to_id = cc.node_id
            JOIN nodes n ON n.id = e.from_id
            WHERE cc.depth < ?
              AND e.type = 'calls'
              AND e.from_id NOT LIKE '%:_module'
          )
          SELECT n.id, n.type, n.name, n.file, n.line, MIN(cc.depth) AS depth
          FROM caller_chain cc
          JOIN nodes n ON n.id = cc.node_id
          WHERE cc.node_id != ?
          GROUP BY cc.node_id
          ORDER BY depth, n.file
          LIMIT ?`,
        )
        .all(startNode.id, maxDepth, startNode.id, maxNodes) as any[];

      return {
        id: startNode.id,
        type: startNode.type,
        name: startNode.name,
        file: startNode.file,
        line: startNode.line,
        args: startNode.args || null,
        class_id: startNode.class_id || null,
        callChain: calleeRows.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          file: r.file as string,
          line: r.line as number,
          depth: r.depth as number,
        })),
        callerChain: callerRows.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          file: r.file as string,
          line: r.line as number,
          depth: r.depth as number,
        })),
        truncated:
          calleeRows.length >= maxNodes || callerRows.length >= maxNodes,
      };
    });
  }
}
