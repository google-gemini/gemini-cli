/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LRUCache } from 'mnemonist';

export type DiagramType = 'flowchart' | 'sequence' | 'class' | 'erd';

interface FlowEdge {
  from: string;
  to: string;
  arrow: string;
  label?: string;
}

interface SequenceMessage {
  from: string;
  to: string;
  arrow: string;
  message: string;
}

interface ClassRelation {
  from: string;
  to: string;
  relation: string;
  label?: string;
}

interface ErdRelation {
  from: string;
  to: string;
  cardinality: string;
  label?: string;
}

interface ParsedFlowEdge {
  fromToken: string;
  toToken: string;
  arrow: string;
  label?: string;
}

const RENDER_CACHE_SIZE = 64;
const renderCache = new LRUCache<string, string>(RENDER_CACHE_SIZE);
const FLOW_ARROWS = [
  '<==>',
  '<-->',
  '<==',
  '==>',
  '<--',
  '-->',
  '-.->',
  '---',
  '--x',
  '--o',
];

export function detectDiagramType(source: string): DiagramType | undefined {
  const lines = normalizeSource(source).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) {
      continue;
    }

    if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph ')) {
      return 'flowchart';
    }
    if (trimmed.startsWith('sequenceDiagram')) {
      return 'sequence';
    }
    if (trimmed.startsWith('classDiagram')) {
      return 'class';
    }
    if (trimmed.startsWith('erDiagram')) {
      return 'erd';
    }
  }

  return undefined;
}

export function renderDiagram(
  source: string,
  explicitType?: DiagramType,
): string {
  const normalized = normalizeSource(source);
  if (!normalized) {
    throw new Error('Mermaid diagram source cannot be empty.');
  }

  const diagramType = explicitType ?? detectDiagramType(normalized);
  if (!diagramType) {
    throw new Error(
      'Unable to detect Mermaid diagram type. Expected flowchart, sequenceDiagram, classDiagram, or erDiagram.',
    );
  }

  const cacheKey = `${diagramType}\u0000${normalized}`;
  const cached = renderCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let rendered: string;
  switch (diagramType) {
    case 'flowchart':
      rendered = renderFlowchart(normalized);
      break;
    case 'sequence':
      rendered = renderSequence(normalized);
      break;
    case 'class':
      rendered = renderClass(normalized);
      break;
    case 'erd':
      rendered = renderErd(normalized);
      break;
    default:
      throw new Error(`Unsupported diagram type: ${String(diagramType)}`);
  }

  renderCache.set(cacheKey, rendered);
  return rendered;
}

export function resetDiagramRendererCacheForTesting(): void {
  renderCache.clear();
}

export function getDiagramRendererCacheSizeForTesting(): number {
  return renderCache.size;
}

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').trim();
}

function flowNodeIdFallback(label: string): string {
  const sanitized = label.trim().replaceAll(/[^A-Za-z0-9_]+/g, '_');
  return sanitized || 'node';
}

function normalizeFlowLabel(label: string): string {
  let normalized = label.trim();

  // Mermaid often nests wrappers such as Node10([10]); unwrap repeatedly.
  while (normalized.length >= 2) {
    const startsEnds =
      (normalized.startsWith('[') && normalized.endsWith(']')) ||
      (normalized.startsWith('(') && normalized.endsWith(')')) ||
      (normalized.startsWith('{') && normalized.endsWith('}')) ||
      (normalized.startsWith('"') && normalized.endsWith('"'));

    if (!startsEnds) {
      break;
    }
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized.replaceAll(/<br\s*\/?>/gi, ' / ');
  normalized = normalized.replaceAll(/\\n/g, ' / ');
  normalized = normalized.replaceAll(/\s+/g, ' ').trim();

  if (normalized.length > 120) {
    normalized = `${normalized.slice(0, 117)}...`;
  }

  return normalized;
}

function parseFlowNodeToken(token: string): { id: string; label: string } {
  const trimmed = token.trim();
  const labeledMatch =
    /^([A-Za-z0-9_.:/-]+)\s*(?:\[(.*?)\]|\((.*?)\)|\{(.*?)\}|"(.*?)")?$/.exec(
      trimmed,
    );

  if (labeledMatch) {
    const id = labeledMatch[1];
    const label =
      labeledMatch[2] ??
      labeledMatch[3] ??
      labeledMatch[4] ??
      labeledMatch[5] ??
      id;
    return {
      id,
      label: normalizeFlowLabel(label) || id,
    };
  }

  const bracketOnly = /^\[(.*?)\]$/.exec(trimmed);
  if (bracketOnly) {
    const label = normalizeFlowLabel(bracketOnly[1]);
    return {
      id: flowNodeIdFallback(label),
      label,
    };
  }

  return {
    id: flowNodeIdFallback(trimmed),
    label: normalizeFlowLabel(trimmed),
  };
}

function isTopLevelScanState(
  bracketDepth: number,
  parenDepth: number,
  braceDepth: number,
  quote: string | null,
): boolean {
  return (
    bracketDepth === 0 && parenDepth === 0 && braceDepth === 0 && quote === null
  );
}

function findNextFlowArrow(
  line: string,
  startIndex: number,
): { index: number; arrow: string } | undefined {
  let bracketDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    if (
      i >= startIndex &&
      isTopLevelScanState(bracketDepth, parenDepth, braceDepth, quote)
    ) {
      for (const arrow of FLOW_ARROWS) {
        if (line.startsWith(arrow, i)) {
          return { index: i, arrow };
        }
      }
    }

    const char = line[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
    } else if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === '{') {
      braceDepth += 1;
    } else if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  return undefined;
}

