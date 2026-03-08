import chalk from 'chalk';

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
        .map(() => chalk.cyan(`${BOX.TL}${BOX.H.repeat(colWidth - 2)}${BOX.TR}`))
        .join('  ');

    const labelRow = participants
        .map((p) => {
            const label = p.slice(0, colWidth - 4).padEnd(colWidth - 4);
            return chalk.cyan(`${BOX.V}`) + chalk.bold.white(` ${label} `) + chalk.cyan(`${BOX.V}`);
        })
        .join('  ');

    const footer = participants
        .map(() => chalk.cyan(`${BOX.BL}${BOX.H.repeat(colWidth - 2)}${BOX.BR}`))
        .join('  ');

    lines.push('');
    lines.push(header);
    lines.push(labelRow);
    lines.push(footer);

    /**
     * Helper to render vertical lines for all participants
     */
    const renderLifelines = () => {
        return participants.map(() => {
            const mid = Math.floor(colWidth / 2);
            return ' '.repeat(mid) + chalk.gray(BOX.V) + ' '.repeat(colWidth - mid - 1);
        }).join('  ');
    };

    lines.push(renderLifelines());

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
            const mid = Math.floor(colWidth / 2);

            if (i === fromIdx) {
                if (isLeft) {
                    return chalk.yellow('◀') + chalk.yellow(BOX.H.repeat(colWidth - 1));
                } else {
                    return chalk.yellow(BOX.H.repeat(mid)) + chalk.yellow(BOX.H.repeat(colWidth - mid));
                }
            }
            if (i === toIdx) {
                if (isLeft) {
                    return chalk.yellow(BOX.H.repeat(mid)) + chalk.yellow(BOX.H.repeat(colWidth - mid));
                } else {
                    return chalk.yellow(BOX.H.repeat(colWidth - 1)) + chalk.yellow('▶');
                }
            }
            if (i > minIdx && i < maxIdx) {
                return chalk.yellow(BOX.H.repeat(colWidth));
            }
            return ' '.repeat(mid) + chalk.gray(BOX.V) + ' '.repeat(colWidth - mid - 1);
        });

        const labelStr = chalk.bold.white(msg.label.slice(0, termWidth - 4));
        lines.push(`  ${labelStr}`);
        lines.push('  ' + rowParts.join(''));
        lines.push(renderLifelines());
    }

    // Bottom footer (participants again)
    lines.push(footer);

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
            lines.push(`  ` + chalk.magenta(`◇ ${label}`));
        } else if (node.shape === 'round') {
            lines.push(`  ` + chalk.green(`╰──── ${label} ────╯`));
        } else {
            lines.push(`  ` + chalk.blue(`${BOX.TL}${BOX.H.repeat(boxWidth)}${BOX.TR}`));
            lines.push(`  ` + chalk.blue(`${BOX.V}`) + chalk.white(`${padding}${label}${padding}`) + chalk.blue(`${BOX.V}`));
            lines.push(`  ` + chalk.blue(`${BOX.BL}${BOX.H.repeat(boxWidth)}${BOX.BR}`));
        }

        // Print edges FROM this node
        const outEdges = edges.filter((e) => e.from === node.id);
        for (const edge of outEdges) {
            const target = nodes.find((n) => n.id === edge.to);
            const targetLabel = target ? target.label : edge.to;
            const edgeLabel = edge.label ? ` [${edge.label}] ` : ' ';
            lines.push(`       ` + chalk.gray(`${BOX.V}`));
            lines.push(`       ` + chalk.yellow(`${BOX.ARROW_R}`) + chalk.gray(`${edgeLabel}`) + chalk.bold.white(`${targetLabel}`));
        }

        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// ER Diagram renderer
// ---------------------------------------------------------------------------

interface ErEntity {
    name: string;
    attributes: string[];
}

interface ErRelationship {
    entity1: string;
    relationship: string;
    entity2: string;
    label?: string;
}

