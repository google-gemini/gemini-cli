/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import toml from '@iarna/toml';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';

type DiagramType = 'flowchart' | 'sequence' | 'class' | 'erd';

interface GitCommit {
  hash: string;
  parents: string[];
  subject: string;
}

const execFileAsync = promisify(execFile);
const SUPPORTED_DEPENDENCY_FILES = [
  'package.json',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'pyproject.toml',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getWorkspaceRoot(context: CommandContext): string {
  return context.services.agentContext?.config.getTargetDir() ?? process.cwd();
}

function buildPromptForDiagramType(
  diagramType: DiagramType,
  request: string,
): string {
  const requestLower = request.toLowerCase();
  const layoutHintInstruction =
    diagramType === 'flowchart'
      ? requestLower.includes('stack')
        ? [
            'Because the request is about a stack, make it vertical:',
            '- use `flowchart TB` (or `graph TB`)',
            '- include a Mermaid comment line `%% layout: stack` near the top',
          ].join('\n')
        : requestLower.includes('queue')
          ? [
              'Because the request is about a queue, make it horizontal:',
              '- use `flowchart LR` (or `graph LR`)',
              '- include a Mermaid comment line `%% layout: queue` near the top',
            ].join('\n')
          : undefined
      : undefined;

  return [
    `Create a Mermaid ${diagramType} diagram for the following request:`,
    request,
    '',
    ...(layoutHintInstruction ? [layoutHintInstruction, ''] : []),
    'Then call the "visualize" tool exactly once with:',
    '- mermaid: the complete Mermaid source code',
    `- diagramType: "${diagramType}"`,
    '',
    'After the tool result, give a concise explanation of the diagram.',
  ].join('\n');
}

function escapeMermaidLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function collectDependencyKeys(record: unknown): string[] {
  if (!isRecord(record)) {
    return [];
  }
  return Object.keys(record);
}

function normalizeDependencyName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const strippedExtras = trimmed.split(';')[0].trim();
  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)/.exec(strippedExtras);
  return match?.[1];
}

function parsePackageJsonDependencies(content: string): string[] {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    return [];
  }

  return [
    ...collectDependencyKeys(parsed['dependencies']),
    ...collectDependencyKeys(parsed['devDependencies']),
    ...collectDependencyKeys(parsed['peerDependencies']),
    ...collectDependencyKeys(parsed['optionalDependencies']),
  ];
}

function parseRequirementsDependencies(content: string): string[] {
  const dependencies: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('-r ') ||
      trimmed.startsWith('--')
    ) {
      continue;
    }

    const normalized = normalizeDependencyName(trimmed);
    if (normalized) {
      dependencies.push(normalized);
    }
  }

  return dependencies;
}

function parseCargoDependencies(content: string): string[] {
  const parsed = toml.parse(content) as unknown;
  if (!isRecord(parsed)) {
    return [];
  }

  return [
    ...collectDependencyKeys(parsed['dependencies']),
    ...collectDependencyKeys(parsed['dev-dependencies']),
    ...collectDependencyKeys(parsed['build-dependencies']),
    ...collectDependencyKeys(
      isRecord(parsed['workspace'])
        ? parsed['workspace']['dependencies']
        : undefined,
    ),
  ];
}

function parseGoModDependencies(content: string): string[] {
  const dependencies: string[] = [];
  let inRequireBlock = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) {
      continue;
    }

    if (trimmed === 'require (') {
      inRequireBlock = true;
      continue;
    }

    if (inRequireBlock && trimmed === ')') {
      inRequireBlock = false;
      continue;
    }

    if (inRequireBlock) {
      const dep = trimmed.split(/\s+/)[0];
      if (dep) {
        dependencies.push(dep);
      }
      continue;
    }

    if (trimmed.startsWith('require ')) {
      const dep = trimmed.replace(/^require\s+/, '').split(/\s+/)[0];
      if (dep) {
        dependencies.push(dep);
      }
    }
  }

  return dependencies;
}

function parsePomDependencies(content: string): string[] {
  const dependencies: string[] = [];
  const dependencyBlocks =
    content.match(/<dependency>[\s\S]*?<\/dependency>/g) ?? [];

  for (const block of dependencyBlocks) {
    const artifactIdMatch = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(
      block,
    );
    const groupIdMatch = /<groupId>\s*([^<\s]+)\s*<\/groupId>/.exec(block);

    if (artifactIdMatch) {
      const artifactId = artifactIdMatch[1].trim();
      const groupId = groupIdMatch?.[1]?.trim();
      dependencies.push(groupId ? `${groupId}:${artifactId}` : artifactId);
    }
  }

  return dependencies;
}