function parseFlowEdgesFromLine(line: string): ParsedFlowEdge[] {
  const edges: ParsedFlowEdge[] = [];

  let cursor = 0;
  let currentFromToken: string | undefined;

  while (true) {
    const arrow = findNextFlowArrow(line, cursor);
    if (!arrow) {
      break;
    }

    if (currentFromToken === undefined) {
      currentFromToken = line.slice(cursor, arrow.index).trim();
    } else {
      const between = line.slice(cursor, arrow.index).trim();
      if (between) {
        currentFromToken = between;
      }
    }

    if (!currentFromToken) {
      break;
    }

    cursor = arrow.index + arrow.arrow.length;
    while (cursor < line.length && line[cursor] === ' ') {
      cursor += 1;
    }

    let label: string | undefined;
    if (line[cursor] === '|') {
      const labelEnd = line.indexOf('|', cursor + 1);
      if (labelEnd !== -1) {
        label =
          normalizeFlowLabel(line.slice(cursor + 1, labelEnd).trim()) ||
          undefined;
        cursor = labelEnd + 1;
      }
    }

    while (cursor < line.length && line[cursor] === ' ') {
      cursor += 1;
    }

    const nextArrow = findNextFlowArrow(line, cursor);
    const toToken = line
      .slice(cursor, nextArrow ? nextArrow.index : line.length)
      .trim();

    if (!toToken) {
      break;
    }

    edges.push({
      fromToken: currentFromToken,
      toToken,
      arrow: arrow.arrow,
      label,
    });

    currentFromToken = toToken;
    if (!nextArrow) {
      break;
    }
    cursor = nextArrow.index;
  }

  return edges;
}

function normalizeImplicitFlowEdgeLabels(line: string): string {
  // Normalize Mermaid shorthand labels:
  //   A -- label --> B   =>   A -->|label| B
  //   A == label ==> B   =>   A ==>|label| B
  return line.replace(
    /(--|==)\s*([^|>\s][\s\S]*?)\s*(-->|==>)/g,
    (match, open: string, rawLabel: string, close: string) => {
      const compatibleArrow =
        (open === '--' && close === '-->') ||
        (open === '==' && close === '==>');
      if (!compatibleArrow) {
        return match;
      }

      const label = rawLabel.trim();
      if (!label) {
        return match;
      }

      return `${close}|${label}|`;
    },
  );
}

function isLinkedListPattern(edges: FlowEdge[], nodeCount: number): boolean {
  if (nodeCount < 2 || edges.length < 1) return false;
  // Check if it's a simple linear chain (each node has at most 1 outgoing edge)
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  // All nodes should have at most 1 outgoing + at most 1 incoming (or exactly 1 if middle node)
  for (const count of outgoing.values()) {
    if (count > 1) return false;
  }
  for (const count of incoming.values()) {
    if (count > 1) return false;
  }
  return true;
}

function isBinaryTreePattern(edges: FlowEdge[], nodeCount: number): boolean {
  if (nodeCount < 7) return false; // Require at least 7 nodes for tree pattern (2 levels + root)
  const children = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();

  for (const edge of edges) {
    if (!children.has(edge.from)) {
      children.set(edge.from, []);
    }
    children.get(edge.from)!.push(edge.to);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  // Strict tree validation:
  // 1. Exactly one root (single node with 0 incoming, must have children)
  // 2. Each node has at most 2 children (binary tree)
  // 3. At least 3 nodes have 2 children (significant branching)
  // 4. All nodes except root have exactly 1 incoming edge
  let rootCount = 0;
  let branchingNodes = 0;

  for (const count of incomingCount.values()) {
    if (count !== 1) return false; // Non-root must have exactly 1 parent
  }

  for (const [nodeId, childList] of children) {
    if (childList.length > 2) return false; // Max 2 children
    if (childList.length === 2) branchingNodes += 1;
    if ((incomingCount.get(nodeId) ?? 0) === 0) rootCount += 1; // Root node
  }

  return rootCount === 1 && branchingNodes >= 3; // Exactly 1 root, at least 3 branching nodes
}

function isNullLikeLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'null' || normalized === '/null/' || normalized === '[null]'
  );
}

function trailingDigits(value: string): string | undefined {
  const match = /([0-9]+)$/.exec(value.trim());
  return match?.[1];
}

function applyLinkedListLabelConsistency(
  chain: Array<{ id: string; label: string }>,
): Array<{ id: string; label: string }> {
  const nonNull = chain.filter((item) => !isNullLikeLabel(item.label));
  if (nonNull.length === 0) {
    return chain;
  }

  const hasNumericLabel = nonNull.some((item) =>
    /^[0-9]+$/.test(item.label.trim()),
  );
  const hasSemanticLabel = nonNull.some((item) => {
    const label = item.label.trim();
    return !/^[0-9]+$/.test(label) && label !== item.id;
  });

  const numericMode = hasNumericLabel;
  const idMode = !numericMode && !hasSemanticLabel;

  return chain.map((item) => {
    const normalizedLabel = item.label.trim();
    if (isNullLikeLabel(normalizedLabel)) {
      return { ...item, label: 'NULL' };
    }

    if (numericMode) {
      if (/^[0-9]+$/.test(normalizedLabel)) {
        return item;
      }

      const idDigits = trailingDigits(item.id);
      if (idDigits) {
        return { ...item, label: idDigits };
      }
      return item;
    }

    if (idMode) {
      return { ...item, label: item.id };
    }

    return item;
  });
}

function buildLinearChain(
  edges: FlowEdge[],
  nodes: Map<string, string>,
): Array<{ id: string; label: string }> {
  const incomingCount = new Map<string, number>();
  const outgoingMap = new Map<string, FlowEdge>();

  for (const edge of edges) {
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
    if (!outgoingMap.has(edge.from)) {
      outgoingMap.set(edge.from, edge);
    }
  }

  let start: string | undefined;
  for (const [nodeId] of nodes) {
    if (
      (!incomingCount.has(nodeId) || incomingCount.get(nodeId) === 0) &&
      outgoingMap.has(nodeId)
    ) {
      start = nodeId;
      break;
    }
  }

  if (!start) {
    for (const [nodeId] of nodes) {
      if (outgoingMap.has(nodeId)) {
        start = nodeId;
        break;
      }
    }
  }

  if (!start && nodes.size > 0) {
    start = Array.from(nodes.keys())[0];
  }

  const chain: Array<{ id: string; label: string }> = [];
  let current = start;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const label = nodes.get(current) ?? current;
    chain.push({ id: current, label });
    const nextEdge = outgoingMap.get(current);
    current = nextEdge?.to;
  }

  return applyLinkedListLabelConsistency(chain);
}

