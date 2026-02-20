/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Configuration management and interactive setup wizard for Gemini Cowork.
 *
 * Config resolution order (highest → lowest priority):
 *   1. Environment variables  (GEMINI_API_KEY, COWORK_MODEL, …)
 *   2. Project-level          <projectRoot>/.coworkrc
 *   3. User-level             ~/.config/gemini-cowork/config.json
 *   4. Built-in defaults
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafetyPolicy {
  /**
   * Directories the agent is allowed to read/write.
   * Defaults to the project root only.
   * Use `['*']` to allow unrestricted access (not recommended).
   */
  allowedDirs: string[];
  /**
   * Shell command patterns to block outright (applied before human-in-the-loop
   * confirmation so the user never sees dangerous prompts).
   * Each entry is a regex string matched case-insensitively.
   */
  deniedCommandPatterns: string[];
  /**
   * Maximum file size (bytes) the agent is allowed to write in one call.
   * Defaults to 512 KiB.
   */
  maxWriteBytes: number;
  /**
   * When `true`, the agent may not write files outside the project root even
   * if those paths appear in `allowedDirs`.
   */
  enforceProjectRoot: boolean;
}

export interface CoworkConfig {
  /** Gemini API key.  Falls back to GEMINI_API_KEY env var. */
  apiKey?: string;
  /**
   * Default Gemini model for text generation.
   * @default 'gemini-2.0-flash'
   */
  model: string;
  /**
   * Default Gemini model for vision (screenshot_and_analyze).
   * @default 'gemini-2.0-flash'
   */
  visionModel: string;
  /**
   * Default Gemini model for embeddings (memory store).
   * @default 'text-embedding-004'
   */
  embeddingModel: string;
  /**
   * Maximum ReAct loop iterations when not overridden via CLI.
   * @default 10
   */
  maxIterations: number;
  /** When `true`, enable trace output by default. */
  trace: boolean;
  /** When `true`, enable persistent memory by default. */
  memory: boolean;
  /**
   * When `true`, all file writes and shell commands are shown as diffs /
   * command previews without being executed.
   */
  dryRun: boolean;
  /** Safety policy applied to every agent session. */
  safety: SafetyPolicy;
  /** Raw project-level rules injected into the agent system prompt. */
  projectRules?: string;
  /** Directory where trace files, memory, and analysis artefacts are stored. */
  coworkDir: string;
}

const DEFAULT_CONFIG: CoworkConfig = {
  model: 'gemini-2.0-flash',
  visionModel: 'gemini-2.0-flash',
  embeddingModel: 'text-embedding-004',
  maxIterations: 10,
  trace: false,
  memory: false,
  dryRun: false,
  safety: {
    allowedDirs: [],          // populated from projectRoot at load time
    deniedCommandPatterns: [
      'rm\\s+-rf\\s+/',       // rm -rf /
      'dd\\s+if=',            // dd if= (disk wipe)
      ':\\s*\\(\\)\\s*\\{',  // fork bomb: :(){
      'mkfs',                 // format disk
      'shutdown',
      'reboot',
      'curl.*\\|.*sh',        // pipe-to-shell
      'wget.*\\|.*sh',
    ],
    maxWriteBytes: 512 * 1024,
    enforceProjectRoot: true,
  },
  coworkDir: '.cowork',
};

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

/**
 * Reads, merges, and saves `.coworkrc` configuration files.
 *
 * ```ts
 * const mgr = new ConfigManager(process.cwd());
 * const cfg = await mgr.load();
 * console.log(cfg.model); // 'gemini-2.0-flash'
 * ```
 */
export class ConfigManager {
  private readonly projectRcPath: string;
  private readonly userRcPath: string;
  private _config: CoworkConfig | null = null;

