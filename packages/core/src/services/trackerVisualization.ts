/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * trackerVisualization.ts
 *
 * Live terminal visualization during task execution (issue #19942).
 *
 * Features
 *  - TTY-safe (CI friendly)
 *  - In-place redraw without terminal spam
 *  - ANSI color only when supported
 *  - Robust error handling
 *  - O(n) ASCII tree builder with children index + single-pass stats
 */

import * as readline from 'node:readline';
import { TaskStatus, TaskType, type TrackerTask } from './trackerTypes.js';
import type { TrackerService } from './trackerService.js';
import { debugLogger } from '../utils/debugLogger.js';

/* ──────────────────────────────────────────────────────────
   ANSI Utilities
────────────────────────────────────────────────────────── */

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  yellow: '\x1b[93m',
  green: '\x1b[92m',
  red: '\x1b[91m',
  grey: '\x1b[90m',
  cyan: '\x1b[96m',
} as const;

/** Checked at call time so tests can stub process.stdout freely. */
function isTTY(): boolean {
  return Boolean(process.stdout.isTTY);
}

function color(code: string, text: string): string {
  if (!isTTY()) return text;
  return `${code}${text}${ANSI.reset}`;
}

/* ──────────────────────────────────────────────────────────
   Status / Type display maps
────────────────────────────────────────────────────────── */

const STATUS_SYMBOL: Record<TaskStatus, string> = {
  [TaskStatus.OPEN]: '○',
  [TaskStatus.IN_PROGRESS]: '◉',
  [TaskStatus.BLOCKED]: '⊘',
  [TaskStatus.CLOSED]: '●',
};

const STATUS_COLORS: Record<string, string> = {
  '●': ANSI.green,
  '◉': ANSI.yellow,
  '⊘': ANSI.red,
  '○': ANSI.grey,
};

const TYPE_ICON: Record<TaskType, string> = {
  [TaskType.EPIC]: '⬡',
  [TaskType.TASK]: '▸',
  [TaskType.BUG]: '⚑',
};

/* ──────────────────────────────────────────────────────────
   ASCII Tree Builder  O(n)
────────────────────────────────────────────────────────── */

/**
 * Builds a plain-text ASCII dependency tree from a flat task list.
 *
 * Performance:
 *  - Single pass to build children index + compute stats (avoids O(n²)
 *    repeated .filter() calls inside the recursive traversal).
 *  - Iterative stack-based traversal (no call-stack overflow on deep trees).
 *
 * Exported so TrackerVisualizeTool in trackerTools.ts can reuse it,
 * keeping the LLM output and terminal output in sync.
 */
export function buildAsciiTree(tasks: TrackerTask[]): string {
  const lines: string[] = [];

  // ── Single pass: build children index + count statuses ──────────────────
  let closed = 0;
    let inProgress = 0;
    let blocked = 0;
  const childrenOf = new Map<string, TrackerTask[]>();
  const roots: TrackerTask[] = [];

  for (const task of tasks) {
    switch (task.status) {
      case TaskStatus.CLOSED:
        closed++;
        break;
      case TaskStatus.IN_PROGRESS:
        inProgress++;
        break;
      case TaskStatus.BLOCKED:
        blocked++;
        break;
      default:
        break;
    }

    if (task.parentId) {
      const siblings = childrenOf.get(task.parentId) ?? [];
      siblings.push(task);
      childrenOf.set(task.parentId, siblings);
    } else {
      roots.push(task);
    }
  }

  // ── Header + progress bar ────────────────────────────────────────────────
  const total = tasks.length;
  const open = total - closed - inProgress - blocked;
  const pct = total ? Math.round((closed / total) * 100) : 0;
  const barWidth = 24;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  lines.push('tracker_visualize()');
  lines.push('─'.repeat(56));
  lines.push(
    `  [${bar}] ${pct}%  ●${closed} ◉${inProgress} ○${open} ⊘${blocked}  / ${total} tasks`,
  );
  lines.push('─'.repeat(56));

  // ── Iterative depth-first traversal (no stack-overflow risk) ────────────
  type StackEntry = { task: TrackerTask; prefix: string; isLast: boolean };
  const stack: StackEntry[] = [];

  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ task: roots[i], prefix: '', isLast: i === roots.length - 1 });
  }

  while (stack.length > 0) {
    const { task, prefix, isLast } = stack.pop()!;

    const connector = isLast ? '└─ ' : '├─ ';
    const depsPart = task.dependencies.length
      ? ` ← ${task.dependencies.join(', ')}`
      : '';

    lines.push(
      `${prefix}${connector}${STATUS_SYMBOL[task.status]} ${TYPE_ICON[task.type]} ` +
        `${task.title} [${task.id}]${depsPart}`,
    );

    const children = childrenOf.get(task.id) ?? [];
    const nextPrefix = prefix + (isLast ? '   ' : '│  ');

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        task: children[i],
        prefix: nextPrefix,
        isLast: i === children.length - 1,
      });
    }
  }

  lines.push('─'.repeat(56));
  return lines.join('\n');
}