function renderStackAscii(
  edges: FlowEdge[],
  nodes: Map<string, string>,
): string[] {
  const chain = buildLinearChain(edges, nodes);
  const output: string[] = ['Stack (Top to Bottom)'];

  if (chain.length === 0) {
    output.push('(empty stack)');
    return output;
  }

  const maxLabelLen = Math.max(
    2,
    ...chain.map((item) => item.label.trim().length || 1),
  );
  const innerWidth = Math.max(4, maxLabelLen + 2);

  for (let i = 0; i < chain.length; i += 1) {
    const item = chain[i];
    const raw = item.label.trim() || '?';
    const left = Math.floor((innerWidth - raw.length) / 2);
    const right = innerWidth - raw.length - left;

    output.push(`┌${'─'.repeat(innerWidth)}┐`);
    output.push(
      `│${' '.repeat(Math.max(0, left))}${raw}${' '.repeat(Math.max(0, right))}│${i === 0 ? '  ← top' : ''}`,
    );
    output.push(`└${'─'.repeat(innerWidth)}┘`);

    if (i < chain.length - 1) {
      output.push(` ${' '.repeat(Math.floor(innerWidth / 2))}│`);
    }
  }

  output.push('bottom');
  return output;
}

function renderQueueAscii(
  edges: FlowEdge[],
  nodes: Map<string, string>,
): string[] {
  const output = ['Queue (Front to Rear)'];
  const list = renderLinkedListAscii(edges, nodes, false);
  if (list.length === 0) {
    output.push('(empty queue)');
    return output;
  }

  output.push(...list);
  return output;
}

function detectFlowDirection(source: string): 'LR' | 'RL' | 'TB' | 'BT' {
  const match = /(?:flowchart|graph)\s+(LR|RL|TB|BT|TD)\b/i.exec(source);
  if (!match) {
    return 'LR';
  }

  const dir = match[1].toUpperCase();
  if (dir === 'TD') {
    return 'TB';
  }
  if (dir === 'RL' || dir === 'BT' || dir === 'TB' || dir === 'LR') {
    return dir;
  }
  return 'LR';
}

function textFlowArrow(direction: 'LR' | 'RL' | 'TB' | 'BT'): '→' | '←' {
  return direction === 'RL' ? '←' : '→';
}

function buildLinearFlowChain(
  nodes: Map<string, string>,
  edges: FlowEdge[],
): Array<{ id: string; label: string; edgeLabel?: string }> | undefined {
  if (edges.length === 0) {
    return undefined;
  }

  const outgoing = new Map<string, FlowEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  for (const [id, list] of outgoing) {
    if (list.length > 1) {
      return undefined;
    }
    if ((incomingCount.get(id) ?? 0) > 1) {
      return undefined;
    }
  }
  for (const count of incomingCount.values()) {
    if (count > 1) {
      return undefined;
    }
  }

  let start: string | undefined;
  for (const [nodeId] of nodes) {
    if ((incomingCount.get(nodeId) ?? 0) === 0 && outgoing.has(nodeId)) {
      start = nodeId;
      break;
    }
  }
  if (!start) {
    return undefined;
  }

  const chain: Array<{ id: string; label: string; edgeLabel?: string }> = [];
  const visited = new Set<string>();
  let current: string | undefined = start;

  while (current && !visited.has(current)) {
    visited.add(current);
    const label = (nodes.get(current) ?? current).trim() || current;
    const edge: FlowEdge | undefined = outgoing.get(current)?.[0];
    chain.push({ id: current, label, edgeLabel: edge?.label });
    current = edge?.to;
  }

  if (chain.length < 2) {
    return undefined;
  }

  // For flows with complex labels (spaces) or semantic edge labels, use step rendering instead
  const hasComplexLabels = chain.some((node) => node.label.includes(' '));
  const hasEdgeLabels = chain.some((node) => node.edgeLabel);
  if (hasComplexLabels || hasEdgeLabels) {
    return undefined;
  }

  return chain;
}

function shouldRenderLinearChainAscii(
  chain: Array<{ id: string; label: string; edgeLabel?: string }>,
): boolean {
  if (chain.length === 0) {
    return false;
  }

  if (chain.length > 4) {
    return false;
  }

  if (chain.some((node) => Boolean(node.edgeLabel))) {
    return false;
  }

  const maxLabelLength = Math.max(...chain.map((node) => node.label.length));
  return maxLabelLength <= 24;
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) {
    return [text];
  }

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      lines.push(remaining);
      break;
    }

    // Find last space before maxWidth
    let cutPoint = maxWidth;
    const lastSpace = remaining.lastIndexOf(' ', maxWidth);
    if (lastSpace > 0) {
      cutPoint = lastSpace;
    }

    lines.push(remaining.slice(0, cutPoint).trim());
    remaining = remaining.slice(cutPoint).trim();
  }

  return lines;
}

function renderConnectedStepBoxes(
  steps: string[],
  startIndex = 1,
  maxWrapWidth = 56,
): { lines: string[]; nextIndex: number } {
  if (steps.length === 0) {
    return { lines: [], nextIndex: startIndex };
  }

  const numbered = steps.map((step, idx) => `${startIndex + idx}. ${step}`);
  const wrapped = numbered.map((step) => wrapText(step, maxWrapWidth));
  const innerWidth = Math.max(18, ...wrapped.flat().map((line) => line.length));

  const lines: string[] = [];
  for (let i = 0; i < wrapped.length; i += 1) {
    lines.push(`┌${'─'.repeat(innerWidth)}┐`);
    for (const line of wrapped[i]) {
      lines.push(`│${line.padEnd(innerWidth, ' ')}│`);
    }
    lines.push(`└${'─'.repeat(innerWidth)}┘`);

    if (i < wrapped.length - 1) {
      const center = Math.floor((innerWidth + 2) / 2);
      lines.push(`${' '.repeat(center)}│`);
    }
  }

  return { lines, nextIndex: startIndex + steps.length };
}

