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

/**
 * Detect node shape from bracket syntax.
 */
function parseNodeDeclaration(
  raw: string,
): {
  id: string;
  label: string;
  shape: ParsedDiagram['nodes'][0]['shape'];
} | null {
  // Order matters: check multi-char brackets before single-char ones.

  // Stadium: A([text])
  let m = raw.match(/^(\w+)\(\[(.+?)\]\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'stadium' };

  // Circle: A((text))
  m = raw.match(/^(\w+)\(\((.+?)\)\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'circle' };

  // Diamond: A{text}
  m = raw.match(/^(\w+)\{(.+?)\}$/);
  if (m) return { id: m[1], label: m[2], shape: 'diamond' };

  // Rounded: A(text)
  m = raw.match(/^(\w+)\((.+?)\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'rounded' };

  // Rect: A[text]
  m = raw.match(/^(\w+)\[(.+?)\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'rect' };

  // Bare id (no brackets)
  m = raw.match(/^(\w+)$/);
  if (m) return { id: m[1], label: m[1], shape: 'rect' };

  return null;
}

/**
 * Parse a flowchart from Mermaid text.
 */
function parseFlowchart(code: string): ParsedDiagram {
  const nodes = new Map<
    string,
    { id: string; label: string; shape: ParsedDiagram['nodes'][0]['shape'] }
  >();
  const edges: ParsedDiagram['edges'] = [];

  const lines = code.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip the header line (graph LR, graph TD, flowchart LR, etc.)
    if (/^(graph|flowchart)\s/i.test(line)) continue;
    // Skip empty lines and comments
    if (!line || line.startsWith('%%')) continue;
    // Skip style/class directives
    if (/^(style|class|click|subgraph|end)\b/i.test(line)) continue;

    // Try to parse as an edge line.
    // Pattern: NodeA -->|label| NodeB  or  NodeA --> NodeB
    // Edge types: --> (solid), -.-> (dotted), ==> (thick)
    const edgeRegex = /^(.+?)\s+(==>|-->|-.->)\s*(?:\|([^|]*)\|)?\s*(.+)$/;
    const edgeMatch = line.match(edgeRegex);

    if (edgeMatch) {
      const sourceRaw = edgeMatch[1].trim();
      const edgeType = edgeMatch[2];
      const label = edgeMatch[3]?.trim();
      const targetRaw = edgeMatch[4].trim();

      const sourceNode = parseNodeDeclaration(sourceRaw);
      const targetNode = parseNodeDeclaration(targetRaw);

      if (sourceNode) {
        if (!nodes.has(sourceNode.id)) nodes.set(sourceNode.id, sourceNode);
      }
      if (targetNode) {
        if (!nodes.has(targetNode.id)) nodes.set(targetNode.id, targetNode);
      }

      const sourceId = sourceNode?.id ?? sourceRaw;
      const targetId = targetNode?.id ?? targetRaw;

      let style: 'solid' | 'dotted' | 'thick' = 'solid';
      if (edgeType === '-.->') style = 'dotted';
      else if (edgeType === '==>') style = 'thick';

      const edge: ParsedDiagram['edges'][0] = {
        source: sourceId,
        target: targetId,
        style,
      };
      if (label) edge.label = label;
      edges.push(edge);
    } else {
      // Try to parse as standalone node declaration
      const node = parseNodeDeclaration(line);
      if (node && !nodes.has(node.id)) {
        nodes.set(node.id, node);
      }
    }
  }

  return {
    diagramType: 'flowchart',
    nodes: Array.from(nodes.values()),
    edges,
  };
}

/**
 * Parse a sequence diagram from Mermaid text.
 */
function parseSequenceDiagram(code: string): ParsedDiagram {
  const participants = new Map<
    string,
    { id: string; label: string; shape: ParsedDiagram['nodes'][0]['shape'] }
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
