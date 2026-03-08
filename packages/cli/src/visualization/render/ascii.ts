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
    ARROW_D: '▼',
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
    const renderedNodes = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (renderedNodes.has(node.id)) continue;

        const label = node.label.slice(0, termWidth - 10);
        const boxWidth = label.length + 4;
        const halfBox = Math.floor(boxWidth / 2);
        const indent = ' '.repeat(5);

        // Render the node box
        if (node.shape === 'diamond') {
            lines.push(indent + chalk.magenta(`◇ ${label}`));
        } else if (node.shape === 'round') {
            lines.push(indent + chalk.green(`( ${label} )`));
        } else {
            lines.push(indent + chalk.blue(`${BOX.TL}${BOX.H.repeat(boxWidth)}${BOX.TR}`));
            lines.push(indent + chalk.blue(`${BOX.V}`) + chalk.white(` ${label} `) + chalk.blue(`${BOX.V}`));
            lines.push(indent + chalk.blue(`${BOX.BL}${BOX.H.repeat(boxWidth)}${BOX.BR}`));
        }
        renderedNodes.add(node.id);

        // Find edges FROM this node
        const outTransitions = edges.filter(e => e.from === node.id);
        const nextNode = nodes[i + 1];

        for (const t of outTransitions) {
            const isNext = nextNode && t.to === nextNode.id;
            const labelStr = t.label ? chalk.gray(` [${t.label}] `) : '';

            // If pointing to the very next node, use a centered vertical arrow
            if (isNext) {
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.gray(BOX.V));
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.yellow(BOX.ARROW_D) + labelStr);
            } else {
                // Diagonal/Branching (simplified as right arrow)
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.gray('└─') + chalk.yellow(BOX.ARROW_R) + labelStr + chalk.bold.white(t.to));
            }
        }

        if (outTransitions.length === 0 && i < nodes.length - 1) {
            lines.push(''); // Gap between disconnected parts
        }
    }

    lines.push('\n'); // Strategic padding
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// State Diagram renderer
// ---------------------------------------------------------------------------

interface StateNode {
    id: string;
    label: string;
    isStartEnd: boolean;
}

interface StateTransition {
    from: string;
    to: string;
    label?: string;
}