function renderLinearFlowAscii(
  chain: Array<{ id: string; label: string; edgeLabel?: string }>,
  direction: 'LR' | 'RL' | 'TB' | 'BT',
): string[] {
  const output: string[] = [];
  const ordered =
    direction === 'RL' || direction === 'BT' ? [...chain].reverse() : chain;
  const horizontal = direction === 'LR' || direction === 'RL';
  const arrow =
    direction === 'RL'
      ? '←'
      : direction === 'BT'
        ? '↑'
        : direction === 'TB'
          ? '↓'
          : '→';

  if (horizontal) {
    // Build box configs with text wrapping
    const boxConfigs: Array<{ label: string; lines: string[]; width: number }> =
      [];
    for (const node of ordered) {
      const lines = wrapText(node.label, 14);
      const width = Math.max(8, Math.max(...lines.map((l) => l.length)) + 2);
      boxConfigs.push({ label: node.label, lines, width });
    }

    if (boxConfigs.length === 0) return output;

    const maxLines = Math.max(...boxConfigs.map((c) => c.lines.length));

    // Build each line separately to ensure proper alignment
    const topLine: string[] = [];
    const contentLines: string[][] = Array.from({ length: maxLines }, () => []);
    const botLine: string[] = [];

    for (let i = 0; i < boxConfigs.length; i++) {
      const cfg = boxConfigs[i];

      // Top border
      topLine.push('┌' + '─'.repeat(cfg.width) + '┐');

      // Content lines (padded to maxLines)
      for (let j = 0; j < maxLines; j++) {
        const text = j < cfg.lines.length ? cfg.lines[j] : '';
        const padding = cfg.width - text.length;
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        contentLines[j].push(
          '│' + ' '.repeat(leftPad) + text + ' '.repeat(rightPad) + '│',
        );
      }

      // Bottom border
      botLine.push('└' + '─'.repeat(cfg.width) + '┘');

      // Add arrow between boxes (except after last)
      if (i < boxConfigs.length - 1) {
        topLine.push(' ' + arrow + ' ');
        for (let j = 0; j < maxLines; j++) {
          contentLines[j].push('   ');
        }
        botLine.push(' ' + arrow + ' ');
      }
    }

    // Output the assembled lines
    output.push(topLine.join(''));
    for (const contentLine of contentLines) {
      output.push(contentLine.join(''));
    }
    output.push(botLine.join(''));
    return output;
  }

  // Vertical rendering
  for (let i = 0; i < ordered.length; i += 1) {
    const node = ordered[i];
    const lines = wrapText(node.label, 16);
    const width = Math.max(10, Math.max(...lines.map((l) => l.length)) + 2);

    output.push(`┌${'─'.repeat(width)}┐`);
    for (const line of lines) {
      const left = Math.floor((width - line.length) / 2);
      const right = width - line.length - left;
      output.push(
        `│${' '.repeat(Math.max(0, left))}${line}${' '.repeat(Math.max(0, right))}│`,
      );
    }
    output.push(`└${'─'.repeat(width)}┘`);

    if (i < ordered.length - 1) {
      if (node.edgeLabel) {
        output.push(` ${node.edgeLabel}`);
      }
      output.push(` ${arrow}`);
    }
  }

  return output;
}

function edgeOrderHint(
  edge: FlowEdge,
  nodes: Map<string, string>,
): number | undefined {
  const fromLabel = nodes.get(edge.from) ?? edge.from;
  const toLabel = nodes.get(edge.to) ?? edge.to;
  const candidates = [edge.label ?? '', fromLabel, toLabel];
  for (const candidate of candidates) {
    const m = /^\s*(\d+)\b/.exec(candidate);
    if (m) {
      return Number(m[1]);
    }
  }
  return undefined;
}

function getOrderedFlowEdges(
  edges: FlowEdge[],
  nodes: Map<string, string>,
): FlowEdge[] {
  const hasOrderHints = edges.some(
    (edge) => edgeOrderHint(edge, nodes) !== undefined,
  );
  if (!hasOrderHints) {
    return edges;
  }

  return [...edges].sort((a, b) => {
    const ah = edgeOrderHint(a, nodes);
    const bh = edgeOrderHint(b, nodes);
    if (ah !== undefined && bh !== undefined && ah !== bh) {
      return ah - bh;
    }
    if (ah !== undefined && bh === undefined) {
      return -1;
    }
    if (ah === undefined && bh !== undefined) {
      return 1;
    }
    return 0;
  });
}

function inferHandshakeParty(value: string): 'Client' | 'Server' | undefined {
  const normalized = value.toLowerCase();
  if (/\bclient\b/.test(normalized)) {
    return 'Client';
  }
  if (/\bserver\b/.test(normalized)) {
    return 'Server';
  }
  return undefined;
}

function inferHandshakeSenderFromMessage(
  message: string,
): 'Client' | 'Server' | undefined {
  const normalized = message.toLowerCase();

  if (
    /\b(syn-ack|server hello|certificate|http response|\b200\b|\b201\b|\b204\b|\b404\b|\b500\b)\b/.test(
      normalized,
    )
  ) {
    return 'Server';
  }
  if (
    /\b(client hello|key exchange|http request|\bget\b|\bpost\b|\bput\b|\bdelete\b|\bsyn\b|\back\b)\b/.test(
      normalized,
    )
  ) {
    return 'Client';
  }

  return undefined;
}

function oppositeParty(party: 'Client' | 'Server'): 'Client' | 'Server' {
  return party === 'Client' ? 'Server' : 'Client';
}

