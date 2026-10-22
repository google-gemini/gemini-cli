/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { EvalAnalysisDiagnostic, EvalPolicy } from './eval-analysis.js';
import type { InventoryResult } from './eval-inventory.js';
import { type ToolCategory, type ToolRegistry } from './tool-registry.js';

const POLICY_ORDER: EvalPolicy[] = [
  'ALWAYS_PASSES',
  'USUALLY_PASSES',
  'USUALLY_FAILS',
  'unknown',
];

const CATEGORY_ORDER: ToolCategory[] = [
  'file-system',
  'shell',
  'web',
  'planning',
  'user-interaction',
  'skills',
  'task-tracker',
  'agent',
  'mcp',
];

export type PolicyDistribution = Partial<Record<EvalPolicy, number>>;

export interface ToolEvalFileEntry {
  relativePath: string;
  caseCount: number;
  policyDistribution: PolicyDistribution;
}

export interface CoveredToolEntry {
  name: string;
  category: ToolCategory;
  totalCaseCount: number;
  files: ToolEvalFileEntry[];
  policyDistribution: PolicyDistribution;
}

export interface UncoveredToolEntry {
  name: string;
  category: ToolCategory;
}

export interface CoverageResult {
  totalTools: number;
  coveredCount: number;
  uncoveredCount: number;
  coveragePercent: number;
  covered: CoveredToolEntry[];
  uncovered: UncoveredToolEntry[];
  diagnostics: readonly EvalAnalysisDiagnostic[];
}

/**
 * Computes eval coverage by cross-referencing the inventory's tool references
 * against the tool registry.
 */
export function computeCoverage(
  inventory: InventoryResult,
  registry: ToolRegistry,
): CoverageResult {
  const toolFileMap = new Map<
    string,
    Map<string, { caseCount: number; policyDist: PolicyDistribution }>
  >();

  for (const toolName of registry.tools.keys()) {
    toolFileMap.set(toolName, new Map());
  }

  for (const evalCase of inventory.cases) {
    for (const toolName of evalCase.toolReferences) {
      const canonicalName = registry.aliasLookup.get(toolName) ?? toolName;
      if (!registry.tools.has(canonicalName)) {
        continue;
      }

      let fileMap = toolFileMap.get(canonicalName);
      if (!fileMap) {
        fileMap = new Map();
        toolFileMap.set(canonicalName, fileMap);
      }

      const existingEntry = fileMap.get(evalCase.relativePath);
      if (existingEntry) {
        existingEntry.caseCount += 1;
        existingEntry.policyDist[evalCase.policy] =
          (existingEntry.policyDist[evalCase.policy] ?? 0) + 1;
      } else {
        const policyDist: PolicyDistribution = {};
        policyDist[evalCase.policy] = 1;
        fileMap.set(evalCase.relativePath, { caseCount: 1, policyDist });
      }
    }
  }

  const covered: CoveredToolEntry[] = [];
  const uncovered: UncoveredToolEntry[] = [];

  for (const [toolName, fileMap] of toolFileMap) {
    const entry = registry.tools.get(toolName);
    if (!entry) {
      continue;
    }

    if (fileMap.size === 0) {
      uncovered.push({ name: toolName, category: entry.category });
      continue;
    }

    const files: ToolEvalFileEntry[] = [];
    const aggregateDist: PolicyDistribution = {};
    let totalCaseCount = 0;

    for (const relativePath of [...fileMap.keys()].sort()) {
      const fileEntry = fileMap.get(relativePath)!;
      files.push({
        relativePath,
        caseCount: fileEntry.caseCount,
        policyDistribution: fileEntry.policyDist,
      });
      totalCaseCount += fileEntry.caseCount;
      for (const policy of POLICY_ORDER) {
        const count = fileEntry.policyDist[policy];
        if (count !== undefined) {
          aggregateDist[policy] = (aggregateDist[policy] ?? 0) + count;
        }
      }
    }

    covered.push({
      name: toolName,
      category: entry.category,
      totalCaseCount,
      files,
      policyDistribution: aggregateDist,
    });
  }

  covered.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  uncovered.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const totalTools = registry.totalTools;
  const coveredCount = covered.length;
  const uncoveredCount = uncovered.length;
  const coveragePercent =
    totalTools === 0 ? 0 : Math.round((coveredCount / totalTools) * 1000) / 10;

  const filePathLookup = new Map<string, string>();
  for (const f of inventory.files) {
    filePathLookup.set(f.filePath, f.relativePath);
  }

  const resolvedDiagnostics: EvalAnalysisDiagnostic[] =
    inventory.diagnostics.map((d) => {
      if (d.filePath === '<inline>') {
        return d;
      }
      const relative = filePathLookup.get(d.filePath);
      if (relative !== undefined) {
        return { ...d, filePath: relative };
      }
      if (path.isAbsolute(d.filePath) && inventory.repoRoot) {
        return {
          ...d,
          filePath: path
            .relative(inventory.repoRoot, d.filePath)
            .replace(/\\/g, '/'),
        };
      }
      return d;
    });

  return {
    totalTools,
    coveredCount,
    uncoveredCount,
    coveragePercent,
    covered,
    uncovered,
    diagnostics: resolvedDiagnostics,
  };
}