function parseErDiagram(spec: string): { entities: ErEntity[]; relationships: ErRelationship[] } {
    const lines = spec.split('\n').map((l) => l.trim()).filter(Boolean);
    const entities: Map<string, ErEntity> = new Map();
    const relationships: ErRelationship[] = [];

    // Simple entity: EntityName { ... }
    // Relationship: Entity1 ||--o{ Entity2 : "label"
    const relRe = /^(\w+)\s+([|{}o<>\-]+)\s+(\w+)(?:\s*:\s*["']?(.+?)["']?)?$/;

    let currentEntity: string | null = null;

    for (const line of lines) {
        if (line.startsWith('erDiagram')) continue;

        const relMatch = line.match(relRe);
        if (relMatch) {
            relationships.push({
                entity1: relMatch[1],
                relationship: relMatch[2],
                entity2: relMatch[3],
                label: relMatch[4],
            });
            if (!entities.has(relMatch[1])) entities.set(relMatch[1], { name: relMatch[1], attributes: [] });
            if (!entities.has(relMatch[3])) entities.set(relMatch[3], { name: relMatch[3], attributes: [] });
            continue;
        }

        if (line.includes('{')) {
            currentEntity = line.split('{')[0].trim();
            if (!entities.has(currentEntity)) entities.set(currentEntity, { name: currentEntity, attributes: [] });
            continue;
        }

        if (line === '}') {
            currentEntity = null;
            continue;
        }

        if (currentEntity && !line.includes('}')) {
            const attr = line.replace(/^\w+\s+/, '').trim(); // Remove type
            entities.get(currentEntity)?.attributes.push(attr);
        }
    }

    return { entities: Array.from(entities.values()), relationships };
}

function renderErDiagram(spec: string, termWidth = 100): string {
    const { entities, relationships } = parseErDiagram(spec);
    if (entities.length === 0) return renderGenericFallback(spec, termWidth);

    const lines: string[] = [''];

    for (const entity of entities) {
        const maxWidth = Math.max(entity.name.length, ...entity.attributes.map(a => a.length)) + 4;
        const hr = BOX.H.repeat(maxWidth);

        lines.push(`  ` + chalk.green(`${BOX.TL}${hr}${BOX.TR}`));
        lines.push(`  ` + chalk.green(`${BOX.V}`) + chalk.bold.white(` ${entity.name.padEnd(maxWidth - 2)} `) + chalk.green(`${BOX.V}`));
        lines.push(`  ` + chalk.green(`${BOX.V}${BOX.H.repeat(maxWidth)}${BOX.V}`));

        for (const attr of entity.attributes) {
            lines.push(`  ` + chalk.green(`${BOX.V}`) + chalk.gray(` ${attr.padEnd(maxWidth - 2)} `) + chalk.green(`${BOX.V}`));
        }

        lines.push(`  ` + chalk.green(`${BOX.BL}${hr}${BOX.BR}`));

        // Print relationships
        const entityRels = relationships.filter(r => r.entity1 === entity.name);
        for (const rel of entityRels) {
            const label = rel.label ? ` (${rel.label}) ` : ' ';
            lines.push(`       ` + chalk.gray(`${BOX.V}`));
            lines.push(`       ` + chalk.yellow(`${rel.relationship}`) + chalk.gray(`${label}`) + chalk.bold.white(`${rel.entity2}`));
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
        `  ` + chalk.red(`╭${hr}╮`),
        `  ` + chalk.red(`│`) + chalk.bold.red(` ⚠ ASCII fallback — diagram source:`) + chalk.red(` │`),
        `  ` + chalk.red(`│`) + ' '.repeat(hr.length) + chalk.red(`│`),
        ...spec
            .split('\n')
            .slice(0, 30)
            .map((l) => {
                const line = l.slice(0, hr.length - 2).padEnd(hr.length - 2);
                return `  ` + chalk.red(`│`) + ` ${chalk.gray(line)} ` + chalk.red(`│`);
            }),
        `  ` + chalk.red(`╰${hr}╯`),
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

    if (stripped.startsWith('equencediagram')) {
        return renderSequenceDiagram(spec, termWidth);
    }
    if (stripped.startsWith('graph') || stripped.startsWith('flowchart')) {
        return renderFlowchart(spec, termWidth);
    }
    if (stripped.startsWith('erdiagram')) {
        return renderErDiagram(spec, termWidth);
    }

    // For unsupported types fall back to code display
    return renderGenericFallback(spec, termWidth);
}