function renderHandshakeTimeline(
  edges: FlowEdge[],
  nodes: Map<string, string>,
  direction: 'LR' | 'RL' | 'TB' | 'BT',
  sourceLower: string,
): string[] | undefined {
  if (edges.length < 3) {
    return undefined;
  }

  const hasHandshakeHint =
    /\bhandshake\b/.test(sourceLower) ||
    /\btls\b/.test(sourceLower) ||
    /\bhttps\b/.test(sourceLower) ||
    /\bhttp\b/.test(sourceLower) ||
    /\bsyn\b/.test(sourceLower) ||
    /\back\b/.test(sourceLower);

  if (!hasHandshakeHint) {
    return undefined;
  }

  const ordered = getOrderedFlowEdges(edges, nodes);
  const arrow = textFlowArrow(direction);

  const tcp: string[] = [];
  const tls: string[] = [];
  const http: string[] = [];
  const other: string[] = [];

  const formatStep = (edge: FlowEdge): string => {
    const fromLabel = nodes.get(edge.from) ?? edge.from;
    const toLabel = nodes.get(edge.to) ?? edge.to;
    const message = edge.label?.trim() || toLabel.trim() || fromLabel.trim();

    let sender = inferHandshakeParty(fromLabel);
    let receiver = inferHandshakeParty(toLabel);

    if (sender && receiver && sender === receiver) {
      receiver = undefined;
    }

    if (!sender || !receiver) {
      const inferredSender = inferHandshakeSenderFromMessage(message);
      if (!sender && inferredSender) {
        sender = inferredSender;
      }
      if (!receiver && inferredSender) {
        receiver = oppositeParty(inferredSender);
      }
    }

    if (sender && receiver && sender === receiver) {
      receiver = undefined;
    }

    if (sender && !receiver) {
      receiver = oppositeParty(sender);
    } else if (receiver && !sender) {
      sender = oppositeParty(receiver);
    }

    if (sender && receiver && sender !== receiver) {
      return `${sender} ${arrow} ${receiver}: ${message}`;
    }

    if (edge.label?.trim()) {
      return `${fromLabel} ${arrow} ${toLabel}: ${message}`;
    }
    return `${fromLabel} ${arrow} ${toLabel}`;
  };

  for (const edge of ordered) {
    const edgeText =
      `${edge.label ?? ''} ${nodes.get(edge.from) ?? edge.from} ${nodes.get(edge.to) ?? edge.to}`.toLowerCase();
    const step = formatStep(edge);

    if (
      /\b(http|get|post|request|response|200|201|204|404|500)\b/.test(edgeText)
    ) {
      http.push(step);
    } else if (
      /\b(tls|ssl|client hello|server hello|certificate|key exchange|finished)\b/.test(
        edgeText,
      )
    ) {
      tls.push(step);
    } else if (/\b(syn|syn-ack|ack|tcp)\b/.test(edgeText)) {
      tcp.push(step);
    } else {
      other.push(step);
    }
  }

  const output: string[] = ['Handshake Timeline:'];
  let stepNo = 1;

  const appendSection = (title: string, items: string[]): void => {
    if (items.length === 0) {
      return;
    }
    output.push(title);
    const boxed = renderConnectedStepBoxes(items, stepNo, 54);
    output.push(...boxed.lines);
    stepNo = boxed.nextIndex;
  };

  appendSection('TCP:', tcp);
  appendSection('TLS:', tls);
  appendSection('HTTP:', http);
  appendSection('Other:', other);

  if (stepNo === 1) {
    return undefined;
  }

  return output;
}

function renderProcessFlowSteps(
  edges: FlowEdge[],
  nodes: Map<string, string>,
  direction: 'LR' | 'RL' | 'TB' | 'BT',
): string[] {
  const output: string[] = [];
  if (edges.length === 0) {
    return output;
  }

  const sorted = getOrderedFlowEdges(edges, nodes);

  const arrow = textFlowArrow(direction);
  const steps = sorted.map((edge) => {
    const fromLabel = nodes.get(edge.from) ?? edge.from;
    const toLabel = nodes.get(edge.to) ?? edge.to;
    const edgeLabel = edge.label ? ` (${edge.label})` : '';
    return `${fromLabel} ${arrow} ${toLabel}${edgeLabel}`;
  });

  output.push('Steps (boxed):');
  output.push(...renderConnectedStepBoxes(steps).lines);

  return output;
}

function renderLinkedListAscii(
  edges: FlowEdge[],
  nodes: Map<string, string>,
  isDoublyLinked: boolean,
): string[] {
  const output: string[] = [];

  const normalizedChain = buildLinearChain(edges, nodes);

  // Render as ASCII boxes
  if (isDoublyLinked) {
    // Doubly linked list: show bidirectional arrows
    const boxes: string[] = [];
    for (let i = 0; i < normalizedChain.length; i++) {
      const item = normalizedChain[i];
      const boxWidth = Math.max(12, item.label.length + 4);
      const box = `┌─${item.label}─┐`;
      boxes.push(box.padEnd(boxWidth));
    }
    output.push(boxes.join(' ←→ '));

    // Show connections with prev/next pointers
    const pointers: string[] = [];
    for (let i = 0; i < normalizedChain.length; i++) {
      if (i === 0) {
        pointers.push(
          'null ←→ prev | ' + normalizedChain[i].label + ' | next ←→',
        );
      }
    }
    if (normalizedChain.length > 0) {
      let line = 'null ←─ ';
      for (let i = 0; i < normalizedChain.length; i++) {
        line += `prev | ${normalizedChain[i].label} | next ─→ `;
      }
      output.push(line);
    }
  } else {
    // Singly linked list: horizontal chain with pointers
    const lines: string[] = ['', '', ''];

    for (let i = 0; i < normalizedChain.length; i++) {
      const item = normalizedChain[i];
      const labelLen = item.label.length;
      const boxWidth = Math.max(6, labelLen + 2);

      // Top line: ┌─label─┐
      const topBox = '┌' + '─'.repeat(boxWidth) + '┐';
      lines[0] += topBox;

      // Middle line: │ label │ (centered)
      const padding = boxWidth - labelLen;
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      const midBox =
        '│' + ' '.repeat(leftPad) + item.label + ' '.repeat(rightPad) + '│';
      lines[1] += midBox;

      // Bottom line: └─────┘
      const botBox = '└' + '─'.repeat(boxWidth) + '┘';
      lines[2] += botBox;

      // Add arrow between nodes
      if (i < normalizedChain.length - 1) {
        lines[0] += ' → ';
        lines[1] += '   ';
        lines[2] += '   ';
      } else {
        lines[0] += ' → null';
        lines[1] += '';
        lines[2] += '';
      }
    }

    output.push(...lines.map((l) => l.trim()).filter((l) => l.length > 0));
  }

  return output;
}