/* ──────────────────────────────────────────────────────────
   Line Colorizer
────────────────────────────────────────────────────────── */

function colorizeLine(line: string, activeTaskId?: string): string {
  try {
    if (line.startsWith('tracker_visualize')) {
      return color(ANSI.bold + ANSI.cyan, line);
    }
    if (line.startsWith('─')) {
      return color(ANSI.dim, line);
    }
    if (line.includes('100%')) {
      return color(ANSI.green, line);
    }
    if (activeTaskId && line.includes(activeTaskId)) {
      return color(ANSI.bold + ANSI.yellow, line);
    }
    for (const [symbol, code] of Object.entries(STATUS_COLORS)) {
      if (line.includes(symbol)) {
        return color(code, line);
      }
    }
    return line;
  } catch {
    return line;
  }
}

/* ──────────────────────────────────────────────────────────
   Terminal Renderer
────────────────────────────────────────────────────────── */

class TerminalRenderer {
  private lineCount = 0;

  render(lines: string[]): void {
    try {
      if (!isTTY()) {
        // CI / piped output — write directly, no cursor tricks
        process.stdout.write(lines.join('\n') + '\n');
        return;
      }

      if (this.lineCount > 0) {
        readline.moveCursor(process.stdout, 0, -this.lineCount);
      }

      for (const line of lines) {
        readline.clearLine(process.stdout, 0);
        process.stdout.write(line + '\n');
      }

      // Clear leftover lines if new frame is shorter than previous
      const extra = this.lineCount - lines.length;
      for (let i = 0; i < extra; i++) {
        readline.clearLine(process.stdout, 0);
        process.stdout.write('\n');
      }

      this.lineCount = lines.length;
    } catch (err) {
      debugLogger.warn('Terminal render error:', err);
    }
  }
}

/* ──────────────────────────────────────────────────────────
   Tracker Visualizer
────────────────────────────────────────────────────────── */

export class TrackerVisualizer {
  private renderer = new TerminalRenderer();
  private activeTaskId?: string;

  constructor(private readonly service: TrackerService) {}

  setActiveTask(id?: string): void {
    this.activeTaskId = id;
  }

  async render(): Promise<void> {
    try {
      const tasks = await this.service.listTasks();

      const lines = buildAsciiTree(tasks)
        .split('\n')
        .map((line) => colorizeLine(line, this.activeTaskId));

      // Active-task callout appended AFTER colorization — avoids double ANSI
      if (this.activeTaskId) {
        const active = tasks.find((t) => t.id === this.activeTaskId);
        if (active) {
          lines.push(
            color(ANSI.yellow, '◉ Running: ') +
              color(ANSI.bold, active.title) +
              color(ANSI.dim, `  [${active.id}]`),
          );
          if (active.dependencies && active.dependencies.length > 0) {
            lines.push(
              color(ANSI.dim, `  deps: ${active.dependencies.join(', ')}`),
            );
          }
        }
      }

      this.renderer.render(lines);
    } catch (err) {
      debugLogger.warn('Tracker visualization error:', err);
    }
  }
}

/* ──────────────────────────────────────────────────────────
   Task Execution Wrapper
────────────────────────────────────────────────────────── */

/**
 * Runs `fn` while keeping the terminal visualization live.
 * Manages the full task lifecycle: OPEN → IN_PROGRESS → CLOSED (or BLOCKED).
 *
 * Usage:
 *   const viz = new TrackerVisualizer(trackerService);
 *   await viz.render(); // draw initial frame
 *
 *   for (const task of readyTasks) {
 *     await executeWithVisualization(trackerService, viz, task.id, async () => {
 *       await doWork();
 *     });
 *   }
 */
export async function executeWithVisualization(
  service: TrackerService,
  viz: TrackerVisualizer,
  taskId: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (!taskId) {
    throw new Error('executeWithVisualization requires a taskId');
  }

  viz.setActiveTask(taskId);

  try {
    await service.updateTask(taskId, { status: TaskStatus.IN_PROGRESS });
    await viz.render();

    await fn();

    await service.updateTask(taskId, { status: TaskStatus.CLOSED });
  } catch (err) {
    try {
      await service.updateTask(taskId, { status: TaskStatus.BLOCKED });
    } catch (updateError) {
      debugLogger.warn('Failed to update task status to BLOCKED:', updateError);
    }
    throw err;
  } finally {
    viz.setActiveTask(undefined);
    try {
      await viz.render();
    } catch (renderError) {
      debugLogger.warn('Final render failed:', renderError);
    }
  }
}
