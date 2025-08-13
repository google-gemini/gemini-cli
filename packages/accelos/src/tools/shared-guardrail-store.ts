import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

// Guardrail schema definition
export const GuardrailSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  subcategory: z.string(),
  description: z.string(),
  rule: z.object({
    condition: z.string(),
    requirement: z.string(),
    actions: z.array(z.string()),
  }),
  enforcement: z.object({
    stages: z.array(z.string()),
    severity: z.enum(['blocking', 'warning']),
    automation: z.record(z.string()),
  }),
  learned_from_rcas: z.array(z.string()),
  failure_patterns_prevented: z.array(z.string()),
  validation_criteria: z.array(z.string()),
  code_review_prompt: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Guardrail = z.infer<typeof GuardrailSchema>;

// Shared in-memory storage for guardrails
export class GuardrailStore {
  private static instance: GuardrailStore;
  private readonly guardrails: Map<string, Guardrail> = new Map();
  private filePath: string = '';
  private autoSave: boolean = false;

  private constructor() {}

  static getInstance(): GuardrailStore {
    if (!GuardrailStore.instance) {
      GuardrailStore.instance = new GuardrailStore();
    }
    return GuardrailStore.instance;
  }

  async loadFromFile(filePath: string, autoSave: boolean = false): Promise<{ loaded: number; errors: string[] }> {
    this.filePath = filePath;
    this.autoSave = autoSave;
    const errors: string[] = [];
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsedData = JSON.parse(data);
      
      // Handle both array format and object with "guardrails" property
      const guardrailsArray = Array.isArray(parsedData) ? parsedData : parsedData.guardrails;
      
      if (!Array.isArray(guardrailsArray)) {
        throw new Error('Invalid JSON format: expected array of guardrails or object with "guardrails" array property');
      }
      
      this.guardrails.clear();
      let loaded = 0;
      
      for (const guardrail of guardrailsArray) {
        try {
          const validated = GuardrailSchema.parse(guardrail);
          this.guardrails.set(validated.id, validated);
          loaded++;
        } catch (error) {
          errors.push(`Invalid guardrail ${guardrail.id || 'unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      return { loaded, errors };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, start with empty store
        return { loaded: 0, errors: [`File not found: ${filePath}`] };
      }
      throw new Error(`Failed to load guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async saveToFile(): Promise<void> {
    if (!this.filePath) {
      throw new Error('No file path set. Load from file first.');
    }

    const guardrailsArray = Array.from(this.guardrails.values());
    
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(this.filePath, JSON.stringify(guardrailsArray, null, 2));
  }

  getAll(): Guardrail[] {
    return Array.from(this.guardrails.values());
  }

  getById(id: string): Guardrail | undefined {
    return this.guardrails.get(id);
  }

  async add(guardrail: Omit<Guardrail, 'created_at' | 'updated_at'>): Promise<Guardrail> {
    const now = new Date().toISOString();
    const newGuardrail: Guardrail = {
      ...guardrail,
      created_at: now,
      updated_at: now,
    };

    this.guardrails.set(newGuardrail.id, newGuardrail);
    
    if (this.autoSave) {
      await this.saveToFile();
    }
    
    return newGuardrail;
  }

  async update(id: string, updates: Partial<Omit<Guardrail, 'id' | 'created_at'>>): Promise<Guardrail | null> {
    const existing = this.guardrails.get(id);
    if (!existing) {
      return null;
    }

    const updated: Guardrail = {
      ...existing,
      ...updates,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    this.guardrails.set(id, updated);
    
    if (this.autoSave) {
      await this.saveToFile();
    }
    
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.guardrails.delete(id);
    
    if (deleted && this.autoSave) {
      await this.saveToFile();
    }
    
    return deleted;
  }

  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const guardrails = this.getAll();
    const stats = {
      total: guardrails.length,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
    };

    for (const guardrail of guardrails) {
      stats.byCategory[guardrail.category] = (stats.byCategory[guardrail.category] || 0) + 1;
      stats.bySeverity[guardrail.enforcement.severity] = (stats.bySeverity[guardrail.enforcement.severity] || 0) + 1;
    }

    return stats;
  }
}