/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terminal-based ASCII/Unicode diagram renderer for Mermaid diagrams.
 *
 * Supports: flowchart (graph TD/LR), sequenceDiagram, classDiagram, erDiagram.
 * Falls back to a formatted source block for unrecognised or overly-complex input.
 */

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_MAX = 64;
const renderCache = new Map<string, string>();

function cacheKey(type: string, content: string): string {
  return `${type}::${content}`;
}

function getCached(key: string): string | undefined {
  return renderCache.get(key);
}

function setCache(key: string, value: string): void {
  if (renderCache.size >= CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, value);
}

// ─── Terminal capabilities ────────────────────────────────────────────────────

export interface TerminalCapabilities {
  supportsUnicode: boolean;
  supportsColor: boolean;
  protocol: 'kitty' | 'iterm2' | 'sixel' | 'ansi' | 'ascii';
  columns: number;
}

export function detectTerminalCapabilities(): TerminalCapabilities {
  const termProgram = process.env['TERM_PROGRAM'] ?? '';
  const term = process.env['TERM'] ?? '';
  const colorterm = process.env['COLORTERM'] ?? '';
  const columns = process.stdout.columns ?? 80;

  const supportsColor =
    colorterm === 'truecolor' ||
    colorterm === '24bit' ||
    term.includes('256color') ||
    term.includes('color');

  const supportsUnicode =
    process.env['LANG']?.includes('UTF') === true ||
    process.env['LC_ALL']?.includes('UTF') === true ||
    process.env['LC_CTYPE']?.includes('UTF') === true ||
    process.platform !== 'win32';

  let protocol: TerminalCapabilities['protocol'] = 'ascii';
  if (termProgram === 'iTerm.app') {
    protocol = 'iterm2';
  } else if (termProgram === 'WezTerm' || term === 'xterm-kitty') {
    protocol = 'kitty';
  } else if (term.includes('256color') || colorterm) {
    protocol = 'ansi';
  }

  return { supportsUnicode, supportsColor, protocol, columns };
}

// ─── Box-drawing helpers ──────────────────────────────────────────────────────

function box(label: string, width?: number): string[] {
  const inner = width ? label.padEnd(width) : label;
  const w = inner.length + 2;
  const top = '┌' + '─'.repeat(w) + '┐';
  const mid = '│ ' + inner + ' │';
  const bot = '└' + '─'.repeat(w) + '┘';
  return [top, mid, bot];
}

function diamond(label: string): string[] {
  const len = label.length + 2;
  const half = Math.ceil(len / 2);
  const topLine = ' '.repeat(half) + '╱' + ' '.repeat(len - 2) + '╲';
  const midLine = '╱ ' + label + ' ╲';
  const botLine = '╲' + ' '.repeat(len) + '╱';
  const closeTop = ' '.repeat(half) + '╲' + ' '.repeat(len - 2) + '╱';
  return [topLine, midLine, botLine, closeTop];
}

function arrowRight(label?: string): string {
  const txt = label ? ` ${label} ` : '──';
  return '──' + txt + '──►';
}

function arrowDown(): string {
  return '  │  ';
}

function arrowDownHead(): string {
  return '  ▼  ';
}

// ─── Flowchart parser/renderer ────────────────────────────────────────────────

type NodeShape = 'rect' | 'diamond' | 'circle' | 'stadium' | 'cylinder';

interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  style: 'solid' | 'dashed' | 'thick';
}

