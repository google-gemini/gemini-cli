import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

export interface CliArgs {
  target_dir: string | undefined;
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
    .help()
    .alias('h', 'help')
    .strict() // Keep strict mode to error on unknown options
    .parseAsync();

  // Handle warnings for extra arguments here
  if (argv._ && argv._.length > 0) {
    console.warn(
      `Warning: Additional arguments provided (${argv._.join(', ')}), but will be ignored.`
    );
  }

  // Cast to the interface to ensure the structure aligns with expectations
  // Use `unknown` first for safer casting if types might not perfectly match
  return argv as unknown as CliArgs;
}