function renderBinaryTreeAscii(
  edges: FlowEdge[],
  nodes: Map<string, string>,
): string[] {
  const output: string[] = [];

  const children = new Map<string, string[]>();
  const childSets = new Map<string, Set<string>>();
  const incomingCount = new Map<string, number>();

  const labelSortKey = (id: string): number | string => {
    const label = (nodes.get(id) ?? id).trim();
    const numeric = Number(label);
    if (!Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(label)) {
      return numeric;
    }
    return label;
  };

  for (const edge of edges) {
    if (edge.from === edge.to) {
      continue;
    }

    const list = children.get(edge.from) ?? [];
    const set = childSets.get(edge.from) ?? new Set<string>();
    if (!set.has(edge.to) && list.length < 2) {
      set.add(edge.to);
      childSets.set(edge.from, set);
      list.push(edge.to);
      children.set(edge.from, list);
      incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
    }
  }

  for (const [parent, list] of children) {
    list.sort((a, b) => {
      const left = labelSortKey(a);
      const right = labelSortKey(b);
      if (typeof left === 'number' && typeof right === 'number') {
        return left - right;
      }
      return String(left).localeCompare(String(right));
    });
    children.set(parent, list);
  }

  let root: string | undefined;
  for (const [nodeId] of nodes) {
    if (!incomingCount.has(nodeId) || incomingCount.get(nodeId) === 0) {
      root = nodeId;
      break;
    }
  }
  if (!root && nodes.size > 0) {
    root = Array.from(nodes.keys())[0];
  }
  if (!root) {
    output.push('(empty tree)');
    return output;
  }

  // Build complete-tree shaped levels so branches can be centered.
  const levels: Array<Array<string | undefined>> = [[root]];
  const visited = new Set<string>([root]);
  let depth = 0;
  const MAX_DEPTH = 6;
  while (depth < MAX_DEPTH) {
    const current = levels[depth];
    const next: Array<string | undefined> = [];
    let hasAnyChild = false;

    for (const id of current) {
      if (!id) {
        next.push(undefined, undefined);
        continue;
      }

      const [left, right] = children.get(id) ?? [];
      const leftChild = left && !visited.has(left) ? left : undefined;
      const rightChild = right && !visited.has(right) ? right : undefined;

      if (leftChild) {
        visited.add(leftChild);
        hasAnyChild = true;
      }
      if (rightChild) {
        visited.add(rightChild);
        hasAnyChild = true;
      }

      next.push(leftChild, rightChild);
    }

    if (!hasAnyChild) {
      break;
    }
    levels.push(next);
    depth += 1;
  }

  const treeHeight = levels.length - 1;
  const maxLabelLen = Math.max(
    2,
    ...Array.from(nodes.values()).map((label) => label.trim().length || 1),
  );
  const innerWidth = Math.max(2, maxLabelLen);
  const boxWidth = innerWidth + 2; // borders
  const slotWidth = boxWidth + 2;
  const gridWidth = (2 ** (treeHeight + 1) + 1) * slotWidth;
  const rowCount = levels.length * 5 - 2;
  const canvas: string[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: gridWidth }, () => ' '),
  );

  const drawText = (row: number, col: number, text: string): void => {
    if (row < 0 || row >= canvas.length) {
      return;
    }
    for (let i = 0; i < text.length; i += 1) {
      const c = col + i;
      if (c >= 0 && c < gridWidth) {
        canvas[row][c] = text[i];
      }
    }
  };

  const drawHLine = (row: number, start: number, end: number): void => {
    const s = Math.max(0, Math.min(start, end));
    const e = Math.min(gridWidth - 1, Math.max(start, end));
    for (let c = s; c <= e; c += 1) {
      if (canvas[row][c] === ' ') {
        canvas[row][c] = '─';
      }
    }
  };

  const centerFor = (level: number, index: number): number => {
    const step = 2 ** (treeHeight - level + 1);
    const offset = 2 ** (treeHeight - level);
    return (offset + index * step) * slotWidth;
  };

  const boxTop = (): string => `┌${'─'.repeat(innerWidth)}┐`;
  const boxMid = (label: string): string => {
    const raw = label.trim() || '?';
    const left = Math.floor((innerWidth - raw.length) / 2);
    const right = innerWidth - raw.length - left;
    return `│${' '.repeat(Math.max(0, left))}${raw.slice(0, innerWidth)}${' '.repeat(Math.max(0, right))}│`;
  };
  const boxBottom = (): string => `└${'─'.repeat(innerWidth)}┘`;

  for (let level = 0; level < levels.length; level += 1) {
    const rowBase = level * 5;
    const levelNodes = levels[level];

    for (let idx = 0; idx < levelNodes.length; idx += 1) {
      const nodeId = levelNodes[idx];
      if (!nodeId) {
        continue;
      }

      const label = nodes.get(nodeId) ?? nodeId;
      const center = centerFor(level, idx);
      const left = center - Math.floor(boxWidth / 2);

      drawText(rowBase, left, boxTop());
      drawText(rowBase + 1, left, boxMid(label));
      drawText(rowBase + 2, left, boxBottom());

      if (level < levels.length - 1) {
        const leftChild = levels[level + 1][idx * 2];
        const rightChild = levels[level + 1][idx * 2 + 1];
        if (leftChild || rightChild) {
          drawText(rowBase + 3, center, '│');
        }

        if (leftChild) {
          const leftCenter = centerFor(level + 1, idx * 2);
          drawHLine(rowBase + 4, leftCenter, center);
          drawText(rowBase + 4, leftCenter, '┌');
          drawText(rowBase + 4, center, rightChild ? '┴' : '┘');
        }
        if (rightChild) {
          const rightCenter = centerFor(level + 1, idx * 2 + 1);
          drawHLine(rowBase + 4, center, rightCenter);
          drawText(rowBase + 4, rightChild ? rightCenter : center, '┐');
          drawText(rowBase + 4, center, leftChild ? '┴' : '└');
        }
      }
    }
  }

  for (const row of canvas) {
    const line = row.join('').replace(/\s+$/g, '');
    if (line.trim().length > 0) {
      output.push(line);
    }
  }

  return output;
}

