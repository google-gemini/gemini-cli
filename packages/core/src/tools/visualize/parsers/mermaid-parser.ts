/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regex-based Mermaid diagram parser.
 * Parses flowchart and sequence diagram syntax without importing mermaid.js.
 */

interface ParsedDiagram {
  diagramType: 'flowchart' | 'sequence' | 'class' | 'er' | 'gantt' | 'git';
  nodes: Array<{
    id: string;
    label: string;
    shape: 'rect' | 'diamond' | 'rounded' | 'circle' | 'stadium';
  }>;
  edges: Array<{
    source: string;
    target: string;
    label?: string;
    style: 'solid' | 'dotted' | 'thick';
  }>;
}

/**
 * Detect diagram type from the first line of the code.
 */
function detectDiagramType(code: string): ParsedDiagram['diagramType'] {
  const firstLine = code.trim().split('\n')[0].trim().toLowerCase();
  if (firstLine.startsWith('sequencediagram')) return 'sequence';
  if (firstLine.startsWith('classdiagram')) return 'class';
  if (firstLine.startsWith('erdiagram')) return 'er';
  if (firstLine.startsWith('gantt')) return 'gantt';
  if (firstLine.startsWith('gitgraph')) return 'git';
  return 'flowchart';
}

type NodeShape = ParsedDiagram['nodes'][0]['shape'];

/**
 * Parse a single node token like: A, A[text], A["text"], A(text), A{text}, A((text)), A([text])
 */
