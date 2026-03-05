// ---------------------------------------------------------------------------
// ASCII / ANSI box-drawing fallback renderer
// ---------------------------------------------------------------------------
//
// When the terminal doesn't support any graphics protocol, we parse a subset
// of Mermaid syntax and produce a readable box-drawing diagram using Unicode
// line-drawing characters.
//
// Supported (MVP):
//   - sequenceDiagram  → participants across top, arrows between them
//   - graph TD / LR    → top-down or left-right flowchart
//   - classDiagram     → simple class boxes

// ---------------------------------------------------------------------------
// Box-drawing character sets
// ---------------------------------------------------------------------------

const BOX = {
    TL: '╭', TR: '╮', BL: '╰', BR: '╯',
    H: '─', V: '│',
    ARROW_R: '──▶',
    ARROW_L: '◀──',
    ARROW_BI: '◀──▶',
    DASH: '- - -',
} as const;

// ---------------------------------------------------------------------------
// Sequence diagram renderer
// ---------------------------------------------------------------------------

interface SeqMessage {
    from: string;
    to: string;
    label: string;
    type: '-->>' | '-->' | '->>' | '->';
}

function parseSequenceDiagram(spec: string): { participants: string[]; messages: SeqMessage[] } {
    const lines = spec.split('\n').map((l) => l.trim());
    const participants: string[] = [];
    const messages: SeqMessage[] = [];

    const participantRe = /^participant\s+(.+?)(?:\s+as\s+(.+))?$/i;
    const msgRe = /^(\w[\w\s]*?)\s*(-->>|-->|->>|->)\s*(\w[\w\s]*?)\s*:\s*(.*)$/;

    for (const line of lines) {
        const pMatch = line.match(participantRe);
        if (pMatch) {
            const name = pMatch[2] ?? pMatch[1];
            if (!participants.includes(name)) participants.push(name.trim());
            continue;
        }
        const mMatch = line.match(msgRe);
        if (mMatch) {
            const from = mMatch[1].trim();
            const type = mMatch[2] as SeqMessage['type'];
            const to = mMatch[3].trim();
            const label = mMatch[4].trim();
            if (!participants.includes(from)) participants.push(from);
            if (!participants.includes(to)) participants.push(to);
            messages.push({ from, to, label, type });
        }
    }
    return { participants, messages };
}

