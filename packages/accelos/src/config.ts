import { z } from 'zod';

export const AccelosConfigSchema = z.object({
  llmProvider: z.enum(['openai', 'google', 'anthropic']).default('google'),
  apiKey: z.string().optional(),
  model: z.string().default('gemini-2.0-flash-exp'),
  temperature: z.number().min(0).max(2).default(0.1),
  maxTokens: z.number().positive().default(1000),
  systemPrompt: z.string().default('You are Accelos, a helpful AI assistant.'),
});

export type AccelosConfig = z.infer<typeof AccelosConfigSchema>;

export const defaultConfig: AccelosConfig = {
  llmProvider: 'google',
  model: 'gemini-2.0-flash-exp',
  temperature: 0.1,
  maxTokens: 1000,
  systemPrompt: 'You are Accelos, a helpful AI assistant that helps with various tasks including code analysis, document processing, and general assistance.',
};