  constructor(private readonly projectRoot: string) {
    this.projectRcPath = join(projectRoot, '.coworkrc');
    this.userRcPath = join(homedir(), '.config', 'gemini-cowork', 'config.json');
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /** Load config, merging user-level → project-level → env vars. */
  async load(): Promise<CoworkConfig> {
    const userLevel = await this.readFile(this.userRcPath);
    const projectLevel = await this.readFile(this.projectRcPath);

    const merged: CoworkConfig = {
      ...DEFAULT_CONFIG,
      ...userLevel,
      ...projectLevel,
      safety: {
        ...DEFAULT_CONFIG.safety,
        ...(userLevel?.safety ?? {}),
        ...(projectLevel?.safety ?? {}),
      },
    };

    // Populate allowedDirs default from projectRoot when not explicitly set.
    if (merged.safety.allowedDirs.length === 0) {
      merged.safety.allowedDirs = [this.projectRoot];
    }

    // Environment variable overrides.
    if (process.env['GEMINI_API_KEY']) {
      merged.apiKey = process.env['GEMINI_API_KEY'];
    }
    if (process.env['COWORK_MODEL']) {
      merged.model = process.env['COWORK_MODEL'];
    }
    if (process.env['COWORK_DRY_RUN'] === '1') {
      merged.dryRun = true;
    }

    this._config = merged;
    return merged;
  }

  /** Return cached config or load it fresh. */
  async get(): Promise<CoworkConfig> {
    return this._config ?? this.load();
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /** Persist the given config fragment to the project-level `.coworkrc`. */
  async save(partial: Partial<CoworkConfig>): Promise<void> {
    const existing = await this.readFile(this.projectRcPath);
    const updated = { ...existing, ...partial };
    await writeFile(this.projectRcPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  }

  // ── Init wizard ───────────────────────────────────────────────────────────

  /**
   * Interactive setup wizard.
   *
   * Guides the user through setting:
   *   - Gemini API key
   *   - Default model
   *   - Safety policy preferences
   *   - Dry-run mode
   *   - Project rules
   *
   * Uses dynamic `inquirer` import so the heavy ESM dependency is only loaded
   * when the `init` subcommand is explicitly invoked.
   */
  async runInitWizard(): Promise<CoworkConfig> {
    const { default: inquirer } = await import('inquirer').catch(() => {
      throw new Error(
        'The "init" wizard requires inquirer.\n' +
          'Install it with: npm install -D inquirer@^9',
      );
    });

    console.log(`\n${chalk.cyan.bold('Gemini Cowork — Setup Wizard')}\n`);
    console.log(
      chalk.dim(
        `Config will be saved to: ${chalk.white(this.projectRcPath)}\n`,
      ),
    );

    const current = await this.load();

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Gemini API key (leave blank to use GEMINI_API_KEY env var):',
        default: current.apiKey ? '*** (already set)' : '',
      },
      {
        type: 'list',
        name: 'model',
        message: 'Default text model:',
        choices: [
          'gemini-2.0-flash',
          'gemini-2.0-pro',
          'gemini-1.5-flash',
          'gemini-1.5-pro',
        ],
        default: current.model,
      },
      {
        type: 'number',
        name: 'maxIterations',
        message: 'Default max ReAct iterations:',
        default: current.maxIterations,
        validate: (n: number) => (n > 0 && n <= 50) || 'Must be 1–50',
      },
      {
        type: 'confirm',
        name: 'trace',
        message: 'Enable trace mode by default (writes .cowork/traces/)?',
        default: current.trace,
      },
      {
        type: 'confirm',
        name: 'memory',
        message: 'Enable persistent memory by default (.cowork/memory.json)?',
        default: current.memory,
      },
      {
        type: 'confirm',
        name: 'dryRun',
        message: 'Enable dry-run mode by default (preview changes without applying)?',
        default: current.dryRun,
      },
      {
        type: 'input',
        name: 'projectRules',
        message:
          'Project-specific rules for the agent (e.g. "Always use ESM imports"):\n  ',
        default: current.projectRules ?? '',
      },
    ]);

    const patch: Partial<CoworkConfig> = {
      model: answers.model as string,
      maxIterations: answers.maxIterations as number,
      trace: answers.trace as boolean,
      memory: answers.memory as boolean,
      dryRun: answers.dryRun as boolean,
    };

    if (
      typeof answers.apiKey === 'string' &&
      answers.apiKey.trim() &&
      !answers.apiKey.includes('***')
    ) {
      patch.apiKey = (answers.apiKey as string).trim();
    }

    if (typeof answers.projectRules === 'string' && answers.projectRules.trim()) {
      patch.projectRules = (answers.projectRules as string).trim();
    }

    await this.save(patch);

    console.log(`\n${chalk.green('✓')} Config saved to ${chalk.white(this.projectRcPath)}`);
    console.log(
      chalk.dim(
        'Tip: commit .coworkrc to share project settings with your team ' +
          '(but NOT if it contains your API key).\n',
      ),
    );

    return this.load();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async readFile(path: string): Promise<Partial<CoworkConfig> | null> {
    if (!existsSync(path)) return null;
    try {
      const raw = await readFile(path, 'utf-8');
      return JSON.parse(raw) as Partial<CoworkConfig>;
    } catch {
      return null;
    }
  }

  /** Ensure the .cowork directory exists in the project. */
  async ensureCoworkDir(): Promise<string> {
    const dir = join(this.projectRoot, '.cowork', 'traces');
    await mkdir(dir, { recursive: true });
    return dirname(dir);
  }

  /** Pretty-print the resolved config to stdout. */
  async print(): Promise<void> {
    const cfg = await this.get();
    console.log(chalk.cyan.bold('\nGemini Cowork — Resolved Configuration\n'));

    const display = { ...cfg, apiKey: cfg.apiKey ? '*** (set)' : '(not set — use GEMINI_API_KEY)' };

    for (const [k, v] of Object.entries(display)) {
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
      console.log(`  ${chalk.dim(k.padEnd(18))} ${chalk.white(val)}`);
    }
    console.log();
  }
}