function renderSequenceDiagram(spec: string, termWidth = 100): string {
    const { participants, messages } = parseSequenceDiagram(spec);
    if (participants.length === 0) return renderGenericFallback(spec, termWidth);

    const colWidth = Math.max(14, Math.floor((termWidth - 4) / participants.length));
    const lines: string[] = [];

    // Header row: participant boxes
    const header = participants
        .map(() => {
            return `${BOX.TL}${BOX.H.repeat(colWidth - 2)}${BOX.TR}`;
        })
        .join('  ');

    const labelRow = participants
        .map((p) => {
            const label = p.slice(0, colWidth - 4).padEnd(colWidth - 4);
            return `${BOX.V} ${label} ${BOX.V}`;
        })
        .join('  ');

    const footer = participants
        .map(() => `${BOX.BL}${BOX.H.repeat(colWidth - 2)}${BOX.BR}`)
        .join('  ');

    lines.push('');
    lines.push(header);
    lines.push(labelRow);
    lines.push(footer);

    // Messages
    for (const msg of messages) {
        const fromIdx = participants.indexOf(msg.from);
        const toIdx = participants.indexOf(msg.to);
        if (fromIdx === -1 || toIdx === -1) continue;

        const isLeft = fromIdx > toIdx;
        const minIdx = Math.min(fromIdx, toIdx);
        const maxIdx = Math.max(fromIdx, toIdx);

        // Build a simple ASCII arrow row
        const rowParts = participants.map((_, i) => {
            if (i === fromIdx) return isLeft ? `◀${BOX.H.repeat(colWidth - 2)}` : `${BOX.H.repeat(colWidth - 2)}▶`;
            if (i === toIdx) return BOX.H.repeat(colWidth);
            if (i > minIdx && i < maxIdx) return BOX.H.repeat(colWidth);
            return ' '.repeat(colWidth);
        });

        const labelStr = `  ${msg.label.slice(0, termWidth - 4)}  `.slice(0, termWidth);
        lines.push('');
        lines.push(`  ${labelStr}`);
        lines.push('  ' + rowParts.join(''));
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Flowchart renderer (graph TD / LR subset)
// ---------------------------------------------------------------------------

interface FlowNode {
    id: string;
    label: string;
    shape: 'box' | 'diamond' | 'round';
}

interface FlowEdge {
    from: string;
    to: string;
    label?: string;
}

function parseFlowchart(spec: string): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const lines = spec.split('\n').map((l) => l.trim()).filter(Boolean);
    const nodes: Map<string, FlowNode> = new Map();
    const edges: FlowEdge[] = [];

    // node definition: A[Label] or A(Label) or A{Label}
    const nodeDefRe = /^(\w+)(\[.*?\]|\(.*?\)|\{.*?\})?$/;
    // edge: A --> B or A -->|label| B or A -- label --> B
    const edgeRe = /^(\w+)\s*(?:--[>|]?|==\s*>)\s*(?:\|(.+?)\|)?\s*(\w+)(?:\s*:\s*(.+))?$/;

    for (const line of lines) {
        if (line.startsWith('graph') || line.startsWith('flowchart')) continue;

        const eMatch = line.match(edgeRe);
        if (eMatch) {
            const fromId = eMatch[1];
            const toId = eMatch[3];
            const label = eMatch[2] ?? eMatch[4];
            edges.push({ from: fromId, to: toId, label });

            if (!nodes.has(fromId)) nodes.set(fromId, { id: fromId, label: fromId, shape: 'box' });
            if (!nodes.has(toId)) nodes.set(toId, { id: toId, label: toId, shape: 'box' });
            continue;
        }

        const nMatch = line.match(nodeDefRe);
        if (nMatch && nMatch[1] && !['graph', 'flowchart', 'TD', 'LR', 'BT', 'RL'].includes(nMatch[1])) {
            const id = nMatch[1];
            const raw = nMatch[2] ?? '';
            const label = raw.replace(/[\[\](){}"]/g, '').trim() || id;
            const shape = raw.startsWith('{') ? 'diamond' : raw.startsWith('(') ? 'round' : 'box';
            if (!nodes.has(id)) nodes.set(id, { id, label, shape });
        }
    }

    return { nodes: Array.from(nodes.values()), edges };
}

function renderFlowchart(spec: string, termWidth = 100): string {
    const { nodes, edges } = parseFlowchart(spec);
    if (nodes.length === 0) return renderGenericFallback(spec, termWidth);

    const lines: string[] = [''];

    for (const node of nodes) {
        const label = node.label.slice(0, termWidth - 8);
        const boxWidth = label.length + 4;
        const padding = ' ';

        if (node.shape === 'diamond') {
            lines.push(`  ◇ ${label}`);
        } else if (node.shape === 'round') {
            lines.push(`  ╰──── ${label} ────╯`);
        } else {
            lines.push(`  ${BOX.TL}${BOX.H.repeat(boxWidth)}${BOX.TR}`);
            lines.push(`  ${BOX.V}${padding}${label}${padding}${BOX.V}`);
            lines.push(`  ${BOX.BL}${BOX.H.repeat(boxWidth)}${BOX.BR}`);
        }

        // Print edges FROM this node
        const outEdges = edges.filter((e) => e.from === node.id);
        for (const edge of outEdges) {
            const target = nodes.find((n) => n.id === edge.to);
            const targetLabel = target ? target.label : edge.to;
            const edgeLabel = edge.label ? ` [${edge.label}] ` : ' ';
            lines.push(`       ${BOX.V}`);
            lines.push(`       ${BOX.ARROW_R}${edgeLabel}${targetLabel}`);
        }

        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Generic fallback: syntax-highlighted code block
// ---------------------------------------------------------------------------

function renderGenericFallback(spec: string, termWidth = 100): string {
    const hr = '─'.repeat(Math.min(termWidth - 4, 60));
    const lines = [
        '',
        `  ╭${hr}╮`,
        `  │ ⚠ ASCII fallback — diagram source:`,
        `  │`,
        ...spec
            .split('\n')
            .slice(0, 30)
            .map((l) => `  │ ${l}`),
        `  ╰${hr}╯`,
        '',
    ];
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render Mermaid source as ASCII/ANSI art for terminals that don't support
 * graphics protocols.
 *
 * @param spec   - Raw Mermaid diagram source
 * @param termWidth - Terminal column count (for layout)
 */
export function renderMermaidAscii(spec: string, termWidth = 100): string {
    const stripped = spec.trim().toLowerCase();

    if (stripped.startsWith('sequencediagram')) {
        return renderSequenceDiagram(spec, termWidth);
    }
    if (stripped.startsWith('graph') || stripped.startsWith('flowchart')) {
        return renderFlowchart(spec, termWidth);
    }

    // For unsupported types fall back to code display
    return renderGenericFallback(spec, termWidth);
}
