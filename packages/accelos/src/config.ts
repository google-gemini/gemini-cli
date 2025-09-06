import { z } from 'zod';
import * as path from 'path';

export const AccelosConfigSchema = z.object({
  llmProvider: z.enum(['openai', 'google', 'anthropic']).default('google'),
  apiKey: z.string().optional(),
  model: z.string().default('gemini-2.0-flash-exp'),
  temperature: z.number().min(0).max(2).default(0.1),
  maxTokens: z.number().positive().default(1000),
  systemPrompt: z.string().default('You are Accelos, a helpful AI assistant.'),
  dataDirectoryPath: z.string().default(process.env.ACCELOS_DATA_DIRECTORY_PATH || './.accelos/data'),
  // Legacy support - will be deprecated
  guardrailFilePath: z.string().optional(),
});

export type AccelosConfig = z.infer<typeof AccelosConfigSchema>;

/**
 * Validates and migrates legacy configuration to new structure
 */
export function validateAndMigrateConfig(config: Partial<AccelosConfig>): AccelosConfig {
  const validatedConfig = AccelosConfigSchema.parse(config);
  
  // Warn about deprecated configuration
  if (config.guardrailFilePath) {
    console.warn('⚠️  DEPRECATED: guardrailFilePath is deprecated. Use dataDirectoryPath instead.');
  }
  
  return validatedConfig;
}

export const defaultConfig: AccelosConfig = {
  llmProvider: 'google',
  model: 'gemini-2.0-flash-exp',
  temperature: 0.1,
  maxTokens: 1000,
  systemPrompt: 'You are Accelos, a helpful AI assistant that helps with various tasks including code analysis, document processing, and general assistance.',
  dataDirectoryPath: process.env.ACCELOS_DATA_DIRECTORY_PATH || './.accelos/data',
};

/**
 * Get structured paths within the data directory
 */
export function getDataPaths(dataDir: string) {
  return {
    rcaDirectory: process.env.RCA_DIRECTORY_PATH || path.join(dataDir, 'RCA'),
    guardrailsFile: path.join(dataDir, 'guardrails.json'),
    reviewsDirectory: path.join(dataDir, 'reviews'),
    incidentsDirectory: path.join(dataDir, 'incidents'),
  };
}

/**
 * Get paths with backward compatibility support
 */
export function getCompatiblePaths(config: AccelosConfig) {
  const dataPaths = getDataPaths(config.dataDirectoryPath);
  
  return {
    rcaDirectory: dataPaths.rcaDirectory,
    guardrailsFile: config.guardrailFilePath || dataPaths.guardrailsFile,
    reviewsDirectory: dataPaths.reviewsDirectory,
    incidentsDirectory: dataPaths.incidentsDirectory,
  };
}