function parsePyProjectDependencies(content: string): string[] {
  const parsed = toml.parse(content) as unknown;
  if (!isRecord(parsed)) {
    return [];
  }

  const dependencies: string[] = [];

  const project = parsed['project'];
  if (isRecord(project)) {
    const projectDeps = project['dependencies'];
    if (Array.isArray(projectDeps)) {
      for (const dep of projectDeps) {
        if (typeof dep === 'string') {
          const normalized = normalizeDependencyName(dep);
          if (normalized) {
            dependencies.push(normalized);
          }
        }
      }
    }

    const optional = project['optional-dependencies'];
    if (isRecord(optional)) {
      for (const value of Object.values(optional)) {
        if (!Array.isArray(value)) {
          continue;
        }
        for (const dep of value) {
          if (typeof dep === 'string') {
            const normalized = normalizeDependencyName(dep);
            if (normalized) {
              dependencies.push(normalized);
            }
          }
        }
      }
    }
  }

  const tool = parsed['tool'];
  if (isRecord(tool)) {
    const poetry = tool['poetry'];
    if (isRecord(poetry)) {
      dependencies.push(
        ...collectDependencyKeys(poetry['dependencies']).filter(
          (dep) => dep !== 'python',
        ),
      );
      dependencies.push(
        ...collectDependencyKeys(poetry['dev-dependencies']).filter(
          (dep) => dep !== 'python',
        ),
      );
    }
  }

  return dependencies;
}

async function detectDependencies(workspaceRoot: string): Promise<string[]> {
  const filesToParse = new Map<string, string>();

  await Promise.all(
    SUPPORTED_DEPENDENCY_FILES.map(async (fileName) => {
      const filePath = path.join(workspaceRoot, fileName);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        filesToParse.set(fileName, content);
      } catch {
        // Ignore missing/inaccessible files. We only parse what we can read.
      }
    }),
  );

  const deps = new Set<string>();

  for (const [fileName, content] of filesToParse) {
    try {
      let parsedDependencies: string[] = [];

      if (fileName === 'package.json') {
        parsedDependencies = parsePackageJsonDependencies(content);
      } else if (fileName === 'requirements.txt') {
        parsedDependencies = parseRequirementsDependencies(content);
      } else if (fileName === 'Cargo.toml') {
        parsedDependencies = parseCargoDependencies(content);
      } else if (fileName === 'go.mod') {
        parsedDependencies = parseGoModDependencies(content);
      } else if (fileName === 'pom.xml') {
        parsedDependencies = parsePomDependencies(content);
      } else if (fileName === 'pyproject.toml') {
        parsedDependencies = parsePyProjectDependencies(content);
      }

      for (const dep of parsedDependencies) {
        const normalized = dep.trim();
        if (normalized) {
          deps.add(normalized);
        }
      }
    } catch {
      // Ignore parser failures from one ecosystem file and keep parsing others.
    }
  }

  return Array.from(deps).sort((a, b) => a.localeCompare(b));
}

function buildDependenciesMermaid(dependencies: string[]): string {
  const maxDependencies = dependencies.slice(0, 120);
  const lines: string[] = ['flowchart LR', '  ROOT["Project Dependencies"]'];

  maxDependencies.forEach((dependency, index) => {
    const nodeId = `D${index + 1}`;
    lines.push(`  ROOT --> ${nodeId}["${escapeMermaidLabel(dependency)}"]`);
  });

  return lines.join('\n');
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

function parseGitCommits(logOutput: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const lines = logOutput.split('\n').map((line) => line.trim());

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const [hash, parentsRaw, subject] = line.split('|', 3);
    if (!hash || subject === undefined) {
      continue;
    }

    commits.push({
      hash,
      parents: parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [],
      subject,
    });
  }

  return commits;
}