function parseNodeToken(raw: string): {
  id: string;
  label: string;
  shape: NodeShape;
} | null {
  const s = raw.trim();
  if (!s) return null;

  // Stadium: A([text])
  let m = s.match(/^(\w+)\(\[(.+?)\]\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'stadium' };

  // Circle: A((text))
  m = s.match(/^(\w+)\(\((.+?)\)\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'circle' };

  // Diamond: A{text} or A{"text"}
  m = s.match(/^(\w+)\{"?(.+?)"?\}$/);
  if (m) return { id: m[1], label: m[2], shape: 'diamond' };

  // Rounded: A(text) or A("text")
  m = s.match(/^(\w+)\("?(.+?)"?\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'rounded' };

  // Rect: A[text] or A["text"]
  m = s.match(/^(\w+)\["?(.+?)"?\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'rect' };

  // Bare id (no brackets)
  m = s.match(/^(\w+)$/);
  if (m) return { id: m[1], label: m[1], shape: 'rect' };

  return null;
}

interface EdgeToken {
  arrow: string;
  label?: string;
}

/**
 * Determine edge style from arrow string.
 */
function arrowStyle(arrow: string): 'solid' | 'dotted' | 'thick' {
  if (arrow.startsWith('-.') || arrow.startsWith('-..')) return 'dotted';
  if (arrow.startsWith('==')) return 'thick';
  return 'solid';
}

/**
 * Split a line into alternating node-tokens and edge-tokens.
 * Supports chained edges: A --> B --> C
 * Returns array like [nodeStr, edgeToken, nodeStr, edgeToken, nodeStr, ...]
 */
function tokenizeLine(
  line: string,
): { nodes: string[]; edgeTokens: EdgeToken[] } | null {
  const nodes: string[] = [];
  const edgeTokens: EdgeToken[] = [];

  let remaining = line;

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (!remaining) break;

    // Try to find next arrow
    const arrowMatch = remaining.match(
      /\s+(==>|===?>|-\.->|-\.\.->|-->|---|--)\s*(?:\|([^|]*)\|)?\s*/,
    );

    if (!arrowMatch || arrowMatch.index === undefined) {
      // No more arrows - rest is the last node
      nodes.push(remaining.trim());
      break;
    }

    // Everything before the arrow is a node
    const nodeStr = remaining.slice(0, arrowMatch.index).trim();
    if (nodeStr) {
      nodes.push(nodeStr);
    }

    edgeTokens.push({
      arrow: arrowMatch[1],
      label: arrowMatch[2]?.trim() || undefined,
    });

    remaining = remaining.slice(arrowMatch.index + arrowMatch[0].length);
  }

  if (nodes.length < 2 && edgeTokens.length > 0) return null;
  if (edgeTokens.length === 0 && nodes.length === 1) {
    return { nodes, edgeTokens: [] };
  }
  if (edgeTokens.length === 0) return null;

  return { nodes, edgeTokens };
}

/**
 * Parse a flowchart from Mermaid text.
 */
function parseFlowchart(code: string): ParsedDiagram {
  const nodeMap = new Map<
    string,
    { id: string; label: string; shape: NodeShape }
  >();
  const edges: ParsedDiagram['edges'] = [];

  function ensureNode(raw: string): string {
    const parsed = parseNodeToken(raw);
    if (parsed) {
      if (!nodeMap.has(parsed.id)) nodeMap.set(parsed.id, parsed);
      return parsed.id;
    }
    // Fallback: use raw as id
    const fallbackId = raw.replace(/[^\w]/g, '_');
    if (!nodeMap.has(fallbackId)) {
      nodeMap.set(fallbackId, { id: fallbackId, label: raw, shape: 'rect' });
    }
    return fallbackId;
  }

  const lines = code.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip headers, empty lines, comments, directives
    if (/^(graph|flowchart)\s/i.test(line)) continue;
    if (!line || line.startsWith('%%')) continue;
    if (/^(style|class|click|subgraph|end|linkStyle)\b/i.test(line)) continue;

    const tokens = tokenizeLine(line);
    if (!tokens || tokens.edgeTokens.length === 0) {
      // Try as standalone node
      const raw = tokens?.nodes[0] ?? line;
      const node = parseNodeToken(raw);
      if (node && !nodeMap.has(node.id)) {
        nodeMap.set(node.id, node);
      }
      continue;
    }

    // Create edges for each consecutive pair
    for (let i = 0; i < tokens.edgeTokens.length; i++) {
      const sourceId = ensureNode(tokens.nodes[i]);
      const targetId = ensureNode(tokens.nodes[i + 1]);
      const et = tokens.edgeTokens[i];

      const edge: ParsedDiagram['edges'][0] = {
        source: sourceId,
        target: targetId,
        style: arrowStyle(et.arrow),
      };
      if (et.label) edge.label = et.label;
      edges.push(edge);
    }
  }

  return {
    diagramType: 'flowchart',
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

/**
 * Parse a sequence diagram from Mermaid text.
 */
function parseSequenceDiagram(code: string): ParsedDiagram {
  const participants = new Map<
    string,
    { id: string; label: string; shape: NodeShape }
  >();
  const edges: ParsedDiagram['edges'] = [];

  const lines = code.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || /^sequencediagram/i.test(line))
      continue;

    // Participant declarations: participant Alice or actor Bob
    const participantMatch = line.match(
      /^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/i,
    );
    if (participantMatch) {
      const id = participantMatch[1];
      const label = participantMatch[2]?.trim() ?? id;
      if (!participants.has(id)) {
        participants.set(id, { id, label, shape: 'rect' });
      }
      continue;
    }

    // Messages: Alice->>Bob: Hello  or  Bob-->>Alice: Hi back
    const msgMatch = line.match(
      /^(\w+)\s*(--?>>|--?>|->>|->|--x|--\))\s*(\w+)\s*:\s*(.*)$/,
    );
    if (msgMatch) {
      const sourceId = msgMatch[1];
      const arrow = msgMatch[2];
      const targetId = msgMatch[3];
      const label = msgMatch[4].trim();

      if (!participants.has(sourceId)) {
        participants.set(sourceId, {
          id: sourceId,
          label: sourceId,
          shape: 'rect',
        });
      }
      if (!participants.has(targetId)) {
        participants.set(targetId, {
          id: targetId,
          label: targetId,
          shape: 'rect',
        });
      }

      const style: 'solid' | 'dotted' | 'thick' = arrow.startsWith('--')
        ? 'dotted'
        : 'solid';

      edges.push({
        source: sourceId,
        target: targetId,
        label: label || undefined,
        style,
      });
    }
  }

  return {
    diagramType: 'sequence',
    nodes: Array.from(participants.values()),
    edges,
  };
}

/**
 * Parse Mermaid diagram text into a structured representation.
 * Uses regex only -- does NOT import the mermaid library.
 */
export async function parseMermaid(code: string): Promise<ParsedDiagram> {
  const diagramType = detectDiagramType(code);

  if (diagramType === 'sequence') {
    return parseSequenceDiagram(code);
  }

  // Default: parse as flowchart
  return parseFlowchart(code);
}
