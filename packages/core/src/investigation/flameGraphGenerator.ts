/**
 * FlameGraphGenerator — Memory allocation flame graph for heap snapshots.
 *
 * Instead of the traditional CPU flame graph where width = time spent,
 * this generates a MEMORY flame graph where width = bytes retained.
 * Each frame represents a retainer path from root to leaf objects.
 *
 * Output formats:
 *   - Self-contained HTML with interactive SVG (opens in browser)
 *   - Perfetto-compatible trace events (for ui.perfetto.dev)
 *   - ASCII art for terminal display
 *   - Folded stacks format (compatible with Brendan Gregg's flamegraph.pl)
 *
 * Architecture:
 *   HeapSnapshotAnalyzer → FlameGraphGenerator → HTML / SVG / ASCII / Folded
 *
 * Innovation: This applies the flame graph metaphor to MEMORY instead of CPU,
 * showing WHERE memory is retained and WHY. Each horizontal bar is a reference
 * chain link; width = bytes that flow through this reference.
 *
 * @module investigation/flameGraphGenerator
 */

import type { ClassSummary, RetainerChain, RetainerStep, HeapNodeType } from './heapSnapshotAnalyzer.js';
import type { RootCauseReport, RootCauseFinding } from './rootCauseAnalyzer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A node in the flame graph tree */
export interface FlameNode {
  /** Display name for this frame */
  name: string;

  /** Type of this node (for coloring) */
  type: HeapNodeType | 'root' | 'category';

  /** Total bytes flowing through this frame (self + children) */
  totalBytes: number;

  /** Self bytes (bytes owned directly by this frame, not its children) */
  selfBytes: number;

  /** Number of objects at this frame */
  objectCount: number;

  /** Child frames */
  children: Map<string, FlameNode>;

  /** Depth in the tree (0 = root) */
  depth: number;
}

/** Options for flame graph generation */
export interface FlameGraphOptions {
  /** Title for the flame graph */
  title?: string;

  /** Maximum depth to render */
  maxDepth?: number;

  /** Minimum bytes to include a frame (filters noise) */
  minBytes?: number;

  /** Width in pixels for HTML output */
  width?: number;

  /** Height per frame in pixels */
  frameHeight?: number;

  /** Color scheme */
  colorScheme?: 'memory' | 'category' | 'confidence';
}

/** Folded stack line (compatible with flamegraph.pl) */
export interface FoldedStack {
  stack: string;  // semicolon-separated stack
  value: number;  // bytes
}

// ─── Color Schemes ──────────────────────────────────────────────────────────

const MEMORY_COLORS: Record<string, string> = {
  'object': '#e74c3c',      // red — objects
  'string': '#3498db',      // blue — strings
  'closure': '#9b59b6',     // purple — closures
  'array': '#e67e22',       // orange — arrays
  'code': '#2ecc71',        // green — code
  'hidden': '#95a5a6',      // gray — hidden/internal
  'native': '#1abc9c',      // teal — native
  'number': '#f1c40f',      // yellow — numbers
  'regexp': '#e91e63',      // pink — regexp
  'synthetic': '#607d8b',   // blue-gray — synthetic
  'root': '#34495e',        // dark — root
  'category': '#2c3e50',    // darker — categories
  'default': '#bdc3c7',     // light gray — default
};

// ─── Generator ──────────────────────────────────────────────────────────────

export class FlameGraphGenerator {
  private root: FlameNode;
  private options: Required<FlameGraphOptions>;

  constructor(options?: FlameGraphOptions) {
    this.options = {
      title: options?.title ?? 'Memory Retention Flame Graph',
      maxDepth: options?.maxDepth ?? 20,
      minBytes: options?.minBytes ?? 1024, // 1KB minimum
      width: options?.width ?? 1200,
      frameHeight: options?.frameHeight ?? 18,
      colorScheme: options?.colorScheme ?? 'memory',
    };

    this.root = this.createNode('all', 'root', 0);
  }

