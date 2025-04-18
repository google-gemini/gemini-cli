import { CliArgs } from './args.js'; // Assuming CliArgs contains the needed fields

interface GlobalConfig {
  model: string;
  // Add other global config values here if needed
  // e.g., targetDir?: string;
}

let config: GlobalConfig | null = null;

/**
 * Initializes the global configuration. Should only be called once at application startup.
 * @param args The parsed command-line arguments.
 */
export function initializeConfig(args: Pick<CliArgs, 'model'>): void {
  if (config) {
    console.warn('Global configuration already initialized.');
    return;
  }
  if (!args.model) {
    // This shouldn't happen if default is set correctly in args.ts
    throw new Error('Model not provided during config initialization.');
  }
  config = {
    model: args.model,
    // Initialize other config values from args here
  };
}

/**
 * Retrieves the globally stored configuration.
 * Throws an error if the configuration has not been initialized.
 * @returns The global configuration object.
 */
export function getConfig(): GlobalConfig {
  if (!config) {
    throw new Error(
      'Global configuration accessed before initialization. Call initializeConfig() first.',
    );
  }
  return config;
}

/**
 * Helper function to get the configured Gemini model name.
 * @returns The model name string.
 */
export function getModel(): string {
  return getConfig().model;
} 