/**
 * Formats a CoverageResult as a human-readable report string.
 */
export function formatCoverageReport(result: CoverageResult): string {
  const lines: string[] = [];

  lines.push('Eval Coverage Report');
  lines.push('════════════════════');
  lines.push('');
  lines.push(
    `${result.coveredCount} / ${result.totalTools} tools covered (${result.coveragePercent}%)`,
  );
  lines.push('');

  lines.push('Covered Tools');
  lines.push('─────────────');

  if (result.covered.length === 0) {
    lines.push('  (none)');
  } else {
    for (const tool of result.covered) {
      const caseLabel = tool.totalCaseCount === 1 ? 'case' : 'cases';
      const fileLabel = tool.files.length === 1 ? 'file' : 'files';
      lines.push(
        `${tool.name} (${tool.totalCaseCount} ${caseLabel} across ${tool.files.length} ${fileLabel})`,
      );
      for (const file of tool.files) {
        const policyParts = formatPolicyDistribution(file.policyDistribution);
        lines.push(`  ${file.relativePath} (${policyParts})`);
      }
    }
  }
  lines.push('');

  lines.push('Uncovered Tools');
  lines.push('───────────────');

  if (result.uncovered.length === 0) {
    lines.push('  (none — full coverage!)');
  } else {
    const byCategory = new Map<string, string[]>();
    for (const tool of result.uncovered) {
      const category = tool.category || 'unknown';
      const group = byCategory.get(category);
      if (group) {
        group.push(tool.name);
      } else {
        byCategory.set(category, [tool.name]);
      }
    }

    const maxCatLen = Math.max(
      ...CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => c.length),
      ...[...byCategory.keys()]
        .filter((c) => !CATEGORY_ORDER.includes(c as ToolCategory))
        .map((c) => c.length),
    );

    const renderCategory = (category: string) => {
      const names = byCategory.get(category);
      if (!names || names.length === 0) {
        return;
      }
      const padded = `[${category}]`.padEnd(maxCatLen + 2);
      lines.push(`${padded}  ${names.join(', ')}`);
    };

    for (const category of CATEGORY_ORDER) {
      renderCategory(category);
    }
    for (const category of byCategory.keys()) {
      if (!CATEGORY_ORDER.includes(category as ToolCategory)) {
        renderCategory(category);
      }
    }
  }
  lines.push('');

  if (result.diagnostics.length > 0) {
    lines.push(`Diagnostics (${result.diagnostics.length})`);
    lines.push('────────────────');
    for (const diagnostic of result.diagnostics) {
      lines.push(
        `⚠ ${diagnostic.filePath}:${diagnostic.location.line}:${diagnostic.location.column} — ${diagnostic.message}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatPolicyDistribution(dist: PolicyDistribution): string {
  const parts: string[] = [];
  for (const policy of POLICY_ORDER) {
    const count = dist[policy];
    if (count !== undefined && count > 0) {
      parts.push(`${count} ${policy}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : '0 cases';
}
