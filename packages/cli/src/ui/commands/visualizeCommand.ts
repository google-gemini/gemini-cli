/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDiagramPrompt(diagramType: string, description: string): string {
  return (
    `Generate a Mermaid ${diagramType} diagram for the following: ${description}\n\n` +
    `Requirements:\n` +
    `1. Produce valid Mermaid syntax (${getMermaidKeyword(diagramType)}).\n` +
    `2. Keep the diagram focused and readable — avoid excessive nodes.\n` +
    `3. After generating the Mermaid code, call the \`visualize\` tool with:\n` +
    `   - diagram_type: "${diagramType}"\n` +
    `   - content: <your Mermaid definition>\n` +
    `   - title: <a short descriptive title>\n` +
    `Do not explain the diagram in prose — just generate it and call the tool.`
  );
}

function getMermaidKeyword(type: string): string {
  const map: Record<string, string> = {
    flowchart: 'graph TD or graph LR',
    sequence: 'sequenceDiagram',
    class: 'classDiagram',
    erd: 'erDiagram',
  };
  return map[type] ?? type;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readDepsFile(cwd: string): string | null {
  const candidates = [
    path.join(cwd, 'package.json'),
    path.join(cwd, 'requirements.txt'),
    path.join(cwd, 'Cargo.toml'),
    path.join(cwd, 'go.mod'),
    path.join(cwd, 'pom.xml'),
    path.join(cwd, 'pyproject.toml'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, 'utf-8');
      const basename = path.basename(candidate);
      // For package.json, extract only dependency keys to keep the prompt concise
      if (basename === 'package.json') {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isRecord(parsed)) {
            const depNames = [
              ...(isRecord(parsed['dependencies'])
                ? Object.keys(parsed['dependencies'])
                : []),
              ...(isRecord(parsed['devDependencies'])
                ? Object.keys(parsed['devDependencies'])
                : []),
            ];
            return `File: ${basename}\n\nDependencies:\n${depNames.join('\n')}`;
          }
        } catch {
          // Fall through to raw file handling
        }
      }
      return `File: ${basename}\n\n${raw.substring(0, 8000)}`;
    } catch {
      // Try next
    }
  }
  return null;
}

// ─── Sub-command factory ──────────────────────────────────────────────────────

function diagramSubCommand(
  name: string,
  description: string,
  diagramType: string,
): SlashCommand {
  return {
    name,
    description,
    kind: CommandKind.BUILT_IN,
    autoExecute: false,
    action: (context: CommandContext, args: string) => {
      const desc = args.trim() || context.invocation?.args?.trim() || '';
      if (!desc) {
        context.ui.addItem({
          type: MessageType.ERROR,
          text: `Usage: /visualize ${name} <description>\nExample: /visualize ${name} user authentication flow`,
        });
        return;
      }
      const prompt = buildDiagramPrompt(diagramType, desc);
      return { type: 'submit_prompt' as const, content: prompt };
    },
  };
}

// ─── Deps sub-command ─────────────────────────────────────────────────────────

const depsSubCommand: SlashCommand = {
  name: 'deps',
  description:
    'Visualize the dependency graph from package.json, requirements.txt, Cargo.toml, go.mod, or pom.xml',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context: CommandContext) => {
    const cwd = process.cwd();
    const depsContent = readDepsFile(cwd);

    if (!depsContent) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'No dependency file found in the current directory (checked package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, pyproject.toml).',
      });
      return;
    }

    const prompt =
      `Analyze the following dependency file and generate a Mermaid flowchart (graph LR) ` +
      `showing the key dependencies and their relationships. Focus on direct dependencies ` +
      `only — omit version numbers. Keep the diagram readable (max ~15 nodes).\n\n` +
      `${depsContent}\n\n` +
      `After creating the diagram, call the \`visualize\` tool with:\n` +
      `- diagram_type: "flowchart"\n` +
      `- content: <your Mermaid graph LR definition>\n` +
      `- title: "Dependency Graph"\n` +
      `Do not explain — just generate the diagram and call the tool.`;

    return { type: 'submit_prompt' as const, content: prompt };
  },
};

// ─── Git sub-command ─────────────────────────────────────────────────────────

const gitSubCommand: SlashCommand = {
  name: 'git',
  description: 'Visualize the recent git commit history and branch structure',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (_context: CommandContext, args: string) => {
    const extra = args.trim() ? ` Focus on: ${args.trim()}.` : '';
    const prompt =
      `Run \`git log --oneline --graph --decorate --all -20\` and then generate a ` +
      `Mermaid flowchart (graph LR) representing the recent git history, showing branch ` +
      `names, recent commits, and merge points.${extra}\n\n` +
      `After creating the diagram, call the \`visualize\` tool with:\n` +
      `- diagram_type: "flowchart"\n` +
      `- content: <your Mermaid graph LR definition>\n` +
      `- title: "Git History"\n` +
      `Do not explain — just generate the diagram and call the tool.`;

    return { type: 'submit_prompt' as const, content: prompt };
  },
};

// ─── Main command ─────────────────────────────────────────────────────────────

export const visualizeCommand: SlashCommand = {
  name: 'visualize',
  altNames: ['viz', 'diagram'],
  description:
    'Generate and render architecture diagrams inline in the terminal. Usage: /visualize <type> <description>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: (context: CommandContext, args: string) => {
    // If called without a subcommand, show usage hint
    if (!args.trim()) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: [
          'Usage: /visualize <type> <description>',
          '',
          'Types:',
          '  flowchart  — Process flows and dependency graphs',
          '  sequence   — Interaction/timeline diagrams',
          '  class      — OOP class hierarchy diagrams',
          '  erd        — Entity-relationship (database) diagrams',
          '  deps       — Auto-detect and visualize project dependencies',
          '  git        — Visualize recent git history',
          '',
          'Examples:',
          '  /visualize flowchart user login and session management',
          '  /visualize sequence OAuth2 authorization code flow',
          '  /visualize class e-commerce domain model',
          '  /visualize erd blog database schema',
          '  /visualize deps',
          '  /visualize git',
        ].join('\n'),
      });
      return;
    }
  },
  subCommands: [
    diagramSubCommand(
      'flowchart',
      'Generate a flowchart or process-flow diagram',
      'flowchart',
    ),
    diagramSubCommand(
      'sequence',
      'Generate a sequence/interaction timeline diagram',
      'sequence',
    ),
    diagramSubCommand(
      'class',
      'Generate a class hierarchy or OOP structure diagram',
      'class',
    ),
    diagramSubCommand(
      'erd',
      'Generate an entity-relationship (database schema) diagram',
      'erd',
    ),
    depsSubCommand,
    gitSubCommand,
  ],
};
