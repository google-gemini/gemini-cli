import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';

export interface CliArgs {
  target_dir: string | undefined;
  model: string | undefined;
  _: (string | number)[]; // Captures positional arguments
  // Add other expected args here if needed
  // e.g., verbose?: boolean;
}

export async function parseArguments(): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
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
    .strict() // Keep strict mode to error on unknown options
    .parseAsync();

  // Handle warnings for extra arguments here
  if (argv._ && argv._.length > 0) {
    console.warn(
      `Warning: Additional arguments provided (${argv._.join(', ')}), but will be ignored.`,
    );
  }

  // Cast to the interface to ensure the structure aligns with expectations
  // Use `unknown` first for safer casting if types might not perfectly match
  return argv as unknown as CliArgs;
}