function renderFlowchart(source: string): string {
  const nodes = new Map<string, string>();
  const edges: FlowEdge[] = [];

  const upsertNode = (id: string, label: string): void => {
    const existing = nodes.get(id);
    if (!existing) {
      nodes.set(id, label);
      return;
    }

    // Prefer specific labels over generic id labels.
    const existingIsGeneric = existing === id;
    const incomingIsGeneric = label === id;

    if (existingIsGeneric && !incomingIsGeneric) {
      nodes.set(id, label);
    }
  };

  const lines = source.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (
      !line ||
      line.startsWith('%%') ||
      line.startsWith('flowchart') ||
      line.startsWith('graph ')
    ) {
      continue;
    }

    if (line.startsWith('subgraph ')) {
      const subgraphMatch =
        /^subgraph\s+([A-Za-z0-9_.:/-]+)(?:\s+\[(.*?)\])?$/.exec(line);
      if (subgraphMatch) {
        const id = subgraphMatch[1];
        const label = (subgraphMatch[2] ?? id).trim() || id;
        nodes.set(id, label);
      }
      continue;
    }

    if (line === 'end' || line.startsWith('direction ')) {
      continue;
    }

    const normalizedLine = normalizeImplicitFlowEdgeLabels(line);
    const parsedEdges = parseFlowEdgesFromLine(normalizedLine);
    if (parsedEdges.length > 0) {
      for (const parsedEdge of parsedEdges) {
        const fromNode = parseFlowNodeToken(parsedEdge.fromToken);
        const toNode = parseFlowNodeToken(parsedEdge.toToken);

        upsertNode(fromNode.id, fromNode.label);
        upsertNode(toNode.id, toNode.label);

        edges.push({
          from: fromNode.id,
          to: toNode.id,
          arrow: parsedEdge.arrow,
          label: parsedEdge.label,
        });
      }
      continue;
    }

    const node = parseFlowNodeToken(normalizedLine);
    upsertNode(node.id, node.label);
  }

  const output: string[] = [];
  const sourceLower = source.toLowerCase();
  const stackLayoutHint = /%%\s*layout\s*:\s*stack\b/.test(sourceLower);
  const queueLayoutHint = /%%\s*layout\s*:\s*queue\b/.test(sourceLower);
  const stackHint =
    stackLayoutHint ||
    /\bstack\b/.test(sourceLower) ||
    /\bflowchart\s+tb\b/.test(sourceLower) ||
    /\bgraph\s+tb\b/.test(sourceLower);
  const queueHint =
    queueLayoutHint ||
    /\bqueue\b/.test(sourceLower) ||
    /\bfront\b/.test(sourceLower) ||
    /\brear\b/.test(sourceLower);
  const linkedListHint =
    /\blinked\s+list\b/.test(sourceLower) ||
    /\bhead\b/.test(sourceLower) ||
    /\btail\b/.test(sourceLower) ||
    /\bnext\b/.test(sourceLower) ||
    /\bprev\b/.test(sourceLower) ||
    /\bnull\b/.test(sourceLower);
  const treeHint =
    /\bbinary\b/.test(sourceLower) ||
    /\bbst\b/.test(sourceLower) ||
    /\btree\b/.test(sourceLower) ||
    /\broot\b/.test(sourceLower) ||
    /\bleft\s+child\b/.test(sourceLower) ||
    /\bright\s+child\b/.test(sourceLower);

  // Try to detect special patterns
  if (treeHint && isBinaryTreePattern(edges, nodes.size)) {
    output.push('Binary Search Tree');
    output.push(...renderBinaryTreeAscii(edges, nodes));
  } else if (
    isLinkedListPattern(edges, nodes.size) &&
    (stackHint || queueHint || linkedListHint)
  ) {
    if (stackHint && !queueHint) {
      output.push(...renderStackAscii(edges, nodes));
    } else if (queueHint && !stackHint) {
      output.push(...renderQueueAscii(edges, nodes));
    } else {
      output.push('Linked List');
      output.push(...renderLinkedListAscii(edges, nodes, false));
    }
  } else {
    output.push('Diagram (flowchart)');

    const handshakeTimeline = renderHandshakeTimeline(
      edges,
      nodes,
      detectFlowDirection(source),
      sourceLower,
    );
    if (handshakeTimeline) {
      output.push(...handshakeTimeline);
      return output.join('\n');
    }

    const linearChain = buildLinearFlowChain(nodes, edges);
    if (linearChain && shouldRenderLinearChainAscii(linearChain)) {
      output.push(
        ...renderLinearFlowAscii(linearChain, detectFlowDirection(source)),
      );
    } else {
      output.push(
        ...renderProcessFlowSteps(edges, nodes, detectFlowDirection(source)),
      );

      if (nodes.size > 0 && edges.length === 0) {
        output.push('Nodes:');
        for (const [id, label] of Array.from(nodes.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        )) {
          if (id === label) {
            output.push(`- ${id}`);
          } else {
            output.push(`- ${id}: ${label}`);
          }
        }
      }

      if (nodes.size === 0 && edges.length === 0) {
        output.push('(empty flowchart)');
      }
    }
  }

  return output.join('\n');
}

