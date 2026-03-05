/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom Vitest reporter that generates a structured RunSummary JSON file
 * after each evaluation run. It cross-references the Vitest task results
 * with per-eval metadata (category, tags, policy) written to a registry
 * file by the test-helper during test module initialisation.
 */

import type { Reporter, File, Task, Suite } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  EvalRegistryEntry,
  RunSummary,
  ScenarioResult,
  CategorySummary,
} from './types.js';
import { type EvalCategory, ALL_CATEGORIES } from '../categories.js';

const REGISTRY_PATH = path.resolve(
  process.cwd(),
  'evals/logs/.eval-registry.ndjson',
);

function isRegistryEntry(v: unknown): v is EvalRegistryEntry {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>)['name'] === 'string'
  );
}

function loadRegistry(): Map<string, EvalRegistryEntry> {
  const map = new Map<string, EvalRegistryEntry>();
  if (!fs.existsSync(REGISTRY_PATH)) return map;
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRegistryEntry(parsed)) {
        map.set(parsed.name, parsed);
      }
    } catch (e) {
      console.warn(
        `[eval-scorer] Could not parse registry line: "${trimmed}". Error: ${e}`,
      );
    }
  }
  return map;
}

function collectLeafTests(tasks: Task[]): Task[] {
  const leaves: Task[] = [];
  for (const task of tasks) {
    if ('tasks' in task && Array.isArray((task as Suite).tasks)) {
      leaves.push(...collectLeafTests((task as Suite).tasks));
    } else {
      leaves.push(task);
    }
  }
  return leaves;
}

export default class EvalScoringReporter implements Reporter {
  async onFinished(files: File[] = []) {
    const registry = loadRegistry();
    const scenarios: ScenarioResult[] = [];

    for (const file of files) {
      const leafTests = collectLeafTests(file.tasks);
      for (const task of leafTests) {
        const name = task.name;
        const entry = registry.get(name);
        const skipped =
          task.mode === 'skip' ||
          task.mode === 'todo' ||
          task.result?.state === 'skip';
        const passed = !skipped && task.result?.state === 'pass';
        const durationMs = task.result?.duration ?? 0;

        scenarios.push({
          name,
          category: (entry?.category ?? 'uncategorized') as
            | EvalCategory
            | 'uncategorized',
          tags: entry?.tags ?? [],
          policy: entry?.policy ?? 'USUALLY_PASSES',
          passed,
          skipped,
          durationMs,
        });
      }
    }

    const byCategory: Record<string, CategorySummary> = {};
    for (const category of [...ALL_CATEGORIES, 'uncategorized']) {
      byCategory[category] = { pass: 0, fail: 0, skip: 0, passRate: 0 };
    }
    for (const s of scenarios) {
      if (s.skipped) {
        byCategory[s.category].skip++;
      } else if (s.passed) {
        byCategory[s.category].pass++;
      } else {
        byCategory[s.category].fail++;
      }
    }
    for (const summary of Object.values(byCategory)) {
      const ran = summary.pass + summary.fail;
      summary.passRate = ran === 0 ? 0 : summary.pass / ran;
    }

    const totalPass = scenarios.filter((s) => s.passed).length;
    const totalSkip = scenarios.filter((s) => s.skipped).length;
    const totalFail = scenarios.length - totalPass - totalSkip;
    const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;

    const ran = scenarios.length - totalSkip;
    const summary: RunSummary = {
      runId,
      timestamp: new Date().toISOString(),
      totalPass,
      totalFail,
      totalSkip,
      passRate: ran === 0 ? 0 : totalPass / ran,
      byCategory,
      scenarios,
    };

    const logsDir = path.resolve(process.cwd(), 'evals/logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const outPath = path.join(logsDir, `run-${runId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(`\n[eval-scorer] Run summary written to ${outPath}`);
  }
}