function parseFlowchart(content: string): {
  direction: 'TD' | 'LR';
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
} {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const direction: 'TD' | 'LR' =
    lines[0]?.match(/graph\s+(LR|TD|BT|RL)/i)?.[1]?.toUpperCase() === 'LR'
      ? 'LR'
      : 'TD';

  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  // Patterns for node definitions inline with edges or standalone
  const nodePattern =
    /([A-Za-z0-9_]+)(?:\[([^\]]*)\]|\{([^}]*)\}|\(\(([^)]*)\)\)|\(([^)]*)\)|\[\/([^\]]*)\])/g;
  // Two-pass edge patterns: labeled edges first, then plain.
  // The optional non-capturing group after the node ID skips inline shape labels
  // like A[Label] or A{Label} so that "A[Foo] -->|edge| B" is handled correctly.
  const inlineLabel = '(?:\\[[^\\]]*\\]|\\{[^}]*\\}|\\([^)]*\\))?';
  const labeledEdgePattern = new RegExp(
    `([A-Za-z0-9_]+)${inlineLabel}\\s*--[->]?\\|([^|]*)\\|\\s*([A-Za-z0-9_]+)`,
    'g',
  );
  const plainEdgePattern = new RegExp(
    `([A-Za-z0-9_]+)${inlineLabel}\\s*(-->|---|==>|\\.->)\\s*([A-Za-z0-9_]+)`,
    'g',
  );

  function ensureNode(id: string): FlowNode {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, shape: 'rect' });
    }
    return nodes.get(id)!;
  }

  for (const line of lines) {
    // Extract node definitions
    let m: RegExpExecArray | null;
    const nodeCopy = new RegExp(nodePattern.source, 'g');
    while ((m = nodeCopy.exec(line)) !== null) {
      const id = m[1];
      const label = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? id;
      const shape: NodeShape = m[3]
        ? 'diamond'
        : m[4]
          ? 'circle'
          : m[5]
            ? 'stadium'
            : 'rect';
      nodes.set(id, { id, label, shape });
    }

    // Pass 1: labeled edges (e.g. A -->|Approve| B)
    const seenPairs = new Set<string>();
    const labeledCopy = new RegExp(labeledEdgePattern.source, 'g');
    while ((m = labeledCopy.exec(line)) !== null) {
      const fromId = m[1];
      const edgeLabel = m[2].trim();
      const toId = m[3];
      ensureNode(fromId);
      ensureNode(toId);
      edges.push({ from: fromId, to: toId, label: edgeLabel, style: 'solid' });
      seenPairs.add(`${fromId}->${toId}`);
    }

    // Pass 2: plain edges (-->  ---  ==>  .->), skip pairs already handled
    const plainCopy = new RegExp(plainEdgePattern.source, 'g');
    while ((m = plainCopy.exec(line)) !== null) {
      const fromId = m[1];
      const raw = m[2];
      const toId = m[3];
      if (seenPairs.has(`${fromId}->${toId}`)) continue;
      const style: FlowEdge['style'] = raw.startsWith('=')
        ? 'thick'
        : raw.includes('-.')
          ? 'dashed'
          : 'solid';
      ensureNode(fromId);
      ensureNode(toId);
      edges.push({ from: fromId, to: toId, style });
    }
  }

  return { direction, nodes, edges };
}

function renderFlowchart(content: string): string {
  const { direction, nodes, edges } = parseFlowchart(content);

  if (nodes.size === 0) {
    return renderFallback('flowchart', content);
  }

  // Build levels via BFS from root nodes
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of nodes.keys()) {
    inDegree.set(n, 0);
    adjacency.set(n, []);
  }
  for (const e of edges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    adjacency.get(e.from)?.push(e.to);
  }

  const levels: string[][] = [];
  const visited = new Set<string>();
  let current = [...nodes.keys()].filter((n) => (inDegree.get(n) ?? 0) === 0);
  if (current.length === 0) current = [nodes.keys().next().value!]; // cycle fallback

  while (current.length > 0) {
    levels.push(current);
    current.forEach((n) => visited.add(n));
    const next: string[] = [];
    for (const n of current) {
      for (const child of adjacency.get(n) ?? []) {
        if (!visited.has(child)) next.push(child);
      }
    }
    current = [...new Set(next)];
  }
  // Add any disconnected nodes
  for (const n of nodes.keys()) {
    if (!visited.has(n)) levels.push([n]);
  }

  const lines: string[] = [];
  const nodeLabel = (id: string) => nodes.get(id)?.label ?? id;

  if (direction === 'TD') {
    // Top-down: each level on one row, nodes side by side
    for (let li = 0; li < levels.length; li++) {
      const level = levels[li];
      const nodeBoxes = level.map((id) => {
        const nd = nodes.get(id)!;
        return nd.shape === 'diamond' ? diamond(nd.label) : box(nd.label);
      });

      const height = Math.max(...nodeBoxes.map((b) => b.length));
      for (let row = 0; row < height; row++) {
        lines.push(
          nodeBoxes
            .map((b) => b[row] ?? ' '.repeat((b[0] ?? '').length))
            .join('   '),
        );
      }

      // Draw edges to next level
      if (li < levels.length - 1) {
        const nextLevel = levels[li + 1];
        // Find edges from this level to next
        const relevant = edges.filter(
          (e) => level.includes(e.from) && nextLevel.includes(e.to),
        );
        if (relevant.length > 0) {
          lines.push(arrowDown());
          for (const e of relevant) {
            const lbl = e.label
              ? `${nodeLabel(e.from)} ──[${e.label}]──► ${nodeLabel(e.to)}`
              : '';
            if (lbl) lines.push(`  ${lbl}`);
          }
          lines.push(arrowDownHead());
        } else {
          lines.push(arrowDown());
          lines.push(arrowDownHead());
        }
      }
    }
  } else {
    // Left-right: nodes listed vertically, arrows show flow
    for (const level of levels) {
      for (const id of level) {
        const nd = nodes.get(id)!;
        const bx = nd.shape === 'diamond' ? diamond(nd.label) : box(nd.label);
        for (const l of bx) lines.push(l);
        const outs = edges.filter((e) => e.from === id);
        for (const e of outs) {
          lines.push('  ' + arrowRight(e.label) + ' ' + nodeLabel(e.to));
        }
      }
    }
  }

  return lines.join('\n');
}