  /**
   * Build flame graph from class summaries.
   * Creates a tree where top-level frames are classes, sized by retained bytes.
   */
  addClassSummaries(summaries: ClassSummary[]): void {
    for (const cls of summaries) {
      if (cls.retainedSize < this.options.minBytes) continue;

      const typeNode = this.getOrCreateChild(this.root, cls.className,
        classNameToType(cls.className));
      typeNode.totalBytes += cls.retainedSize;
      typeNode.selfBytes += cls.shallowSize;
      typeNode.objectCount += cls.count;
    }

    this.root.totalBytes = this.sumChildren(this.root);
  }

  /**
   * Build flame graph from retainer chains.
   * Creates a tree where the path from root to leaf mirrors the GC retainer path.
   * This is the most informative view — shows retention structure.
   */
  addRetainerChains(chains: RetainerChain[]): void {
    for (const chain of chains) {
      if (chain.retainedSize < this.options.minBytes) continue;

      let current = this.root;

      // Walk the chain from root to leaf
      for (let i = 0; i < Math.min(chain.chain.length, this.options.maxDepth); i++) {
        const step = chain.chain[i];
        const name = `${step.edgeName}→${step.nodeName}`;
        current = this.getOrCreateChild(current, name, step.nodeType);
      }

      // The leaf gets the retained size
      current.totalBytes += chain.retainedSize;
      current.selfBytes += chain.selfSize;
      current.objectCount += 1;
    }

    // Propagate sizes up the tree
    this.propagateSizes(this.root);
  }

  /**
   * Build flame graph from root cause findings.
   * Groups by category, then by class, then by specific finding.
   */
  addRootCauseFindings(findings: RootCauseFinding[]): void {
    for (const finding of findings) {
      if (!finding.estimatedImpact || finding.estimatedImpact < this.options.minBytes) continue;

      // Category level
      const categoryNode = this.getOrCreateChild(this.root, finding.category, 'category');

      // Finding level
      const findingNode = this.getOrCreateChild(categoryNode,
        finding.title.slice(0, 60), 'category');
      findingNode.totalBytes += finding.estimatedImpact;
      findingNode.selfBytes += finding.estimatedImpact;

      // Class level
      for (const cls of finding.involvedClasses) {
        const classNode = this.getOrCreateChild(findingNode, cls, 'object');
        classNode.objectCount += 1;
      }
    }

    this.root.totalBytes = this.sumChildren(this.root);
  }