function renderSequence(source: string): string {
  const participants = new Map<string, string>();
  const messages: SequenceMessage[] = [];

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.startsWith('sequenceDiagram')) {
      continue;
    }

    const participantMatch =
      /^(participant|actor)\s+([A-Za-z0-9_.:-]+)(?:\s+as\s+(.+))?$/i.exec(line);
    if (participantMatch) {
      const id = participantMatch[2];
      const displayName = participantMatch[3]?.trim() || id;
      participants.set(id, displayName);
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const left = line.slice(0, separatorIndex).trim();
    const message = line.slice(separatorIndex + 1).trim();
    const messageMatch =
      /^([A-Za-z0-9_.:][A-Za-z0-9_.:-]*)\s*(-->>|->>|-->|->|--x|x--|<--|<-)\s*([A-Za-z0-9_.:][A-Za-z0-9_.:-]*)$/.exec(
        left,
      );
    if (!messageMatch) {
      continue;
    }

    const from = messageMatch[1];
    const arrow = messageMatch[2];
    const to = messageMatch[3];

    if (!participants.has(from)) {
      participants.set(from, from);
    }
    if (!participants.has(to)) {
      participants.set(to, to);
    }

    messages.push({
      from,
      to,
      arrow,
      message,
    });
  }

  const output: string[] = ['Diagram (sequence)'];
  if (participants.size > 0) {
    output.push('Participants:');
    for (const [id, displayName] of participants) {
      if (id === displayName) {
        output.push(`- ${id}`);
      } else {
        output.push(`- ${id}: ${displayName}`);
      }
    }
  }

  if (messages.length > 0) {
    output.push('Messages:');
    messages.forEach((msg, index) => {
      const fromLabel = participants.get(msg.from) ?? msg.from;
      const toLabel = participants.get(msg.to) ?? msg.to;
      output.push(
        `${index + 1}. ${fromLabel} ${msg.arrow} ${toLabel}: ${msg.message}`,
      );
    });
  }

  if (participants.size === 0 && messages.length === 0) {
    output.push('(empty sequence diagram)');
  }

  return output.join('\n');
}

function renderClass(source: string): string {
  const classes = new Map<string, string[]>();
  const relations: ClassRelation[] = [];

  let currentClass: string | null = null;

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.startsWith('classDiagram')) {
      continue;
    }

    if (line === '}') {
      currentClass = null;
      continue;
    }

    const relationMatch =
      /^([A-Za-z0-9_.:-]+)\s+([<|*.o]+[-.]+[<|*.o]+)\s+([A-Za-z0-9_.:-]+)(?:\s*:\s*(.+))?$/.exec(
        line,
      );
    if (relationMatch) {
      relations.push({
        from: relationMatch[1],
        relation: relationMatch[2],
        to: relationMatch[3],
        label: relationMatch[4]?.trim() || undefined,
      });
      if (!classes.has(relationMatch[1])) {
        classes.set(relationMatch[1], []);
      }
      if (!classes.has(relationMatch[3])) {
        classes.set(relationMatch[3], []);
      }
      continue;
    }

    const classStartMatch = /^class\s+([A-Za-z0-9_.:-]+)\s*\{?$/.exec(line);
    if (classStartMatch) {
      currentClass = classStartMatch[1];
      if (!classes.has(currentClass)) {
        classes.set(currentClass, []);
      }
      continue;
    }

    const memberInlineMatch = /^([A-Za-z0-9_.:-]+)\s*:\s*(.+)$/.exec(line);
    if (memberInlineMatch) {
      const className = memberInlineMatch[1];
      const member = memberInlineMatch[2].trim();
      const list = classes.get(className) ?? [];
      list.push(member);
      classes.set(className, list);
      continue;
    }

    if (currentClass) {
      const members = classes.get(currentClass) ?? [];
      members.push(line);
      classes.set(currentClass, members);
    }
  }

  const output: string[] = ['Diagram (class)'];

  if (classes.size > 0) {
    output.push('Classes:');
    for (const [className, members] of Array.from(classes.entries()).sort(
      (a, b) => a[0].localeCompare(b[0]),
    )) {
      output.push(`- ${className}`);
      for (const member of members) {
        output.push(`  - ${member}`);
      }
    }
  }

  if (relations.length > 0) {
    output.push('Relations:');
    for (const relation of relations) {
      const label = relation.label ? ` : ${relation.label}` : '';
      output.push(
        `- ${relation.from} ${relation.relation} ${relation.to}${label}`,
      );
    }
  }

  if (classes.size === 0 && relations.length === 0) {
    output.push('(empty class diagram)');
  }

  return output.join('\n');
}

function renderErd(source: string): string {
  const entities = new Map<string, string[]>();
  const relations: ErdRelation[] = [];

  let currentEntity: string | null = null;

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.startsWith('erDiagram')) {
      continue;
    }

    if (line === '}') {
      currentEntity = null;
      continue;
    }

    const relationMatch =
      /^([A-Za-z0-9_.:-]+)\s+([|}{o]+--[|}{o]+)\s+([A-Za-z0-9_.:-]+)(?:\s*:\s*(.+))?$/.exec(
        line,
      );
    if (relationMatch) {
      relations.push({
        from: relationMatch[1],
        cardinality: relationMatch[2],
        to: relationMatch[3],
        label: relationMatch[4]?.trim() || undefined,
      });
      if (!entities.has(relationMatch[1])) {
        entities.set(relationMatch[1], []);
      }
      if (!entities.has(relationMatch[3])) {
        entities.set(relationMatch[3], []);
      }
      continue;
    }

    const entityStart = /^([A-Za-z0-9_.:-]+)\s*\{$/.exec(line);
    if (entityStart) {
      currentEntity = entityStart[1];
      if (!entities.has(currentEntity)) {
        entities.set(currentEntity, []);
      }
      continue;
    }

    if (currentEntity) {
      const attributes = entities.get(currentEntity) ?? [];
      attributes.push(line);
      entities.set(currentEntity, attributes);
    }
  }

  const output: string[] = ['Diagram (erd)'];

  if (entities.size > 0) {
    output.push('Entities:');
    for (const [entity, attributes] of Array.from(entities.entries()).sort(
      (a, b) => a[0].localeCompare(b[0]),
    )) {
      output.push(`- ${entity}`);
      for (const attr of attributes) {
        output.push(`  - ${attr}`);
      }
    }
  }

  if (relations.length > 0) {
    output.push('Relations:');
    for (const relation of relations) {
      const label = relation.label ? ` : ${relation.label}` : '';
      output.push(
        `- ${relation.from} ${relation.cardinality} ${relation.to}${label}`,
      );
    }
  }

  if (entities.size === 0 && relations.length === 0) {
    output.push('(empty erd)');
  }

  return output.join('\n');
}