// ─── Sequence diagram renderer ────────────────────────────────────────────────

interface SeqMessage {
  type: 'message' | 'note' | 'activate' | 'deactivate' | 'loop' | 'alt' | 'end';
  from?: string;
  to?: string;
  text: string;
  style?: 'solid' | 'dashed';
}

function parseSequence(content: string): {
  participants: string[];
  aliases: Map<string, string>;
  messages: SeqMessage[];
} {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const participants: string[] = [];
  const aliases = new Map<string, string>();
  const messages: SeqMessage[] = [];

  // Implicit participant tracking
  const seenParticipants = new Set<string>();

  function addParticipant(id: string) {
    if (!seenParticipants.has(id)) {
      seenParticipants.add(id);
      participants.push(id);
    }
  }

  for (const line of lines) {
    if (/^sequenceDiagram/i.test(line)) continue;

    const partMatch = line.match(
      /^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i,
    );
    if (partMatch) {
      const id = partMatch[1];
      const alias = partMatch[2]?.trim() ?? id;
      addParticipant(id);
      aliases.set(id, alias);
      continue;
    }

    const msgMatch = line.match(
      /^(\S+)\s*(->>|-->>|->|-->|-x|--x)\s*(\S+)\s*:\s*(.+)$/,
    );
    if (msgMatch) {
      const from = msgMatch[1];
      const arrow = msgMatch[2];
      const to = msgMatch[3];
      const text = msgMatch[4].trim();
      addParticipant(from);
      addParticipant(to);
      messages.push({
        type: 'message',
        from,
        to,
        text,
        style:
          arrow.includes('-') && arrow.startsWith('--') ? 'dashed' : 'solid',
      });
      continue;
    }

    const noteMatch = line.match(
      /^Note\s+(?:over|left of|right of)\s+(\S+)\s*:\s*(.+)$/i,
    );
    if (noteMatch) {
      messages.push({ type: 'note', from: noteMatch[1], text: noteMatch[2] });
      continue;
    }

    if (/^loop\s+(.+)$/i.test(line)) {
      messages.push({ type: 'loop', text: line.replace(/^loop\s+/i, '') });
    } else if (/^alt\s+(.+)$/i.test(line)) {
      messages.push({ type: 'alt', text: line.replace(/^alt\s+/i, '') });
    } else if (/^end$/i.test(line)) {
      messages.push({ type: 'end', text: 'end' });
    }
  }

  return { participants, aliases, messages };
}

