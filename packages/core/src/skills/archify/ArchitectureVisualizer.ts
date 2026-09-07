/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectInfo } from '../../tools/project/ProjectDetector.js';
import { AsciiBox } from './AsciiBox.js';
import { FlowVisualizer } from './FlowVisualizer.js';

export interface ComponentLayer {
  name: string;
  description: string;
  modules: string[];
}

export class ArchitectureVisualizer {
  public static renderWorkspaceTopology(project: ProjectInfo): string {
    const lines: string[] = [];

    // Header box
    const header = AsciiBox.create(
      [
        `Target: ${project.displayPath}`,
        `Stack:  ${project.badges.join(' • ')}`,
      ],
      { title: 'SYSTEM ARCHITECTURE TOPOLOGY', style: 'double', minWidth: 60 }
    );
    lines.push(header);
    lines.push('');

    // High-level layer flow
    lines.push('### High-Level Architecture Flow:');
    const flow = FlowVisualizer.renderPipeline(['CLI / TUI', 'SessionEngine', 'AgentHarness', 'Model Provider']);
    lines.push(flow);
    lines.push('');

    // Check if monorepo with packages/
    const packagesDir = path.join(project.workspacePath, 'packages');
    if (fs.existsSync(packagesDir) && fs.statSync(packagesDir).isDirectory()) {
      lines.push('### Monorepo Package Hierarchy:');
      const pkgs: { name: string; details?: string }[] = [];
      try {
        const entries = fs.readdirSync(packagesDir);
        for (const entry of entries) {
          const pkgJsonPath = path.join(packagesDir, entry, 'package.json');
          let desc = 'Package';
          if (fs.existsSync(pkgJsonPath)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
              desc = parsed.description || parsed.name || 'Package';
            } catch (_e) {
              // Ignore json error
            }
          }
          pkgs.push({ name: `packages/${entry}`, details: desc });
        }
      } catch (_e) {
        // Ignore read error
      }

      if (pkgs.length > 0) {
        lines.push(AsciiBox.tree(project.displayPath, pkgs));
        lines.push('');
      }
    }

    // Layered component breakdown
    lines.push('### Subsystem Layers:');
    const layers: ComponentLayer[] = [
      {
        name: 'Interaction Layer',
        description: 'Command line interface, Ink TUI, slash command registry',
        modules: ['packages/cli/src/ui', 'packages/cli/src/commands'],
      },
      {
        name: 'Orchestration Layer',
        description: 'Session state management, event bus, agent execution harness',
        modules: ['packages/core/src/session', 'packages/core/src/events', 'packages/core/src/agent'],
      },
      {
        name: 'Socratic Mentoring & Skills',
        description: 'Intent classification, behavioral policies, Ponytail minimalism, Archify visuals',
        modules: ['packages/core/src/mentor', 'packages/core/src/skills'],
      },
      {
        name: 'Security & Capability Matrix',
        description: 'Capability enforcement, sandboxed read-only tools, project detector',
        modules: ['packages/core/src/permissions', 'packages/core/src/tools'],
      },
      {
        name: 'Model Provider Layer',
        description: 'Vendor-agnostic LLM abstraction, streaming Ollama provider, placeholder provider',
        modules: ['packages/core/src/providers'],
      },
    ];

    for (const layer of layers) {
      const box = AsciiBox.create(
        [
          layer.description,
          `Modules: ${layer.modules.join(', ')}`,
        ],
        { title: layer.name, style: 'rounded', minWidth: 60 }
      );
      lines.push(box);
    }

    return lines.join('\n');
  }

  public static renderCustomArchitecture(
    title: string,
    components: { name: string; role: string }[],
    connections?: { from: string; to: string; label?: string }[]
  ): string {
    const lines: string[] = [];
    lines.push(AsciiBox.create([`Architecture: ${title}`], { title: 'ARCHIFY DIAGRAM', style: 'double' }));
    lines.push('');

    const compBoxes = components.map((c) =>
      AsciiBox.create([c.role], { title: c.name, style: 'rounded', minWidth: 20 })
    );

    lines.push('### Components:');
    for (const box of compBoxes) {
      lines.push(box);
    }

    if (connections && connections.length > 0) {
      lines.push('');
      lines.push('### Data Flow & Relationships:');
      for (const conn of connections) {
        const arrow = conn.label ? `──[ ${conn.label} ]──►` : '────────►';
        lines.push(`  ${conn.from.padEnd(16)} ${arrow} ${conn.to}`);
      }
    }

    return lines.join('\n');
  }
}