  /**
   * Generate self-contained HTML with interactive SVG flame graph.
   */
  toHTML(): string {
    const frames = this.flattenTree();
    const totalWidth = this.options.width;
    const frameHeight = this.options.frameHeight;
    const totalHeight = (this.getMaxDepth() + 2) * frameHeight + 60;

    const svgFrames = frames
      .filter(f => f.totalBytes >= this.options.minBytes)
      .map(f => {
        const x = (f.x / this.root.totalBytes) * totalWidth;
        const w = Math.max(1, (f.totalBytes / this.root.totalBytes) * totalWidth);
        // Inverted: deepest at top (icicle graph for memory)
        const y = f.depth * frameHeight + 40;
        const color = MEMORY_COLORS[f.type] || MEMORY_COLORS['default'];

        const label = f.name.length > Math.floor(w / 7) ? f.name.slice(0, Math.floor(w / 7)) + '…' : f.name;

        return `<g class="frame" data-name="${escapeHtml(f.name)}" data-bytes="${f.totalBytes}" data-self="${f.selfBytes}" data-count="${f.objectCount}" data-type="${f.type}">
  <rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${frameHeight - 1}" fill="${color}" rx="2" ry="2" />
  <text x="${(x + 3).toFixed(1)}" y="${y + frameHeight - 5}" font-size="11" fill="white" clip-path="url(#clip-${f.depth})">${escapeHtml(label)}</text>
</g>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(this.options.title)}</title>
<style>
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; }
h1 { text-align: center; font-size: 16px; margin: 10px 0; color: #ddd; }
.subtitle { text-align: center; font-size: 12px; color: #888; margin-bottom: 10px; }
svg { display: block; margin: 0 auto; }
.frame rect { cursor: pointer; opacity: 0.9; }
.frame rect:hover { opacity: 1; stroke: #fff; stroke-width: 1; }
#tooltip { position: fixed; background: rgba(0,0,0,0.9); color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px; pointer-events: none; display: none; z-index: 100; max-width: 400px; line-height: 1.5; }
#tooltip .name { font-weight: bold; color: #ffd700; }
#tooltip .bytes { color: #4ecdc4; }
#tooltip .count { color: #ff6b6b; }
#legend { display: flex; justify-content: center; gap: 16px; padding: 10px; flex-wrap: wrap; }
#legend .item { font-size: 11px; display: flex; align-items: center; gap: 4px; }
#legend .swatch { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
</style>
</head>
<body>
<h1>${escapeHtml(this.options.title)}</h1>
<div class="subtitle">Width = retained bytes | Click to zoom | Generated by Gemini CLI Investigation Module</div>
<div id="legend">
${Object.entries(MEMORY_COLORS).filter(([k]) => !['root', 'category', 'default'].includes(k)).map(([type, color]) =>
  `<div class="item"><span class="swatch" style="background:${color}"></span>${type}</div>`
).join('\n')}
</div>
<svg width="${totalWidth}" height="${totalHeight}">
${svgFrames}
</svg>
<div id="tooltip"></div>
<script>
const tooltip = document.getElementById('tooltip');
const frames = document.querySelectorAll('.frame');
function formatBytes(b) {
  if (b === 0) return '0 B';
  const u = ['B','KB','MB','GB'];
  const s = b < 0 ? '-' : '';
  const a = Math.abs(b);
  const i = Math.min(Math.floor(Math.log(a) / Math.log(1024)), u.length - 1);
  return s + (a / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + u[i];
}
frames.forEach(f => {
  f.addEventListener('mouseenter', e => {
    const d = f.dataset;
    const pct = ((d.bytes / ${this.root.totalBytes}) * 100).toFixed(1);
    tooltip.innerHTML = '<div class="name">' + d.name + '</div>' +
      '<div class="bytes">Retained: ' + formatBytes(+d.bytes) + ' (' + pct + '%)</div>' +
      '<div class="bytes">Self: ' + formatBytes(+d.self) + '</div>' +
      '<div class="count">Objects: ' + d.count + '</div>' +
      '<div>Type: ' + d.type + '</div>';
    tooltip.style.display = 'block';
  });
  f.addEventListener('mousemove', e => {
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY + 12) + 'px';
  });
  f.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
});
</script>
</body>
</html>`;
  }

  /**
   * Generate ASCII art flame graph for terminal display.
   */
  toASCII(width: number = 80): string {
    const lines: string[] = [];
    const frames = this.flattenTree();
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    lines.push(`${bold}${this.options.title}${reset}`);
    lines.push(`${'─'.repeat(width)}`);

    // Render each depth level
    const maxDepth = Math.min(this.getMaxDepth(), 12); // Limit for terminal

    for (let depth = 0; depth <= maxDepth; depth++) {
      const depthFrames = frames
        .filter(f => f.depth === depth && f.totalBytes >= this.options.minBytes)
        .sort((a, b) => b.totalBytes - a.totalBytes);

      if (depthFrames.length === 0) continue;

      let line = '';
      for (const frame of depthFrames) {
        const w = Math.max(1, Math.round((frame.totalBytes / this.root.totalBytes) * width));
        const label = frame.name.slice(0, w - 1);
        const bar = `[${label}${'═'.repeat(Math.max(0, w - label.length - 2))}]`;
        line += bar.slice(0, w);
      }

      // Pad to width
      line = line.padEnd(width);
      lines.push(line.slice(0, width));
    }

    lines.push(`${'─'.repeat(width)}`);
    lines.push(`${dim}Total: ${formatBytes(this.root.totalBytes)} | Frames: ${frames.length}${reset}`);

    return lines.join('\n');
  }

  /**
   * Export as folded stacks format (compatible with flamegraph.pl).
   * Each line: "frame1;frame2;frame3 bytes"
   */
  toFoldedStacks(): string {
    const stacks: FoldedStack[] = [];
    this.collectFoldedStacks(this.root, [], stacks);
    return stacks.map(s => `${s.stack} ${s.value}`).join('\n');
  }

  /**
   * Export as Perfetto trace events for visualization in ui.perfetto.dev.
   */
  toPerfettoEvents(): Array<Record<string, unknown>> {
    const events: Array<Record<string, unknown>> = [];
    const frames = this.flattenTree();
    let ts = 0;

    for (const frame of frames) {
      if (frame.totalBytes < this.options.minBytes) continue;

      // Duration event where dur = bytes (for width proportional to size)
      events.push({
        ph: 'X', // Complete event
        name: frame.name,
        cat: frame.type,
        pid: 1,
        tid: frame.depth + 1,
        ts: ts,
        dur: frame.totalBytes / 1000, // Scale to reasonable time
        args: {
          totalBytes: frame.totalBytes,
          selfBytes: frame.selfBytes,
          objectCount: frame.objectCount,
          type: frame.type,
        },
      });

      ts += frame.totalBytes / 1000;
    }

    return events;
  }

  /**
   * Get the flame graph root node.
   */
  getRoot(): FlameNode {
    return this.root;
  }

  /**
   * Get total bytes in the flame graph.
   */
  getTotalBytes(): number {
    return this.root.totalBytes;
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private createNode(name: string, type: HeapNodeType | 'root' | 'category', depth: number): FlameNode {
    return {
      name,
      type,
      totalBytes: 0,
      selfBytes: 0,
      objectCount: 0,
      children: new Map(),
      depth,
    };
  }

  private getOrCreateChild(parent: FlameNode, name: string, type: HeapNodeType | 'root' | 'category'): FlameNode {
    let child = parent.children.get(name);
    if (!child) {
      child = this.createNode(name, type, parent.depth + 1);
      parent.children.set(name, child);
    }
    return child;
  }

  private sumChildren(node: FlameNode): number {
    let total = node.selfBytes;
    for (const child of node.children.values()) {
      total += child.totalBytes || this.sumChildren(child);
    }
    return total;
  }

  private propagateSizes(node: FlameNode): number {
    let childTotal = 0;
    for (const child of node.children.values()) {
      childTotal += this.propagateSizes(child);
    }
    node.totalBytes = Math.max(node.totalBytes, node.selfBytes + childTotal);
    return node.totalBytes;
  }

  private getMaxDepth(): number {
    let max = 0;
    const queue: FlameNode[] = [this.root];
    while (queue.length > 0) {
      const node = queue.pop()!;
      max = Math.max(max, node.depth);
      for (const child of node.children.values()) {
        queue.push(child);
      }
    }
    return max;
  }

  private flattenTree(): Array<FlameNode & { x: number }> {
    const result: Array<FlameNode & { x: number }> = [];
    this.flattenNode(this.root, 0, result);
    return result;
  }

  private flattenNode(
    node: FlameNode,
    x: number,
    result: Array<FlameNode & { x: number }>
  ): void {
    result.push({ ...node, x });

    let childX = x;
    const sortedChildren = [...node.children.values()].sort((a, b) => b.totalBytes - a.totalBytes);

    for (const child of sortedChildren) {
      this.flattenNode(child, childX, result);
      childX += child.totalBytes;
    }
  }

  private collectFoldedStacks(
    node: FlameNode,
    path: string[],
    stacks: FoldedStack[]
  ): void {
    const currentPath = node.name === 'all' ? path : [...path, node.name];

    if (node.selfBytes > 0 && currentPath.length > 0) {
      stacks.push({
        stack: currentPath.join(';'),
        value: node.selfBytes,
      });
    }

    for (const child of node.children.values()) {
      this.collectFoldedStacks(child, currentPath, stacks);
    }
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function classNameToType(name: string): HeapNodeType {
  const lower = name.toLowerCase();
  if (/string|concat/.test(lower)) return 'string';
  if (/closure|function/.test(lower)) return 'closure';
  if (/array/.test(lower)) return 'array';
  if (/code/.test(lower)) return 'code';
  if (/regexp/.test(lower)) return 'regexp';
  if (/number/.test(lower)) return 'number';
  if (/native|buffer/.test(lower)) return 'native';
  if (/system|hidden|internal/.test(lower)) return 'hidden';
  return 'object';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  // BUG FIX #15: Clamp index and handle negative bytes properly
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const i = Math.min(Math.floor(Math.log(abs) / Math.log(1024)), units.length - 1);
  const value = abs / Math.pow(1024, i);
  return `${sign}${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