function renderSequence(content: string): string {
  const { participants, aliases, messages } = parseSequence(content);

  if (participants.length === 0) {
    return renderFallback('sequence', content);
  }

  const COL_WIDTH = 18;
  const HALF = Math.floor(COL_WIDTH / 2);

  function displayName(id: string): string {
    return (aliases.get(id) ?? id).substring(0, COL_WIDTH - 2);
  }

  function colCenter(idx: number): number {
    return idx * COL_WIDTH + HALF;
  }

  function participantLine(): string {
    return participants.map((p) => displayName(p).padEnd(COL_WIDTH)).join('');
  }

  function separatorLine(): string {
    return participants
      .map(() => '─'.repeat(HALF) + '┬' + '─'.repeat(HALF - 1))
      .join('');
  }

  function lifelines(): string {
    return participants
      .map(() => ' '.repeat(HALF) + '│' + ' '.repeat(COL_WIDTH - HALF - 1))
      .join('');
  }

  function messageArrow(
    fromIdx: number,
    toIdx: number,
    text: string,
    dashed: boolean,
  ): string[] {
    const line: string[] = [];
    const totalCols = participants.length * COL_WIDTH;
    const fromPos = colCenter(fromIdx);
    const toPos = colCenter(toIdx);

    // Lifeline row
    const ll: string[] = Array.from({ length: totalCols }, (_, i) => {
      const isLifeline = participants.some((_, pi) => i === colCenter(pi));
      return isLifeline ? '│' : ' ';
    });

    // Arrow row
    const arrowRow: string[] = [...ll];
    const left = Math.min(fromPos, toPos);
    const right = Math.max(fromPos, toPos);
    const going_right = toPos > fromPos;
    const ch = dashed ? '╌' : '─';

    for (let i = left + 1; i < right; i++) {
      arrowRow[i] = ch;
    }
    if (going_right) {
      arrowRow[right] = '►';
      arrowRow[left] = '├';
    } else {
      arrowRow[left] = '◄';
      arrowRow[right] = '┤';
    }

    // Label row (centered between from and to)
    const labelPos = Math.floor((left + right) / 2);
    const labelStr = text.substring(0, right - left - 2);
    const labelRow: string[] = Array.from({ length: totalCols }, (_, i) => {
      const isLifeline = participants.some((_, pi) => i === colCenter(pi));
      return isLifeline ? '│' : ' ';
    });
    const startLabel = Math.max(
      left + 1,
      labelPos - Math.floor(labelStr.length / 2),
    );
    for (let i = 0; i < labelStr.length && startLabel + i < totalCols; i++) {
      labelRow[startLabel + i] = labelStr[i] ?? ' ';
    }

    line.push(ll.join(''));
    line.push(labelRow.join(''));
    line.push(arrowRow.join(''));

    return line;
  }

  const output: string[] = [];
  output.push(participantLine());
  output.push(separatorLine());
  output.push(lifelines());

  for (const msg of messages) {
    if (msg.type === 'message' && msg.from && msg.to) {
      const fromIdx = participants.indexOf(msg.from);
      const toIdx = participants.indexOf(msg.to);
      if (fromIdx >= 0 && toIdx >= 0) {
        const rows = messageArrow(
          fromIdx,
          toIdx,
          msg.text,
          msg.style === 'dashed',
        );
        output.push(...rows);
      }
      output.push(lifelines());
    } else if (msg.type === 'note') {
      const noteIdx = participants.indexOf(msg.from ?? '');
      const prefix = noteIdx >= 0 ? ' '.repeat(colCenter(noteIdx) - 2) : '';
      output.push(lifelines());
      output.push(prefix + '┌─ Note ─────────────────────┐');
      output.push(prefix + '│ ' + msg.text.substring(0, 26).padEnd(26) + ' │');
      output.push(prefix + '└────────────────────────────┘');
      output.push(lifelines());
    } else if (msg.type === 'loop') {
      output.push('  ╔══ loop: ' + msg.text + ' ══╗');
    } else if (msg.type === 'alt') {
      output.push('  ╔══ alt: ' + msg.text + ' ══╗');
    } else if (msg.type === 'end') {
      output.push('  ╚════════════════════════╝');
    }
  }

  output.push(separatorLine());
  output.push(participantLine());

  return output.join('\n');
}

// ─── Class diagram renderer ───────────────────────────────────────────────────

interface ClassDef {
  name: string;
  members: string[];
}

interface ClassRelation {
  from: string;
  to: string;
  type: string;
  label?: string;
}

