/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type SessionEngine, ProviderRegistry, DependencyAuditor, ComplexityAnalyzer } from '@zoe/core';

export interface CommandContext {
  session: SessionEngine;
  exit: () => void;
  registry?: ProviderRegistry;
}

export type CommandHandler = (args: string[], ctx: CommandContext) => Promise<string | void> | string | void;

export class CommandRegistry {
  private commands = new Map<string, { description: string; handler: CommandHandler }>();
  private providerRegistry: ProviderRegistry;

  constructor(providerRegistry?: ProviderRegistry) {
    this.providerRegistry = providerRegistry ?? new ProviderRegistry();

    this.register('help', 'Show available commands', () => {
      const lines = ['Available commands:'];
      for (const [name, meta] of this.commands.entries()) {
        lines.push(`  /${name.padEnd(9)} - ${meta.description}`);
      }
      return lines.join('\n');
    });

    this.register('clear', 'Clear terminal screen history', (_args, ctx) => {
      ctx.session.clearHistory();
    });

    this.register('model', 'Inspect or switch active model (e.g. /model llama3.2)', (args, ctx) => {
      const modelArg = args[0]?.trim();
      if (!modelArg) {
        return `Active provider: ${ctx.session.getProvider().name}\nActive model: ${ctx.session.getModel()}`;
      }

      const registry = ctx.registry ?? this.providerRegistry;
      const resolved = registry.resolve(modelArg);
      ctx.session.setProvider(resolved.provider, resolved.model);

      return `Switched model to ${resolved.model} (${resolved.provider.name}).`;
    });

    // Mentoring Commands
    this.register('learn', 'Socratic conceptual learning on a topic (e.g. /learn event loops)', async (args, ctx) => {
      const topic = args.join(' ').trim();
      if (!topic) {
        return 'Usage: /learn <topic or concept>';
      }
      const policy = ctx.session.mentor.getPolicy('learn');
      await ctx.session.send(`Teach me about: ${topic}`, policy);
      return;
    });

    this.register('solve', 'Architect and solve an engineering problem (e.g. /solve rate limiter)', async (args, ctx) => {
      const problem = args.join(' ').trim();
      if (!problem) {
        return 'Usage: /solve <problem or feature>';
      }
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
        return `Unknown policy: ${mode}. Available policies: learn, solve, debug, review, explain, hint, ponytail`;
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