function parseStateDiagram(spec: string): { states: StateNode[]; transitions: StateTransition[] } {
    const lines = spec.split('\n').map((l) => l.trim()).filter(Boolean);
    const states: Map<string, StateNode> = new Map();
    const transitions: StateTransition[] = [];

    // [*] --> State or State --> [*] or State1 --> State2 : label
    const transRe = /^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)(?:\s*:\s*(.*))?$/;

    for (const line of lines) {
        if (line.startsWith('stateDiagram')) continue;

        const tMatch = line.match(transRe);
        if (tMatch) {
            const from = tMatch[1];
            const to = tMatch[2];
            const label = tMatch[3];
            transitions.push({ from, to, label });

            if (from !== '[*]' && !states.has(from)) states.set(from, { id: from, label: from, isStartEnd: false });
            if (to !== '[*]' && !states.has(to)) states.set(to, { id: to, label: to, isStartEnd: false });
            continue;
        }

        // state "Label" as ID
        if (line.startsWith('state')) {
            const parts = line.split(/\s+as\s+/i);
            if (parts.length === 2) {
                const label = parts[0].replace(/^state\s+["']?|["']?$/g, '');
                const id = parts[1];
                states.set(id, { id, label, isStartEnd: false });
            }
        }
    }

    return { states: Array.from(states.values()), transitions };
}

function renderStateDiagram(spec: string, termWidth = 100): string {
    const { states, transitions } = parseStateDiagram(spec);
    if (transitions.length === 0 && states.length === 0) return renderGenericFallback(spec, termWidth);

    const lines: string[] = [''];
    const indent = '  ';
    const renderedStates = new Set<string>();

    // 1. Render entry points
    const entryTransitions = transitions.filter(t => t.from === '[*]');
    for (const t of entryTransitions) {
        lines.push(indent + chalk.cyan(`● (START)`));
        lines.push(indent + '    ' + chalk.gray(BOX.V));
        lines.push(indent + '    ' + chalk.yellow(BOX.ARROW_D) + (t.label ? chalk.gray(` [${t.label}]`) : ''));
        lines.push('');
    }

    // 2. Render sequence of states
    for (let i = 0; i < states.length; i++) {
        const state = states[i];
        if (renderedStates.has(state.id)) continue;

        const label = state.label.slice(0, termWidth - 10);
        const boxWidth = label.length + 4;
        const halfBox = Math.floor(boxWidth / 2);

        // Draw the state box
        lines.push(indent + chalk.blue(`╭${BOX.H.repeat(boxWidth)}╮`));
        lines.push(indent + chalk.blue(`│`) + chalk.bold.white(` ${label} `) + chalk.blue(`│`));
        lines.push(indent + chalk.blue(`╰${BOX.H.repeat(boxWidth)}╯`));
        renderedStates.add(state.id);

        // Transitions from this state
        const out = transitions.filter(t => t.from === state.id);
        const nextState = states[i + 1];

        for (const t of out) {
            const labelStr = t.label ? chalk.gray(` [${t.label}] `) : '';
            if (t.to === '[*]') {
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.gray(BOX.V));
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.yellow(BOX.ARROW_D) + labelStr + chalk.cyan('● (END)'));
            } else if (nextState && t.to === nextState.id) {
                // Vertical arrow to next rendered box
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.gray(BOX.V));
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.yellow(BOX.ARROW_D) + labelStr);
            } else {
                // Sideways arrow for branches
                lines.push(indent + ' '.repeat(halfBox + 1) + chalk.gray('└─') + chalk.yellow(BOX.ARROW_R) + labelStr + chalk.bold.white(t.to));
            }
        }
        lines.push('');
    }

    lines.push('\n'); // Strategic padding
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Pie Chart renderer
// ---------------------------------------------------------------------------

function renderPieChart(spec: string, termWidth = 100): string {
    const lines = spec.split('\n').map(l => l.trim()).filter(Boolean);
    const data: { label: string; value: number }[] = [];
    let total = 0;

    for (const line of lines) {
        if (line.startsWith('pie')) continue;
        const match = line.match(/^"(.+?)"\s*:\s*([\d.]+)/);
        if (match) {
            const val = parseFloat(match[2]);
            data.push({ label: match[1], value: val });
            total += val;
        }
    }

    if (data.length === 0) return renderGenericFallback(spec, termWidth);

    const result: string[] = ['', chalk.bold.white('  Pie Chart Breakdown'), ''];
    const barMax = Math.min(termWidth - 25, 40);

    for (const item of data) {
        const percent = (item.value / total) * 100;
        const barLen = Math.round((item.value / total) * barMax);
        const bar = chalk.green('█'.repeat(barLen)) + chalk.gray('░'.repeat(barMax - barLen));
        const label = item.label.slice(0, 15).padEnd(15);
        result.push(`  ${chalk.white(label)} | ${bar} ${chalk.bold.cyan(percent.toFixed(1) + '%')}`);
    }

    result.push('');
    return result.join('\n');
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

    if (stripped.startsWith('sequencediagram')) {
        return renderSequenceDiagram(spec, termWidth);
    }
    if (stripped.startsWith('graph') || stripped.startsWith('flowchart')) {
        return renderFlowchart(spec, termWidth);
    }
    if (stripped.startsWith('erdiagram')) {
        return renderErDiagram(spec, termWidth);
    }
    if (stripped.startsWith('statediagram')) {
        return renderStateDiagram(spec, termWidth);
    }
    if (stripped.startsWith('pie')) {
        return renderPieChart(spec, termWidth);
    }

    // For unsupported types fall back to code display
    return renderGenericFallback(spec, termWidth);
}
