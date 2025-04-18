import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';

export class Config {
  private apiKey: string;
  private model: string;
  private targetDir: string;

  constructor(apiKey: string, model: string, targetDir: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.targetDir = targetDir;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getModel(): string {
    return this.model;
  }

  getTargetDir(): string {
    return this.targetDir;
  }
}

export function loadConfig(): Config {
  loadEnvironment();
  const argv = parseArguments();
  return new Config(
    process.env.GEMINI_API_KEY || '',
    argv.model || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_MODEL,
    argv.target_dir || process.cwd(),
  );
}

export const globalConfig = loadConfig(); // TODO(jbd): Remove global state.

interface CliArgs {
  target_dir: string | undefined;
  model: string | undefined;
  // Add other expected args here if needed
  // e.g., verbose?: boolean;
}

function parseArguments(): CliArgs {
  const argv = yargs(hideBin(process.argv))
    .option('target_dir', {
      alias: 'd',
      type: 'string',
      description:
        'The target directory for Gemini operations. Defaults to the current working directory.',
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      description: `The Gemini model to use. Defaults to ${DEFAULT_GEMINI_MODEL}.`,
      default: DEFAULT_GEMINI_MODEL,
    })
    .help()
    .alias('h', 'help')
    .strict().argv; // Keep strict mode to error on unknown options

  // Cast to the interface to ensure the structure aligns with expectations
  // Use `unknown` first for safer casting if types might not perfectly match
  return argv as unknown as CliArgs;
}

function findEnvFile(startDir: string): string | null {
  // Start search from the provided directory (e.g., current working directory)
  let currentDir = path.resolve(startDir); // Ensure absolute path
  while (true) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function loadEnvironment(): void {
  // Start searching from the current working directory by default
  const envFilePath = findEnvFile(process.cwd());
  if (!envFilePath) {
    return;
  }
  dotenv.config({ path: envFilePath });
}