function buildGitMermaid(commits: GitCommit[]): string {
  const lines: string[] = ['flowchart TB'];

  const nodeByHash = new Map<string, string>();
  commits.forEach((commit, index) => {
    const nodeId = `C${index + 1}`;
    nodeByHash.set(commit.hash, nodeId);
    const label = `${commit.hash.slice(0, 7)} ${truncateText(commit.subject, 48)}`;
    lines.push(`  ${nodeId}["${escapeMermaidLabel(label)}"]`);
  });

  for (const commit of commits) {
    const from = nodeByHash.get(commit.hash);
    if (!from) {
      continue;
    }
    for (const parentHash of commit.parents) {
      const to = nodeByHash.get(parentHash);
      if (to) {
        lines.push(`  ${from} --> ${to}`);
      }
    }
  }

  return lines.join('\n');
}

const diagramPromptSubcommand = (diagramType: DiagramType): SlashCommand => ({
  name: diagramType,
  description: `Generate a ${diagramType} Mermaid diagram and render it inline.`,
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (_context: CommandContext, args: string) => {
    const request = args.trim();
    if (!request) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content: `Please provide what to visualize. Usage: /visualize ${diagramType} <prompt>`,
      };
    }

    return {
      type: 'submit_prompt' as const,
      content: buildPromptForDiagramType(diagramType, request),
    };
  },
});

const depsSubcommand: SlashCommand = {
  name: 'deps',
  description:
    'Auto-detect dependency manifests and render a dependency graph diagram.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const workspaceRoot = getWorkspaceRoot(context);
    const dependencies = await detectDependencies(workspaceRoot);

    if (dependencies.length === 0) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content:
          'No supported dependency files found (package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, pyproject.toml), or no dependencies could be parsed.',
      };
    }

    return {
      type: 'tool' as const,
      toolName: 'visualize',
      toolArgs: {
        mermaid: buildDependenciesMermaid(dependencies),
        diagramType: 'flowchart',
        title: `Dependency Graph (${dependencies.length} dependencies)`,
      },
    };
  },
};

const gitSubcommand: SlashCommand = {
  name: 'git',
  description:
    'Run git log and render recent commit history as a graph diagram.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const workspaceRoot = getWorkspaceRoot(context);

    try {
      // Intentionally run with --graph for parity with the slash command contract.
      await execFileAsync('git', ['log', '--graph', '--oneline', '-n', '20'], {
        cwd: workspaceRoot,
      });

      const { stdout } = await execFileAsync(
        'git',
        ['log', '--pretty=format:%H|%P|%s', '-n', '20'],
        { cwd: workspaceRoot },
      );

      const commits = parseGitCommits(stdout);
      if (commits.length === 0) {
        return {
          type: 'message' as const,
          messageType: 'error' as const,
          content: 'No commits found to visualize.',
        };
      }

      return {
        type: 'tool' as const,
        toolName: 'visualize',
        toolArgs: {
          mermaid: buildGitMermaid(commits),
          diagramType: 'flowchart',
          title: `Git History (${commits.length} commits)`,
        },
      };
    } catch {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content:
          'Unable to read git history. Make sure you are in a git repository and git is installed.',
      };
    }
  },
};

const flowchartSubcommand = diagramPromptSubcommand('flowchart');
const sequenceSubcommand = diagramPromptSubcommand('sequence');
const classSubcommand = diagramPromptSubcommand('class');
const erdSubcommand = diagramPromptSubcommand('erd');

const subcommandMap: Record<string, SlashCommand> = {
  flowchart: flowchartSubcommand,
  sequence: sequenceSubcommand,
  class: classSubcommand,
  erd: erdSubcommand,
  deps: depsSubcommand,
  git: gitSubcommand,
};

export const visualizeCommand: SlashCommand = {
  name: 'visualize',
  description:
    'Generate and render diagrams. Subcommands: flowchart, sequence, class, erd, deps, git.',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    flowchartSubcommand,
    sequenceSubcommand,
    classSubcommand,
    erdSubcommand,
    depsSubcommand,
    gitSubcommand,
  ],
  action: async (context: CommandContext, args: string) => {
    const trimmed = args.trim();
    if (!trimmed) {
      return {
        type: 'message' as const,
        messageType: 'info' as const,
        content:
          'Usage: /visualize <flowchart|sequence|class|erd|deps|git> <prompt>',
      };
    }

    const [subcommandName, ...rest] = trimmed.split(/\s+/);
    const subcommand = subcommandMap[subcommandName];

    if (!subcommand?.action) {
      // Backward-compatible behavior: treat `/visualize <prompt>` as flowchart intent.
      return flowchartSubcommand.action?.(context, trimmed);
    }

    return subcommand.action(context, rest.join(' '));
  },
};