function parseClassDiagram(content: string): {
  classes: ClassDef[];
  relations: ClassRelation[];
} {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const classMap = new Map<string, ClassDef>();
  const relations: ClassRelation[] = [];
  let currentClass: ClassDef | null = null;

  for (const line of lines) {
    if (/^classDiagram/i.test(line)) continue;

    const classDecl = line.match(/^class\s+(\w+)\s*(\{)?/);
    if (classDecl) {
      const name = classDecl[1];
      const hasOpenBrace = !!classDecl[2];
      if (!classMap.has(name)) {
        classMap.set(name, { name, members: [] });
      }
      // Only set currentClass if there is an opening brace on this line
      currentClass = hasOpenBrace ? classMap.get(name)! : null;
      continue;
    }

    if (line === '}') {
      currentClass = null;
      continue;
    }

    if (currentClass) {
      if (!/^class\s/.test(line) && line !== 'classDiagram') {
        currentClass.members.push(line);
      }
      continue;
    }

    // Relationship lines: A <|-- B, A --> B, A --* B, etc.
    const relMatch = line.match(
      /^(\w+)\s*(<\|--|<\|\.\.|\*--|o--|-->|\.\.>|--|\.\.|<--)\s*(\w+)(?:\s*:\s*(.+))?$/,
    );
    if (relMatch) {
      relations.push({
        from: relMatch[1],
        to: relMatch[3],
        type: relMatch[2],
        label: relMatch[4]?.trim(),
      });
    }

    // Also catch member definitions outside class blocks: ClassName : +method()
    const memberMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (memberMatch && !relMatch) {
      const className = memberMatch[1];
      if (!classMap.has(className)) {
        classMap.set(className, { name: className, members: [] });
      }
      classMap.get(className)!.members.push(memberMatch[2]);
    }
  }

  return { classes: Array.from(classMap.values()), relations };
}

function renderClassDiagram(content: string): string {
  const { classes, relations } = parseClassDiagram(content);

  if (classes.length === 0) {
    return renderFallback('class', content);
  }

  const CLASS_WIDTH = 30;
  const lines: string[] = [];

  // Render each class as a box
  const classBoxes: Map<string, string[]> = new Map();
  for (const cls of classes) {
    const nameBar =
      '│' +
      cls.name.substring(0, CLASS_WIDTH - 2).padEnd(CLASS_WIDTH - 2) +
      '│';
    const bx: string[] = [
      '┌' + '─'.repeat(CLASS_WIDTH - 2) + '┐',
      nameBar,
      '├' + '─'.repeat(CLASS_WIDTH - 2) + '┤',
    ];
    for (const m of cls.members) {
      bx.push(
        '│ ' + m.substring(0, CLASS_WIDTH - 4).padEnd(CLASS_WIDTH - 4) + ' │',
      );
    }
    if (cls.members.length === 0) {
      bx.push('│' + ' '.repeat(CLASS_WIDTH - 2) + '│');
    }
    bx.push('└' + '─'.repeat(CLASS_WIDTH - 2) + '┘');
    classBoxes.set(cls.name, bx);
  }

  // Print classes in pairs (2 per row for readability)
  const PAIR_SEP = '    ';
  const classArr = Array.from(classBoxes.entries());
  for (let i = 0; i < classArr.length; i += 2) {
    const left = classArr[i][1];
    const right = i + 1 < classArr.length ? classArr[i + 1][1] : null;

    const height = Math.max(left.length, right?.length ?? 0);
    for (let row = 0; row < height; row++) {
      const leftLine = left[row] ?? ' '.repeat(CLASS_WIDTH);
      const rightLine = right ? (right[row] ?? ' '.repeat(CLASS_WIDTH)) : '';
      lines.push(leftLine + (right ? PAIR_SEP + rightLine : ''));
    }
    lines.push('');
  }

  // Render relationships as text annotations
  if (relations.length > 0) {
    lines.push('Relationships:');
    const relSymbols: Record<string, string> = {
      '<|--': 'inherits',
      '<|..': 'realizes',
      '*--': 'composes',
      'o--': 'aggregates',
      '-->': 'associates →',
      '..>': 'depends',
      '--': 'links',
      '..': 'uses',
      '<--': '← associates',
    };
    for (const r of relations) {
      const desc = relSymbols[r.type] ?? r.type;
      const lbl = r.label ? ` "${r.label}"` : '';
      lines.push(`  ${r.from} ──[${desc}]──► ${r.to}${lbl}`);
    }
  }

  return lines.join('\n');
}

// ─── ERD renderer ─────────────────────────────────────────────────────────────

interface ErdEntity {
  name: string;
  attributes: string[];
}

interface ErdRelation {
  from: string;
  to: string;
  cardinality: string;
  label: string;
}

function parseErDiagram(content: string): {
  entities: ErdEntity[];
  relations: ErdRelation[];
} {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const entityMap = new Map<string, ErdEntity>();
  const relations: ErdRelation[] = [];
  let current: ErdEntity | null = null;

  for (const line of lines) {
    if (/^erDiagram/i.test(line)) continue;

    if (line === '}') {
      current = null;
      continue;
    }

    // Entity block: ENTITY {
    const entityMatch = line.match(/^([A-Z_][A-Z0-9_]*)\s*\{/);
    if (entityMatch) {
      const name = entityMatch[1];
      if (!entityMap.has(name)) entityMap.set(name, { name, attributes: [] });
      current = entityMap.get(name)!;
      continue;
    }

    if (current) {
      // Attribute line: type name [PK|FK|UK]
      current.attributes.push(line.replace(/\s+/g, ' '));
      continue;
    }

    // Relationship: ENTITY1 ||--o{ ENTITY2 : "label"
    const relMatch = line.match(
      /^([A-Z_][A-Z0-9_]*)\s*(\|\|--\|\||o\|--\|\||\|\|--o\{|\|\|--|o{--)\s*([A-Z_][A-Z0-9_]*)\s*:\s*"?([^"]+)"?/,
    );
    if (relMatch) {
      relations.push({
        from: relMatch[1],
        to: relMatch[3],
        cardinality: relMatch[2],
        label: relMatch[4].trim(),
      });
      // Ensure both entities are in map
      if (!entityMap.has(relMatch[1]))
        entityMap.set(relMatch[1], { name: relMatch[1], attributes: [] });
      if (!entityMap.has(relMatch[3]))
        entityMap.set(relMatch[3], { name: relMatch[3], attributes: [] });
    }
  }

  return { entities: Array.from(entityMap.values()), relations };
}

function renderErDiagram(content: string): string {
  const { entities, relations } = parseErDiagram(content);

  if (entities.length === 0) {
    return renderFallback('erd', content);
  }

  const ENTITY_WIDTH = 32;
  const lines: string[] = [];

  for (const entity of entities) {
    const nameBar =
      '║ ' +
      entity.name.substring(0, ENTITY_WIDTH - 4).padEnd(ENTITY_WIDTH - 4) +
      ' ║';
    lines.push('╔' + '═'.repeat(ENTITY_WIDTH - 2) + '╗');
    lines.push(nameBar);
    lines.push('╠' + '═'.repeat(ENTITY_WIDTH - 2) + '╣');
    if (entity.attributes.length === 0) {
      lines.push('║' + ' '.repeat(ENTITY_WIDTH - 2) + '║');
    }
    for (const attr of entity.attributes) {
      lines.push(
        '║ ' +
          attr.substring(0, ENTITY_WIDTH - 4).padEnd(ENTITY_WIDTH - 4) +
          ' ║',
      );
    }
    lines.push('╚' + '═'.repeat(ENTITY_WIDTH - 2) + '╝');
    lines.push('');
  }

  if (relations.length > 0) {
    lines.push('Relationships:');
    const cardSymbols: Record<string, string> = {
      '||--||': 'exactly one to exactly one',
      'o|--||': 'zero or one to exactly one',
      '||--o{': 'exactly one to zero or many',
      '||--': 'exactly one to',
      'o{--': 'zero or many to',
    };
    for (const r of relations) {
      const card = cardSymbols[r.cardinality] ?? r.cardinality;
      lines.push(`  ${r.from} ──[${card}]──► ${r.to} : ${r.label}`);
    }
  }

  return lines.join('\n');
}

// ─── Fallback renderer ────────────────────────────────────────────────────────

function renderFallback(type: string, content: string): string {
  const width = 60;
  const lines: string[] = [];
  lines.push('┌' + '─'.repeat(width - 2) + '┐');
  lines.push('│ ' + `Diagram type: ${type}`.padEnd(width - 4) + ' │');
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push('│ ' + 'Mermaid source:'.padEnd(width - 4) + ' │');
  for (const raw of content.split('\n')) {
    const chunk = raw.substring(0, width - 4);
    lines.push('│ ' + chunk.padEnd(width - 4) + ' │');
  }
  lines.push('└' + '─'.repeat(width - 2) + '┘');
  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type DiagramType = 'flowchart' | 'sequence' | 'class' | 'erd';

/**
 * Renders a Mermaid diagram definition as terminal-friendly ASCII art.
 * Results are cached by type+content for fast repeated access.
 */
export function renderDiagram(type: DiagramType, content: string): string {
  const key = cacheKey(type, content);
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  let result: string;
  try {
    switch (type) {
      case 'flowchart':
        result = renderFlowchart(content);
        break;
      case 'sequence':
        result = renderSequence(content);
        break;
      case 'class':
        result = renderClassDiagram(content);
        break;
      case 'erd':
        result = renderErDiagram(content);
        break;
      default:
        result = renderFallback(type, content);
    }
  } catch {
    result = renderFallback(type, content);
  }

  setCache(key, result);
  return result;
}
