/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type SessionEngine,
  ProviderRegistry,
  DependencyAuditor,
  ComplexityAnalyzer,
  ArchitectureVisualizer,
  ChallengeGenerator,
} from '@zoe/core';

export interface CommandContext {
  session: SessionEngine;
  exit: () => void;
  registry?: ProviderRegistry;
}

export type CommandHandler = (args: string[], ctx: CommandContext) => Promise<string | void> | string | void;

export interface CommandItem {
  name: string;
  description: string;
}

export class CommandRegistry {
  private commands = new Map<string, { description: string; handler: CommandHandler }>();
  private providerRegistry: ProviderRegistry;

  public getCommands(): CommandItem[] {
    const list: CommandItem[] = [];
    for (const [name, meta] of this.commands.entries()) {
      list.push({ name, description: meta.description });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  constructor(providerRegistry?: ProviderRegistry) {
    this.providerRegistry = providerRegistry ?? new ProviderRegistry();

    this.register('help', 'Show available commands', () => {
      const lines = ['Available commands:'];
      for (const [name, meta] of this.commands.entries()) {
        lines.push(`  /${name.padEnd(11)} - ${meta.description}`);
      }
      return lines.join('\n');
    });

    this.register('clear', 'Clear terminal screen history', (_args, ctx) => {
      ctx.session.clearHistory();
    });

    this.register('model', 'Inspect or switch active model (e.g. /model agy:gemini-3.8-flash-high)', (args, ctx) => {
      const modelArg = args[0]?.trim();
      if (!modelArg) {
        return [
          `Active provider: ${ctx.session.getProvider().name}`,
          `Active model: ${ctx.session.getModel()}`,
          '',
          'Available local providers: agy, codex, claude, ollama',
          'Examples:',
          '  /model agy                                   (Antigravity Gemini 3.8 Flash)',
          '  /model agy:claude-sonnet-4-6                 (Antigravity Claude Sonnet 4.6)',
          '  /model codex                                 (OpenAI Codex GPT-6 Astra)',
          '  /model codex:o3                              (OpenAI Codex o3)',
          '  /model claude                                (Claude Code CLI)',
          '  /model llama3.2                              (Local Ollama)',
        ].join('\n');
      }

      const registry = ctx.registry ?? this.providerRegistry;
      const resolved = registry.resolve(modelArg);
      ctx.session.setProvider(resolved.provider, resolved.model);

      return `Switched model to ${resolved.model} (${resolved.provider.name}).`;
    });

    this.register('thoughts', 'Inspect or toggle thought process visibility (/thoughts [on|off])', (args, ctx) => {
      const mode = args[0]?.trim().toLowerCase();
      if (!mode) {
        const current = ctx.session.getShowThoughts() ? 'ENABLED' : 'DISABLED';
        return `Thought process display is currently ${current}.\nUse "/thoughts on" to show or "/thoughts off" to hide.`;
      }
      if (mode === 'on' || mode === 'true' || mode === 'enable' || mode === 'show') {
        ctx.session.setShowThoughts(true);
        return 'Thought process display ENABLED.';
      }
      if (mode === 'off' || mode === 'false' || mode === 'disable' || mode === 'hide') {
        ctx.session.setShowThoughts(false);
        return 'Thought process display DISABLED.';
      }
      return 'Usage: /thoughts [on|off]';
    });

    // Mentoring Commands
    this.register('learn', 'Socratic conceptual learning on a topic (e.g. /learn event loops)', async (args, ctx) => {
      const topic = args.join(' ').trim();
      if (!topic) {
        return 'Usage: /learn <topic or concept>';
      }
      ctx.session.knowledge.addOrTouch(topic, 'general', 'introduced');
      const policy = ctx.session.mentor.getPolicy('learn');
      await ctx.session.send(`Teach me about: ${topic}`, policy);
      return;
    });

    this.register('solve', 'Architect and solve an engineering problem (e.g. /solve rate limiter)', async (args, ctx) => {
      const problem = args.join(' ').trim();
      if (!problem) {
        return 'Usage: /solve <problem or feature>';
      }
      ctx.session.knowledge.addOrTouch(problem, 'architecture', 'practicing');
      const policy = ctx.session.mentor.getPolicy('solve');
      await ctx.session.send(`Guide me through solving: ${problem}`, policy);
      return;
    });

    this.register('debug', 'Methodical root-cause debugging (e.g. /debug connection timeout)', async (args, ctx) => {
      const issue = args.join(' ').trim();
      if (!issue) {
        return 'Usage: /debug <error, exception, or failure description>';
      }
      const policy = ctx.session.mentor.getPolicy('debug');
      await ctx.session.send(`Help me debug this issue: ${issue}`, policy);
      return;
    });

    this.register('review', 'Review code quality, simplicity, and security (e.g. /review src/index.ts)', async (args, ctx) => {
      const target = args.join(' ').trim();
      if (!target) {
        return 'Usage: /review <file, component, or diff>';
      }
      const policy = ctx.session.mentor.getPolicy('review');
      await ctx.session.send(`Review: ${target}`, policy);
      return;
    });

    this.register('explain', 'Deep comprehension of architecture or files (e.g. /explain package.json)', async (args, ctx) => {
      const target = args.join(' ').trim();
      if (!target) {
        return 'Usage: /explain <file, function, or concept>';
      }
      const policy = ctx.session.mentor.getPolicy('explain');
      await ctx.session.send(`Explain: ${target}`, policy);
      return;
    });

    this.register('hint', 'Provide a progressive hint for the active engineering problem', async (_args, ctx) => {
      const policy = ctx.session.mentor.advanceHint();
      await ctx.session.send(`Give me a progressive hint (Level ${policy.getLevel()}).`, policy);
      return;
    });

    const handlePonytail: CommandHandler = async (args, ctx) => {
      const target = args.join(' ').trim();
      const policy = ctx.session.mentor.getPolicy('ponytail');
      if (!target) {
        ctx.session.mentor.setActivePolicy(policy);
        return `Activated Ponytail Minimalist Philosopher mode.\n${policy.description}\nAsk what to delete, simplify, or audit with /ponytail <file>.`;
      }

      let auditContext = '';
      try {
        const fullPath = path.isAbsolute(target)
          ? target
          : path.resolve(ctx.session.getProject().workspacePath, target);

        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const depAuditor = new DependencyAuditor();
          const compAnalyzer = new ComplexityAnalyzer();

          const depFindings = fullPath.endsWith('package.json')
            ? depAuditor.auditPackageJson(content, target)
            : depAuditor.auditCode(content, target);

          const compFindings = compAnalyzer.analyze(content, target);

          const reports: string[] = [];
          if (depFindings.length > 0) {
            reports.push(depAuditor.formatReport(depFindings));
          }
          if (compFindings.length > 0) {
            reports.push(compAnalyzer.formatReport(compFindings));
          }

          if (reports.length > 0) {
            auditContext = `\n\nAutomated Pre-Audit Findings:\n${reports.join('\n\n')}`;
          }
        }
      } catch (_e) {
        // Continue without pre-audit if reading fails
      }

      await ctx.session.send(
        `Apply Ponytail minimalist philosophy: audit, simplify, and find code/dependencies to delete in: ${target}${auditContext}`,
        policy
      );
      return;
    };

    this.register(
      'ponytail',
      'Minimalist audit: delete code, prune bloat & dependencies (e.g. /ponytail src/app.ts)',
      handlePonytail
    );
    this.register('simplify', 'Alias for /ponytail', handlePonytail);

    const handleArchify: CommandHandler = async (args, ctx) => {
      const target = args.join(' ').trim();
      const policy = ctx.session.mentor.getPolicy('archify');

      if (!target) {
        const topology = ArchitectureVisualizer.renderWorkspaceTopology(ctx.session.getProject());
        ctx.session.addSystemMessage(topology);
        ctx.session.mentor.setActivePolicy(policy);
        return;
      }

      await ctx.session.send(
        `Visually diagram and explain the system architecture, component flow, and topologies for: ${target}`,
        policy
      );
      return;
    };

    this.register(
      'archify',
      'Terminal-native visual reasoning: render ASCII topology or component diagrams (e.g. /archify or /archify auth)',
      handleArchify
    );
    this.register('diagram', 'Alias for /archify', handleArchify);

    const handleKnowledge: CommandHandler = (_args, ctx) => {
      return ctx.session.knowledge.getGraph().formatSummary();
    };
    this.register('knowledge', 'Display developer concept mastery and learning progress', handleKnowledge);
    this.register('progress', 'Alias for /knowledge', handleKnowledge);

    this.register('mastered', 'Mark a concept as mastered (e.g. /mastered closures)', (args, ctx) => {
      const concept = args.join(' ').trim();
      if (!concept) {
        return 'Usage: /mastered <concept name>';
      }
      ctx.session.knowledge.advanceMastery(concept, 'mastered');
      return `Marked '${concept}' as Mastered ★. Zoe will avoid redundant hand-holding on this topic.`;
    });

    this.register('practice', 'Mark a concept as in-progress (e.g. /practice rate limiting)', (args, ctx) => {
      const concept = args.join(' ').trim();
      if (!concept) {
        return 'Usage: /practice <concept name>';
      }
      ctx.session.knowledge.advanceMastery(concept, 'practicing');
      return `Marked '${concept}' as In-Progress / Practicing ⚡. Guidance will focus on real-world edge cases.`;
    });

    const handleChallenge: CommandHandler = async (args, ctx) => {
      const topic = args.join(' ').trim();
      const policy = ctx.session.mentor.getPolicy('challenge');

      const challenge = topic
        ? ChallengeGenerator.generateForConcept(topic)
        : ChallengeGenerator.selectForGraph(ctx.session.knowledge.getGraph());

      // Touch in knowledge graph
      ctx.session.knowledge.addOrTouch(challenge.concept, 'general', 'practicing');

      const card = ChallengeGenerator.formatCard(challenge);
      ctx.session.addSystemMessage(card);
      ctx.session.mentor.setActivePolicy(policy);
      return;
    };

    this.register(
      'challenge',
      'Test engineering mastery: solve Socratic design and debugging challenges (e.g. /challenge or /challenge rate limiting)',
      handleChallenge
    );
    this.register('quiz', 'Alias for /challenge', handleChallenge);

    this.register('symbols', 'List or search codebase symbols (classes, functions, interfaces) (e.g. /symbols or /symbols engine)', (args, ctx) => {
      const query = args.join(' ').trim();
      const index = ctx.session.getSymbolIndex();
      if (index.getStats().totalSymbols === 0) {
        index.indexWorkspace();
      }
      const symbols = index.find(query);
      return index.formatTable(symbols);
    });

    this.register('find', 'Find symbol declaration location and signature (e.g. /find SessionEngine)', (args, ctx) => {
      const name = args.join(' ').trim();
      if (!name) {
        return 'Usage: /find <symbol name>';
      }
      const index = ctx.session.getSymbolIndex();
      if (index.getStats().totalSymbols === 0) {
        index.indexWorkspace();
      }
      const matches = index.find(name);
      if (matches.length === 0) {
        return `Symbol '${name}' not found in workspace index.`;
      }
      const lines: string[] = [`Found ${matches.length} declaration${matches.length === 1 ? '' : 's'} for '${name}':`];
      for (const m of matches) {
        lines.push(`- **[${m.kind.toUpperCase()}]** \`${m.name}\` at \`${m.file}:${m.line}\``);
        lines.push(`  Signature: \`${m.signature}\``);
      }
      return lines.join('\n');
    });

    this.register('policy', 'Inspect or set active mentoring policy (e.g. /policy learn)', (args, ctx) => {
      const mode = args[0]?.toLowerCase().trim();
      if (!mode) {
        const current = ctx.session.mentor.getActivePolicy();
        return `Active policy: ${current.name} (${current.intent})\n${current.description}`;
      }
      try {
        const policy = ctx.session.mentor.getPolicy(mode as any);
        ctx.session.mentor.setActivePolicy(policy);
        return `Switched active policy to: ${policy.name} (${policy.intent})`;
      } catch (_err: any) {
        return `Unknown policy: ${mode}. Available policies: learn, solve, debug, review, explain, hint, ponytail, archify, challenge`;
      }
    });

    this.register('exit', 'Exit Zoe', (_args, ctx) => {
      ctx.exit();
    });

    this.register('version', 'Show Zoe version', () => {
      return 'Zoe v0.1.0';
    });
  }

  public register(name: string, description: string, handler: CommandHandler): void {
    this.commands.set(name.toLowerCase(), { description, handler });
  }

  public isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  public async execute(input: string, ctx: CommandContext): Promise<string | void> {
    const trimmed = input.trim().slice(1); // remove leading '/'
    const [cmdName, ...args] = trimmed.split(/\s+/);
    const command = this.commands.get(cmdName.toLowerCase());

    if (!command) {
      return `Unknown command: /${cmdName}. Type /help for available commands.`;
    }

    return await command.handler(args, { ...ctx, registry: this.providerRegistry });
  }
}
