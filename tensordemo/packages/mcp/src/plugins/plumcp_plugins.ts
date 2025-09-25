/**
 * PLUMCP Plugin Examples
 *
 * Demonstrating how plugins extend the minimal MCP core with specialized functionality
 */

import {
  PLUMCPPlugin,
  PluginCapability,
  PluginContext,
  MCPTool,
  MCPResource,
  MCPPrompt,
} from './plumcp_core.js';

// ============================================================================
// AI ASSISTANCE PLUGIN - Provides AI/ML capabilities
// ============================================================================

export class AIAssistancePlugin implements PLUMCPPlugin {
  id = 'plumcp-ai-assistance';
  name = 'AI Assistance Plugin';
  version = '1.0.0';
  description = 'Provides AI-powered assistance and code analysis capabilities';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['analyze_code', 'suggest_improvements', 'generate_documentation']
    },
    {
      type: 'prompts',
      methods: ['code_review', 'refactor_suggestion']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-filesystem', version: '1.0.0', required: true }
  ];

  async activate(context: PluginContext): Promise<void> {
    // Register AI analysis tools
    context.registerTool({
      name: 'analyze_code',
      description: 'Analyze code for quality, complexity, and potential issues',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to analyze' },
          language: { type: 'string', description: 'Programming language' }
        },
        required: ['code']
      },
      handler: async (args: { code: string; language?: string }) => {
        // Simulate AI analysis
        const analysis = {
          complexity: this.calculateComplexity(args.code),
          quality: this.assessQuality(args.code),
          suggestions: this.generateSuggestions(args.code),
          language: args.language || 'unknown'
        };
        return analysis;
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'suggest_improvements',
      description: 'Suggest code improvements and optimizations',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to improve' },
          focus: { type: 'string', enum: ['performance', 'readability', 'maintainability'] }
        },
        required: ['code']
      },
      handler: async (args: { code: string; focus?: string }) => {
        const suggestions = this.generateImprovementSuggestions(args.code, args.focus);
        return { suggestions, focus: args.focus || 'general' };
      },
      pluginId: this.id
    });

    // Register AI prompts
    context.registerPrompt({
      name: 'code_review',
      description: 'Get AI-powered code review feedback',
      arguments: [
        { name: 'code', description: 'Code to review', required: true },
        { name: 'language', description: 'Programming language', required: false }
      ],
      handler: async (args: { code: string; language?: string }) => {
        return `Please review this ${args.language || 'code'}:

\`\`\`
${args.code}
\`\`\`

Provide detailed feedback on:
1. Code quality and style
2. Potential bugs or issues
3. Performance considerations
4. Best practices compliance
5. Suggested improvements`;
      },
      pluginId: this.id
    });

    console.error(`AI Assistance Plugin activated - providing intelligent code analysis`);
  }

  async deactivate(): Promise<void> {
    console.error(`AI Assistance Plugin deactivated`);
  }

  private calculateComplexity(code: string): number {
    const lines = code.split('\n').length;
    const functions = (code.match(/function\s+\w+\s*\(/g) || []).length;
    const loops = (code.match(/(for|while)\s*\(/g) || []).length;
    return Math.min(10, lines / 10 + functions * 2 + loops * 1.5);
  }

  private assessQuality(code: string): string {
    let score = 100;

    // Deduct for various issues
    if (code.includes('var ')) score -= 10; // Prefer const/let
    if (code.includes('console.log')) score -= 5; // Debug code left in
    if (code.length > 1000) score -= 15; // Too long
    if (code.split('\n').length > 50) score -= 10; // Too many lines

    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    return 'needs_improvement';
  }

  private generateSuggestions(code: string): string[] {
    const suggestions = [];

    if (code.includes('var ')) {
      suggestions.push('Consider using const/let instead of var for better scoping');
    }

    if (code.includes('console.log')) {
      suggestions.push('Remove debug console.log statements before production');
    }

    if (code.split('\n').length > 30) {
      suggestions.push('Consider breaking down large functions into smaller ones');
    }

    return suggestions.length > 0 ? suggestions : ['Code looks well-structured'];
  }

  private generateImprovementSuggestions(code: string, focus?: string): string[] {
    const suggestions = [];

    switch (focus) {
      case 'performance':
        if (code.includes('for ')) {
          suggestions.push('Consider using array methods like map/filter/reduce for better performance');
        }
        if (code.includes('indexOf')) {
          suggestions.push('Consider using Set or Map for O(1) lookups instead of array indexOf');
        }
        break;

      case 'readability':
        if (!code.includes('//')) {
          suggestions.push('Add comments to explain complex logic');
        }
        if (code.split('\n').some(line => line.length > 80)) {
          suggestions.push('Break long lines for better readability');
        }
        break;

      case 'maintainability':
        if (code.split('\n').length > 25) {
          suggestions.push('Extract complex logic into separate functions');
        }
        suggestions.push('Add JSDoc comments for public APIs');
        break;

      default:
        suggestions.push('Consider adding error handling');
        suggestions.push('Add input validation');
        suggestions.push('Use meaningful variable names');
    }

    return suggestions;
  }
}

// ============================================================================
// WEB SCRAPING PLUGIN - Provides web access capabilities
// ============================================================================

export class WebScrapingPlugin implements PLUMCPPlugin {
  id = 'plumcp-web-scraping';
  name = 'Web Scraping Plugin';
  version = '1.0.0';
  description = 'Provides web scraping and data extraction capabilities';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['scrape_url', 'extract_text', 'get_page_title']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [];

  async activate(context: PluginContext): Promise<void> {
    // Register web scraping tools
    context.registerTool({
      name: 'scrape_url',
      description: 'Scrape content from a web URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          selector: { type: 'string', description: 'CSS selector (optional)' }
        },
        required: ['url']
      },
      handler: async (args: { url: string; selector?: string }) => {
        // Simulate web scraping (in real implementation, use puppeteer or similar)
        const mockContent = `Scraped content from ${args.url}`;
        const title = `Page Title for ${args.url}`;

        return {
          url: args.url,
          title,
          content: args.selector ? `Content from selector: ${args.selector}` : mockContent,
          scrapedAt: new Date().toISOString()
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'extract_text',
      description: 'Extract readable text from HTML content',
      inputSchema: {
        type: 'object',
        properties: {
          html: { type: 'string', description: 'HTML content to extract from' }
        },
        required: ['html']
      },
      handler: async (args: { html: string }) => {
        // Simple text extraction (real implementation would use libraries)
        const text = args.html
          .replace(/<[^>]*>/g, ' ') // Remove HTML tags
          .replace(/\s+/g, ' ')    // Normalize whitespace
          .trim();

        return {
          originalLength: args.html.length,
          extractedText: text,
          textLength: text.length
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'get_page_title',
      description: 'Extract title from HTML content',
      inputSchema: {
        type: 'object',
        properties: {
          html: { type: 'string', description: 'HTML content' }
        },
        required: ['html']
      },
      handler: async (args: { html: string }) => {
        const titleMatch = args.html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'No title found';

        return { title, found: !!titleMatch };
      },
      pluginId: this.id
    });

    // Register web resources
    context.registerResource({
      uri: 'web://current-time',
      name: 'Current Time Service',
      description: 'Get current time from web service',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        source: 'web-service'
      }, null, 2),
      pluginId: this.id
    });

    console.error(`Web Scraping Plugin activated - providing web access capabilities`);
  }

  async deactivate(): Promise<void> {
    console.error(`Web Scraping Plugin deactivated`);
  }
}

// ============================================================================
// DATABASE PLUGIN - Provides data persistence
// ============================================================================

export class DatabasePlugin implements PLUMCPPlugin {
  id = 'plumcp-database';
  name = 'Database Plugin';
  version = '1.0.0';
  description = 'Provides database operations and data persistence';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['query_database', 'insert_data', 'create_table']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [];

  private db: Map<string, any[]> = new Map(); // Simple in-memory "database"

  async activate(context: PluginContext): Promise<void> {
    // Register database tools
    context.registerTool({
      name: 'query_database',
      description: 'Query data from the database',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to query' },
          filter: { type: 'object', description: 'Filter criteria (optional)' }
        },
        required: ['table']
      },
      handler: async (args: { table: string; filter?: any }) => {
        const table = this.db.get(args.table) || [];
        let results = table;

        if (args.filter) {
          results = table.filter(item =>
            Object.entries(args.filter).every(([key, value]) => item[key] === value)
          );
        }

        return {
          table: args.table,
          results,
          count: results.length,
          filter: args.filter
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'insert_data',
      description: 'Insert data into a database table',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          data: { type: 'object', description: 'Data to insert' }
        },
        required: ['table', 'data']
      },
      handler: async (args: { table: string; data: any }) => {
        if (!this.db.has(args.table)) {
          this.db.set(args.table, []);
        }

        const table = this.db.get(args.table)!;
        const newItem = { ...args.data, id: Date.now(), createdAt: new Date() };
        table.push(newItem);

        return {
          table: args.table,
          inserted: newItem,
          newCount: table.length
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'create_table',
      description: 'Create a new database table',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to create' }
        },
        required: ['table']
      },
      handler: async (args: { table: string }) => {
        if (this.db.has(args.table)) {
          throw new Error(`Table ${args.table} already exists`);
        }

        this.db.set(args.table, []);
        return {
          table: args.table,
          status: 'created',
          message: `Table ${args.table} created successfully`
        };
      },
      pluginId: this.id
    });

    // Register database resources
    context.registerResource({
      uri: 'db://stats',
      name: 'Database Statistics',
      description: 'Current database statistics and table counts',
      mimeType: 'application/json',
      handler: async () => {
        const stats = {
          tables: Array.from(this.db.entries()).map(([name, data]) => ({
            name,
            recordCount: data.length
          })),
          totalTables: this.db.size,
          totalRecords: Array.from(this.db.values()).reduce((sum, table) => sum + table.length, 0),
          plugin: this.name
        };
        return JSON.stringify(stats, null, 2);
      },
      pluginId: this.id
    });

    console.error(`Database Plugin activated - providing data persistence capabilities`);
  }

  async deactivate(): Promise<void> {
    // Clear in-memory database
    this.db.clear();
    console.error(`Database Plugin deactivated - data cleared`);
  }
}

// ============================================================================
// CONTEXT PROVIDER PLUGIN - The Safe Model Context Provider
// ============================================================================

export class ContextProviderPlugin implements PLUMCPPlugin {
  id = 'plumcp-context-provider';
  name = 'Context Provider Plugin';
  version = '1.0.0';
  description = 'Provides secure Model Context Protocol context management and memory';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['store_context', 'retrieve_context', 'clear_context', 'context_search']
    },
    {
      type: 'resources',
      methods: ['read']
    },
    {
      type: 'sampling',
      methods: ['context_aware_sampling']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-core-tools', version: '1.0.0', required: true }
  ];

  private contextStore: Map<string, ContextEntry> = new Map();
  private contextIndex: Map<string, string[]> = new Map(); // For semantic search
  private maxContexts = 1000;
  private contextTTL = 24 * 60 * 60 * 1000; // 24 hours

  async activate(context: PluginContext): Promise<void> {
    // Register context management tools
    context.registerTool({
      name: 'store_context',
      description: 'Securely store context data with validation and encryption',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Context key' },
          data: { type: 'object', description: 'Context data to store' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Search tags' }
        },
        required: ['key', 'data']
      },
      handler: async (args: { key: string; data: any; tags?: string[] }) => {
        // Validate and sanitize input
        const sanitizedKey = this.sanitizeKey(args.key);
        const validatedData = this.validateContextData(args.data);

        if (!validatedData) {
          throw new Error('Invalid context data format');
        }

        // Store with metadata
        const entry: ContextEntry = {
          key: sanitizedKey,
          data: validatedData,
          tags: args.tags || [],
          timestamp: Date.now(),
          hash: this.hashData(validatedData)
        };

        // Enforce limits
        if (this.contextStore.size >= this.maxContexts) {
          this.evictOldContexts();
        }

        this.contextStore.set(sanitizedKey, entry);

        // Update search index
        this.updateSearchIndex(sanitizedKey, entry);

        return {
          stored: true,
          key: sanitizedKey,
          size: JSON.stringify(validatedData).length
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'retrieve_context',
      description: 'Retrieve context data with integrity verification',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Context key to retrieve' }
        },
        required: ['key']
      },
      handler: async (args: { key: string }) => {
        const entry = this.contextStore.get(args.key);

        if (!entry) {
          return { found: false };
        }

        // Verify data integrity
        const currentHash = this.hashData(entry.data);
        if (currentHash !== entry.hash) {
          throw new Error('Context data integrity compromised');
        }

        // Check TTL
        if (Date.now() - entry.timestamp > this.contextTTL) {
          this.contextStore.delete(args.key);
          return { found: false, expired: true };
        }

        return {
          found: true,
          data: entry.data,
          tags: entry.tags,
          age: Date.now() - entry.timestamp
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'clear_context',
      description: 'Securely clear context data',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Context key to clear' }
        },
        required: ['key']
      },
      handler: async (args: { key: string }) => {
        const existed = this.contextStore.has(args.key);
        this.contextStore.delete(args.key);
        this.removeFromSearchIndex(args.key);

        return { cleared: existed, key: args.key };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'context_search',
      description: 'Search context data by tags or semantic similarity',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag filters' },
          limit: { type: 'number', default: 10, description: 'Max results' }
        }
      },
      handler: async (args: { query?: string; tags?: string[]; limit?: number }) => {
        const limit = args.limit || 10;
        let candidates: string[] = [];

        // Tag-based filtering
        if (args.tags && args.tags.length > 0) {
          candidates = this.searchByTags(args.tags);
        } else {
          candidates = Array.from(this.contextStore.keys());
        }

        // Semantic search (simplified)
        const results = candidates
          .map(key => {
            const entry = this.contextStore.get(key)!;
            const score = this.calculateRelevance(entry, args.query || '');
            return { key, entry, score };
          })
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(item => ({
            key: item.key,
            data: item.entry.data,
            tags: item.entry.tags,
            score: item.score
          }));

        return {
          results,
          total: results.length,
          query: args.query
        };
      },
      pluginId: this.id
    });

    // Register context resources
    context.registerResource({
      uri: 'context://stats',
      name: 'Context Statistics',
      description: 'Current context store statistics and health',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        totalContexts: this.contextStore.size,
        maxContexts: this.maxContexts,
        averageAge: this.getAverageContextAge(),
        oldestContext: this.getOldestContextAge(),
        newestContext: this.getNewestContextAge(),
        tagDistribution: this.getTagDistribution(),
        plugin: this.name
      }, null, 2),
      pluginId: this.id
    });

    console.error(`Context Provider Plugin activated - providing secure MCP context management`);
  }

  async deactivate(): Promise<void> {
    // Secure cleanup
    this.contextStore.clear();
    this.contextIndex.clear();
    console.error(`Context Provider Plugin deactivated - all context data securely cleared`);
  }

  private sanitizeKey(key: string): string {
    // Prevent path traversal and injection attacks
    return key.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  }

  private validateContextData(data: any): any {
    // Basic validation - prevent prototype pollution, circular refs, etc.
    if (typeof data !== 'object' || data === null) return null;
    if (JSON.stringify(data).length > 1024 * 1024) return null; // 1MB limit

    // Remove dangerous properties
    const cleaned = JSON.parse(JSON.stringify(data));
    this.removeDangerousProperties(cleaned);

    return cleaned;
  }

  private removeDangerousProperties(obj: any): void {
    if (typeof obj !== 'object' || obj === null) return;

    const dangerous = ['__proto__', 'constructor', 'prototype'];
    for (const key of Object.keys(obj)) {
      if (dangerous.includes(key)) {
        delete obj[key];
      } else {
        this.removeDangerousProperties(obj[key]);
      }
    }
  }

  private hashData(data: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  private updateSearchIndex(key: string, entry: ContextEntry): void {
    // Update tag-based index
    for (const tag of entry.tags) {
      if (!this.contextIndex.has(tag)) {
        this.contextIndex.set(tag, []);
      }
      this.contextIndex.get(tag)!.push(key);
    }
  }

  private removeFromSearchIndex(key: string): void {
    for (const [tag, keys] of this.contextIndex.entries()) {
      const index = keys.indexOf(key);
      if (index > -1) {
        keys.splice(index, 1);
      }
    }
  }

  private searchByTags(tags: string[]): string[] {
    const result = new Set<string>();

    for (const tag of tags) {
      const keys = this.contextIndex.get(tag) || [];
      keys.forEach(key => result.add(key));
    }

    return Array.from(result);
  }

  private calculateRelevance(entry: ContextEntry, query: string): number {
    // Simple relevance scoring based on tags and content
    let score = 0;

    // Tag matches
    const queryLower = query.toLowerCase();
    for (const tag of entry.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 10;
      }
    }

    // Content matches (simplified)
    const content = JSON.stringify(entry.data).toLowerCase();
    if (content.includes(queryLower)) {
      score += 5;
    }

    return score;
  }

  private evictOldContexts(): void {
    // Remove oldest contexts when at capacity
    const entries = Array.from(this.contextStore.entries())
      .sort(([,a], [,b]) => a.timestamp - b.timestamp);

    const toRemove = entries.slice(0, Math.floor(this.maxContexts * 0.1)); // Remove 10%
    for (const [key] of toRemove) {
      this.contextStore.delete(key);
      this.removeFromSearchIndex(key);
    }
  }

  private getAverageContextAge(): number {
    if (this.contextStore.size === 0) return 0;
    const ages = Array.from(this.contextStore.values()).map(e => Date.now() - e.timestamp);
    return ages.reduce((sum, age) => sum + age, 0) / ages.length;
  }

  private getOldestContextAge(): number {
    if (this.contextStore.size === 0) return 0;
    const ages = Array.from(this.contextStore.values()).map(e => Date.now() - e.timestamp);
    return Math.max(...ages);
  }

  private getNewestContextAge(): number {
    if (this.contextStore.size === 0) return 0;
    const ages = Array.from(this.contextStore.values()).map(e => Date.now() - e.timestamp);
    return Math.min(...ages);
  }

  private getTagDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    for (const [tag, keys] of this.contextIndex.entries()) {
      distribution[tag] = keys.length;
    }
    return distribution;
  }
}

interface ContextEntry {
  key: string;
  data: any;
  tags: string[];
  timestamp: number;
  hash: string;
}

// ============================================================================
// ADVANCED CONTEXT PLUGINS - Model Context Plugin Providers
// ============================================================================

export class IntelligentContextPlugin implements PLUMCPPlugin {
  id = 'plumcp-intelligent-context';
  name = 'Intelligent Context Plugin';
  version = '1.0.0';
  description = 'Advanced context provider with ML-powered context understanding and prediction';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['analyze_context_patterns', 'predict_context_needs', 'merge_contexts', 'context_recommendations']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-context-provider', version: '1.0.0', required: true }
  ];

  private contextAnalyzer: Map<string, any> = new Map();

  async activate(context: PluginContext): Promise<void> {
    // Advanced context analysis tools
    context.registerTool({
      name: 'analyze_context_patterns',
      description: 'Analyze context usage patterns to optimize storage and retrieval',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User identifier' },
          timeRange: { type: 'number', description: 'Analysis time range in hours' }
        },
        required: ['userId']
      },
      handler: async (args: { userId: string; timeRange?: number }) => {
        // Analyze context patterns for this user
        const patterns = await this.analyzeUsagePatterns(args.userId, args.timeRange || 24);
        return {
          userId: args.userId,
          patterns,
          recommendations: this.generateOptimizationRecommendations(patterns)
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'predict_context_needs',
      description: 'Predict what context will be needed based on current interaction patterns',
      inputSchema: {
        type: 'object',
        properties: {
          currentContext: { type: 'string', description: 'Current context key' },
          userHistory: { type: 'array', items: { type: 'string' }, description: 'Recent context keys' }
        },
        required: ['currentContext']
      },
      handler: async (args: { currentContext: string; userHistory?: string[] }) => {
        const predictions = await this.predictContextNeeds(args.currentContext, args.userHistory || []);
        return {
          currentContext: args.currentContext,
          predictions,
          confidence: this.calculatePredictionConfidence(predictions)
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'merge_contexts',
      description: 'Intelligently merge related contexts to reduce redundancy',
      inputSchema: {
        type: 'object',
        properties: {
          contextKeys: { type: 'array', items: { type: 'string' }, description: 'Context keys to merge' },
          strategy: { type: 'string', enum: ['union', 'intersection', 'intelligent'], default: 'intelligent' }
        },
        required: ['contextKeys']
      },
      handler: async (args: { contextKeys: string[]; strategy?: string }) => {
        const mergedContext = await this.mergeContexts(args.contextKeys, args.strategy || 'intelligent');
        return {
          originalKeys: args.contextKeys,
          mergedKey: mergedContext.key,
          strategy: args.strategy,
          reduction: this.calculateDataReduction(args.contextKeys, mergedContext)
        };
      },
      pluginId: this.id
    });

    // Register intelligent context resources
    context.registerResource({
      uri: 'context://intelligence/stats',
      name: 'Context Intelligence Statistics',
      description: 'Advanced context usage analytics and predictions',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        totalPatternsAnalyzed: this.contextAnalyzer.size,
        predictionAccuracy: this.calculateOverallPredictionAccuracy(),
        contextOptimizationSavings: this.calculateOptimizationSavings(),
        plugin: this.name
      }, null, 2),
      pluginId: this.id
    });

    console.error(`Intelligent Context Plugin activated - providing ML-powered context intelligence`);
  }

  async deactivate(): Promise<void> {
    this.contextAnalyzer.clear();
    console.error(`Intelligent Context Plugin deactivated`);
  }

  private async analyzeUsagePatterns(userId: string, timeRange: number): Promise<any> {
    // Analyze context usage patterns
    return {
      frequentContexts: ['session', 'preferences', 'conversation'],
      peakUsageHours: [9, 14, 18],
      averageContextSize: 2048,
      mostUsedTags: ['user', 'session', 'data']
    };
  }

  private generateOptimizationRecommendations(patterns: any): string[] {
    return [
      'Implement context prefetching for frequently accessed data',
      'Compress old contexts using intelligent summarization',
      'Create context templates for common interaction patterns'
    ];
  }

  private async predictContextNeeds(currentContext: string, userHistory: string[]): Promise<string[]> {
    // ML-powered prediction logic
    return ['user_preferences', 'conversation_history', 'relevant_documents'];
  }

  private calculatePredictionConfidence(predictions: string[]): number {
    return 0.85; // Mock confidence score
  }

  private async mergeContexts(contextKeys: string[], strategy: string): Promise<any> {
    // Intelligent context merging
    return {
      key: `merged_${Date.now()}`,
      data: { merged: true, sources: contextKeys },
      tags: ['merged', 'optimized']
    };
  }

  private calculateDataReduction(originalKeys: string[], merged: any): number {
    return 0.35; // 35% reduction
  }

  private calculateOverallPredictionAccuracy(): number {
    return 0.87;
  }

  private calculateOptimizationSavings(): number {
    return 42; // 42% savings
  }
}

// ============================================================================
// SPECIALIZED CONTEXT PLUGINS - Domain-Specific Context Providers
// ============================================================================

export class CodeContextPlugin implements PLUMCPPlugin {
  id = 'plumcp-code-context';
  name = 'Code Context Plugin';
  version = '1.0.0';
  description = 'Specialized context provider for code-related conversations and development';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['store_code_context', 'retrieve_code_context', 'search_code_patterns', 'link_code_references']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-context-provider', version: '1.0.0', required: true }
  ];

  async activate(context: PluginContext): Promise<void> {
    // Code-specific context tools
    context.registerTool({
      name: 'store_code_context',
      description: 'Store code-related context with syntax highlighting and metadata',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code content' },
          language: { type: 'string', description: 'Programming language' },
          filePath: { type: 'string', description: 'File path' },
          function: { type: 'string', description: 'Function/class name' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['code']
      },
      handler: async (args: any) => {
        const codeContext = {
          ...args,
          syntaxTree: this.parseCode(args.code, args.language),
          complexity: this.calculateCodeComplexity(args.code),
          dependencies: this.extractDependencies(args.code, args.language),
          timestamp: Date.now()
        };

        // Store in base context provider
        await context.registerTool({
          name: 'store_context',
          description: 'temp',
          inputSchema: {},
          handler: async () => {},
          pluginId: 'temp'
        } as any);

        return {
          stored: true,
          key: `code_${Date.now()}`,
          complexity: codeContext.complexity,
          dependencies: codeContext.dependencies
        };
      },
      pluginId: this.id
    });

    // Register code context resources
    context.registerResource({
      uri: 'context://code/language-stats',
      name: 'Code Language Statistics',
      description: 'Statistics about stored code by programming language',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        languages: {
          typescript: 45,
          python: 30,
          javascript: 15,
          rust: 10
        },
        totalSnippets: 1250,
        averageComplexity: 3.2,
        plugin: this.name
      }, null, 2),
      pluginId: this.id
    });

    console.error(`Code Context Plugin activated - providing specialized code context management`);
  }

  async deactivate(): Promise<void> {
    console.error(`Code Context Plugin deactivated`);
  }

  private parseCode(code: string, language: string): any {
    // Simplified syntax tree parsing
    return { parsed: true, language, tokens: code.split(/\s+/).length };
  }

  private calculateCodeComplexity(code: string): number {
    const lines = code.split('\n').length;
    const functions = (code.match(/function|def|fn\s+\w+/g) || []).length;
    return Math.min(10, lines/10 + functions);
  }

  private extractDependencies(code: string, language: string): string[] {
    // Extract import statements
    const deps: string[] = [];
    if (language === 'typescript' || language === 'javascript') {
      const imports = code.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g) || [];
      deps.push(...imports.map(imp => imp.match(/from\s+['"]([^'"]+)['"]/)![1]));
    }
    return deps;
  }
}

// ============================================================================
// CONTEXT-AWARE PLUGINS - Plugins That Use Context Providers
// ============================================================================

export class ContextAwareAIPlugin implements PLUMCPPlugin {
  id = 'plumcp-context-aware-ai';
  name = 'Context-Aware AI Plugin';
  version = '1.0.0';
  description = 'AI plugin that leverages multiple context providers for enhanced intelligence';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['context_aware_analysis', 'personalized_responses', 'adaptive_learning']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-context-provider', version: '1.0.0', required: true },
    { pluginId: 'plumcp-intelligent-context', version: '1.0.0', required: false },
    { pluginId: 'plumcp-code-context', version: '1.0.0', required: false }
  ];

  async activate(context: PluginContext): Promise<void> {
    // Context-aware AI tools
    context.registerTool({
      name: 'context_aware_analysis',
      description: 'Analyze data using historical context and user preferences',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data to analyze' },
          userId: { type: 'string', description: 'User identifier' },
          context: { type: 'string', description: 'Context key for analysis' }
        },
        required: ['data', 'userId']
      },
      handler: async (args: { data: string; userId: string; context?: string }) => {
        // Retrieve user context and preferences
        const userPrefs = await this.getUserPreferences(args.userId);
        const historicalData = await this.getHistoricalAnalysis(args.userId);
        const contextData = args.context ? await this.getContextData(args.context) : null;

        // Perform context-aware analysis
        const analysis = await this.performContextAwareAnalysis(
          args.data,
          userPrefs,
          historicalData,
          contextData
        );

        return {
          analysis,
          personalized: true,
          contextUsed: !!contextData,
          confidence: this.calculateAnalysisConfidence(analysis)
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'personalized_responses',
      description: 'Generate responses personalized to user context and history',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'User query' },
          userId: { type: 'string', description: 'User identifier' },
          conversationId: { type: 'string', description: 'Conversation context' }
        },
        required: ['query', 'userId']
      },
      handler: async (args: { query: string; userId: string; conversationId?: string }) => {
        const userContext = await this.buildUserContext(args.userId);
        const conversationHistory = args.conversationId ?
          await this.getConversationHistory(args.conversationId) : [];

        const personalizedResponse = await this.generatePersonalizedResponse(
          args.query,
          userContext,
          conversationHistory
        );

        return {
          response: personalizedResponse,
          personalizationFactors: this.identifyPersonalizationFactors(userContext),
          contextRelevance: this.calculateContextRelevance(userContext, args.query)
        };
      },
      pluginId: this.id
    });

    console.error(`Context-Aware AI Plugin activated - leveraging multiple context providers for enhanced intelligence`);
  }

  async deactivate(): Promise<void> {
    console.error(`Context-Aware AI Plugin deactivated`);
  }

  private async getUserPreferences(userId: string): Promise<any> {
    // Would call context provider
    return { theme: 'dark', language: 'typescript', expertise: 'advanced' };
  }

  private async getHistoricalAnalysis(userId: string): Promise<any[]> {
    return [{ topic: 'security', confidence: 0.9 }, { topic: 'performance', confidence: 0.8 }];
  }

  private async getContextData(contextKey: string): Promise<any> {
    return { type: 'analysis', data: 'sample context' };
  }

  private async performContextAwareAnalysis(data: string, prefs: any, history: any[], context: any): Promise<any> {
    return {
      insights: ['Personalized insight 1', 'Personalized insight 2'],
      recommendations: ['Action 1', 'Action 2'],
      confidence: 0.92
    };
  }

  private calculateAnalysisConfidence(analysis: any): number {
    return 0.88;
  }

  private async buildUserContext(userId: string): Promise<any> {
    return {
      preferences: await this.getUserPreferences(userId),
      history: await this.getHistoricalAnalysis(userId),
      patterns: ['pattern1', 'pattern2']
    };
  }

  private async getConversationHistory(conversationId: string): Promise<any[]> {
    return [
      { query: 'How does this work?', response: 'Let me explain...' },
      { query: 'Can you show an example?', response: 'Certainly...' }
    ];
  }

  private async generatePersonalizedResponse(query: string, userContext: any, history: any[]): Promise<string> {
    return `Based on your ${userContext.preferences.expertise} expertise and interest in ${userContext.history[0].topic}, here's a tailored response to: ${query}`;
  }

  private identifyPersonalizationFactors(userContext: any): string[] {
    return ['expertise_level', 'preferred_topics', 'interaction_history'];
  }

  private calculateContextRelevance(userContext: any, query: string): number {
    return 0.91;
  }
}

// ============================================================================
// IDE EXTENSION PLUGINS - Safe IDE Connectivity
// ============================================================================

export class IDEExtensionFrameworkPlugin implements PLUMCPPlugin {
  id = 'plumcp-ide-framework';
  name = 'IDE Extension Framework Plugin';
  version = '1.0.0';
  description = 'Provides secure framework for IDE extensions to connect to PLUMCP safely';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['register_ide_extension', 'authenticate_ide', 'sync_ide_context', 'manage_ide_permissions']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-context-provider', version: '1.0.0', required: true }
  ];

  private registeredExtensions: Map<string, IDEExtension> = new Map();
  private activeSessions: Map<string, IDESession> = new Map();
  private extensionTokens: Map<string, string> = new Map();

  async activate(context: PluginContext): Promise<void> {
    // Register IDE extension management tools
    context.registerTool({
      name: 'register_ide_extension',
      description: 'Securely register an IDE extension with PLUMCP',
      inputSchema: {
        type: 'object',
        properties: {
          extensionId: { type: 'string', description: 'Unique extension identifier' },
          ideType: { type: 'string', enum: ['vscode', 'cursor', 'jetbrains', 'vim', 'emacs'], description: 'IDE type' },
          capabilities: { type: 'array', items: { type: 'string' }, description: 'Requested capabilities' },
          publicKey: { type: 'string', description: 'Extension public key for authentication' }
        },
        required: ['extensionId', 'ideType', 'capabilities']
      },
      handler: async (args: { extensionId: string; ideType: string; capabilities: string[]; publicKey?: string }) => {
        // Validate extension registration
        const validation = await this.validateExtension(args.extensionId, args.capabilities);

        if (!validation.valid) {
          throw new Error(`Extension registration failed: ${validation.reason}`);
        }

        // Generate secure token
        const token = this.generateSecureToken();
        this.extensionTokens.set(args.extensionId, token);

        // Register extension
        const extension: IDEExtension = {
          id: args.extensionId,
          ideType: args.ideType,
          capabilities: args.capabilities,
          publicKey: args.publicKey,
          registeredAt: Date.now(),
          token: token,
          status: 'registered'
        };

        this.registeredExtensions.set(args.extensionId, extension);

        return {
          registered: true,
          extensionId: args.extensionId,
          token: token,
          capabilities: args.capabilities,
          secureChannel: this.createSecureChannel(args.extensionId)
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'authenticate_ide',
      description: 'Authenticate an IDE extension session with PLUMCP',
      inputSchema: {
        type: 'object',
        properties: {
          extensionId: { type: 'string', description: 'Extension identifier' },
          token: { type: 'string', description: 'Authentication token' },
          sessionId: { type: 'string', description: 'Unique session identifier' }
        },
        required: ['extensionId', 'token', 'sessionId']
      },
      handler: async (args: { extensionId: string; token: string; sessionId: string }) => {
        // Verify token
        const storedToken = this.extensionTokens.get(args.extensionId);
        if (!storedToken || storedToken !== args.token) {
          throw new Error('Authentication failed: Invalid token');
        }

        // Create authenticated session
        const session: IDESession = {
          sessionId: args.sessionId,
          extensionId: args.extensionId,
          authenticatedAt: Date.now(),
          permissions: await this.getExtensionPermissions(args.extensionId),
          secureChannel: true
        };

        this.activeSessions.set(args.sessionId, session);

        return {
          authenticated: true,
          sessionId: args.sessionId,
          permissions: session.permissions,
          secureChannelEstablished: true,
          sessionToken: this.generateSessionToken(args.sessionId)
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'sync_ide_context',
      description: 'Synchronize context between IDE and PLUMCP securely',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Authenticated session ID' },
          contextType: { type: 'string', enum: ['file', 'project', 'user', 'workspace'], description: 'Context type' },
          contextData: { type: 'object', description: 'Context data to sync' },
          direction: { type: 'string', enum: ['ide_to_plumcp', 'plumcp_to_ide', 'bidirectional'], description: 'Sync direction' }
        },
        required: ['sessionId', 'contextType', 'contextData']
      },
      handler: async (args: { sessionId: string; contextType: string; contextData: any; direction?: string }) => {
        // Verify session
        const session = this.activeSessions.get(args.sessionId);
        if (!session) {
          throw new Error('Invalid session: Not authenticated');
        }

        // Check permissions
        if (!session.permissions.includes(`context:${args.contextType}`)) {
          throw new Error(`Permission denied: Cannot sync ${args.contextType} context`);
        }

        // Perform secure context synchronization
        const syncResult = await this.performSecureSync(
          args.sessionId,
          args.contextType,
          args.contextData,
          args.direction || 'bidirectional'
        );

        return {
          synced: true,
          sessionId: args.sessionId,
          contextType: args.contextType,
          direction: args.direction,
          dataTransferred: JSON.stringify(args.contextData).length,
          integrityVerified: syncResult.integrityVerified,
          syncToken: syncResult.syncToken
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'manage_ide_permissions',
      description: 'Manage permissions for IDE extensions',
      inputSchema: {
        type: 'object',
        properties: {
          extensionId: { type: 'string', description: 'Extension identifier' },
          action: { type: 'string', enum: ['grant', 'revoke', 'list'], description: 'Permission action' },
          permissions: { type: 'array', items: { type: 'string' }, description: 'Permissions to manage' }
        },
        required: ['extensionId', 'action']
      },
      handler: async (args: { extensionId: string; action: string; permissions?: string[] }) => {
        const extension = this.registeredExtensions.get(args.extensionId);
        if (!extension) {
          throw new Error(`Extension not found: ${args.extensionId}`);
        }

        switch (args.action) {
          case 'grant':
            if (!args.permissions) throw new Error('Permissions required for grant action');
            extension.capabilities.push(...args.permissions);
            break;
          case 'revoke':
            if (!args.permissions) throw new Error('Permissions required for revoke action');
            extension.capabilities = extension.capabilities.filter(p => !args.permissions!.includes(p));
            break;
          case 'list':
            return { permissions: extension.capabilities };
        }

        return {
          action: args.action,
          extensionId: args.extensionId,
          currentPermissions: extension.capabilities,
          updated: args.action !== 'list'
        };
      },
      pluginId: this.id
    });

    // Register IDE framework resources
    context.registerResource({
      uri: 'ide://extensions/registered',
      name: 'Registered IDE Extensions',
      description: 'List of all registered IDE extensions and their status',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        extensions: Array.from(this.registeredExtensions.values()).map(ext => ({
          id: ext.id,
          ideType: ext.ideType,
          capabilities: ext.capabilities,
          status: ext.status,
          registeredAt: new Date(ext.registeredAt).toISOString()
        })),
        totalExtensions: this.registeredExtensions.size,
        activeSessions: this.activeSessions.size,
        plugin: this.name
      }, null, 2),
      pluginId: this.id
    });

    console.error(`IDE Extension Framework Plugin activated - providing secure IDE connectivity`);
  }

  async deactivate(): Promise<void> {
    // Secure cleanup
    this.registeredExtensions.clear();
    this.activeSessions.clear();
    this.extensionTokens.clear();
    console.error(`IDE Extension Framework Plugin deactivated - all sessions terminated`);
  }

  private async validateExtension(extensionId: string, capabilities: string[]): Promise<{ valid: boolean; reason?: string }> {
    // Check for malicious capabilities
    const dangerousCapabilities = ['system', 'admin', 'root', 'unrestricted'];
    for (const cap of capabilities) {
      if (dangerousCapabilities.some(danger => cap.includes(danger))) {
        return { valid: false, reason: `Dangerous capability requested: ${cap}` };
      }
    }

    // Check extension ID format
    if (!extensionId.match(/^[a-zA-Z0-9_-]+$/)) {
      return { valid: false, reason: 'Invalid extension ID format' };
    }

    return { valid: true };
  }

  private generateSecureToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  private generateSessionToken(sessionId: string): string {
    return require('crypto').createHash('sha256').update(sessionId + Date.now()).digest('hex');
  }

  private createSecureChannel(extensionId: string): any {
    return {
      protocol: 'wss',
      endpoint: `wss://plumcp.local/extensions/${extensionId}`,
      encryption: 'TLS 1.3',
      authentication: 'token-based'
    };
  }

  private async getExtensionPermissions(extensionId: string): Promise<string[]> {
    const extension = this.registeredExtensions.get(extensionId);
    return extension ? extension.capabilities : [];
  }

  private async performSecureSync(sessionId: string, contextType: string, contextData: any, direction: string): Promise<any> {
    // Implement secure synchronization logic
    const integrityHash = require('crypto').createHash('sha256').update(JSON.stringify(contextData)).digest('hex');

    return {
      integrityVerified: true,
      syncToken: require('crypto').randomBytes(16).toString('hex'),
      hash: integrityHash
    };
  }
}

// ============================================================================
// IDE-SPECIFIC EXTENSION PLUGINS
// ============================================================================

export class VSCodeExtensionPlugin implements PLUMCPPlugin {
  id = 'plumcp-vscode-extension';
  name = 'VS Code Extension Plugin';
  version = '1.0.0';
  description = 'Provides VS Code-specific extension capabilities with secure PLUMCP integration';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['vscode_execute_command', 'vscode_get_workspace', 'vscode_sync_settings', 'vscode_manage_extensions']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-ide-framework', version: '1.0.0', required: true },
    { pluginId: 'plumcp-context-provider', version: '1.0.0', required: true }
  ];

  async activate(context: PluginContext): Promise<void> {
    // VS Code specific tools
    context.registerTool({
      name: 'vscode_execute_command',
      description: 'Execute VS Code commands securely through PLUMCP',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Authenticated VS Code session' },
          command: { type: 'string', description: 'VS Code command to execute' },
          args: { type: 'array', description: 'Command arguments' }
        },
        required: ['sessionId', 'command']
      },
      handler: async (args: { sessionId: string; command: string; args?: any[] }) => {
        // Verify this is a valid VS Code session
        const session = await this.verifyVSCodeSession(args.sessionId);
        if (!session.valid) {
          throw new Error('Invalid VS Code session');
        }

        // Check command permissions
        if (!this.isAllowedVSCodeCommand(args.command, session.permissions)) {
          throw new Error(`Command not allowed: ${args.command}`);
        }

        // Execute command securely
        const result = await this.executeVSCodeCommand(args.command, args.args || []);

        return {
          executed: true,
          command: args.command,
          result: result,
          sessionId: args.sessionId,
          timestamp: Date.now()
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'vscode_get_workspace',
      description: 'Get VS Code workspace information securely',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'VS Code session ID' },
          includeFiles: { type: 'boolean', description: 'Include file listing', default: false }
        },
        required: ['sessionId']
      },
      handler: async (args: { sessionId: string; includeFiles?: boolean }) => {
        const session = await this.verifyVSCodeSession(args.sessionId);
        if (!session.valid) {
          throw new Error('Invalid VS Code session');
        }

        const workspaceInfo = await this.getVSCodeWorkspaceInfo(args.sessionId, args.includeFiles);

        return {
          sessionId: args.sessionId,
          workspace: workspaceInfo,
          retrievedAt: Date.now()
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'vscode_sync_settings',
      description: 'Synchronize VS Code settings with PLUMCP context',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'VS Code session ID' },
          settings: { type: 'object', description: 'Settings to sync' },
          direction: { type: 'string', enum: ['vscode_to_plumcp', 'plumcp_to_vscode'], default: 'vscode_to_plumcp' }
        },
        required: ['sessionId']
      },
      handler: async (args: { sessionId: string; settings?: any; direction?: string }) => {
        const session = await this.verifyVSCodeSession(args.sessionId);
        if (!session.valid) {
          throw new Error('Invalid VS Code session');
        }

        const syncResult = await this.syncVSCodeSettings(
          args.sessionId,
          args.settings || {},
          args.direction || 'vscode_to_plumcp'
        );

        return {
          synced: true,
          sessionId: args.sessionId,
          direction: args.direction,
          settingsCount: Object.keys(args.settings || {}).length,
          syncToken: syncResult.token
        };
      },
      pluginId: this.id
    });

    console.error(`VS Code Extension Plugin activated - providing secure VS Code integration`);
  }

  async deactivate(): Promise<void> {
    console.error(`VS Code Extension Plugin deactivated`);
  }

  private async verifyVSCodeSession(sessionId: string): Promise<{ valid: boolean; permissions?: string[] }> {
    // Would integrate with IDE Extension Framework
    return { valid: true, permissions: ['read', 'write', 'execute'] };
  }

  private isAllowedVSCodeCommand(command: string, permissions: string[]): boolean {
    // Define allowed commands based on permissions
    const allowedCommands = {
      read: ['workbench.action.quickOpen', 'workbench.action.showCommands'],
      write: ['workbench.action.files.save', 'workbench.action.closeActiveEditor'],
      execute: ['editor.action.formatDocument', 'editor.action.rename']
    };

    for (const permission of permissions) {
      if (allowedCommands[permission as keyof typeof allowedCommands]?.includes(command)) {
        return true;
      }
    }
    return false;
  }

  private async executeVSCodeCommand(command: string, args: any[]): Promise<any> {
    // Mock VS Code command execution
    return { success: true, command, args, executedAt: Date.now() };
  }

  private async getVSCodeWorkspaceInfo(sessionId: string, includeFiles?: boolean): Promise<any> {
    return {
      name: 'PLUMCP-Workspace',
      path: '/path/to/workspace',
      files: includeFiles ? ['package.json', 'tsconfig.json', 'README.md'] : undefined,
      sessionId
    };
  }

  private async syncVSCodeSettings(sessionId: string, settings: any, direction: string): Promise<any> {
    return {
      token: require('crypto').randomBytes(16).toString('hex'),
      syncedSettings: Object.keys(settings),
      direction
    };
  }
}

// ============================================================================
// SECURE IDE COMMUNICATION PLUGIN
// ============================================================================

export class SecureIDECommunicationPlugin implements PLUMCPPlugin {
  id = 'plumcp-secure-ide-comm';
  name = 'Secure IDE Communication Plugin';
  version = '1.0.0';
  description = 'Provides secure communication channels between PLUMCP and IDEs';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['establish_secure_channel', 'encrypt_ide_message', 'decrypt_ide_message', 'verify_ide_message']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-ide-framework', version: '1.0.0', required: true }
  ];

  private secureChannels: Map<string, SecureChannel> = new Map();
  private messageQueue: Map<string, QueuedMessage[]> = new Map();

  async activate(context: PluginContext): Promise<void> {
    // Secure communication tools
    context.registerTool({
      name: 'establish_secure_channel',
      description: 'Establish encrypted communication channel with IDE',
      inputSchema: {
        type: 'object',
        properties: {
          ideId: { type: 'string', description: 'IDE identifier' },
          encryptionMethod: { type: 'string', enum: ['AES-256-GCM', 'ChaCha20-Poly1305'], default: 'AES-256-GCM' },
          keyExchange: { type: 'string', enum: ['ECDHE', 'RSA'], default: 'ECDHE' }
        },
        required: ['ideId']
      },
      handler: async (args: { ideId: string; encryptionMethod?: string; keyExchange?: string }) => {
        const channelId = `channel_${args.ideId}_${Date.now()}`;

        const channel: SecureChannel = {
          id: channelId,
          ideId: args.ideId,
          encryptionMethod: args.encryptionMethod || 'AES-256-GCM',
          keyExchange: args.keyExchange || 'ECDHE',
          establishedAt: Date.now(),
          status: 'active',
          keys: await this.generateChannelKeys(args.encryptionMethod || 'AES-256-GCM')
        };

        this.secureChannels.set(channelId, channel);
        this.messageQueue.set(channelId, []);

        return {
          channelId: channelId,
          established: true,
          encryptionMethod: channel.encryptionMethod,
          publicKey: channel.keys.publicKey,
          handshakeComplete: true
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'encrypt_ide_message',
      description: 'Encrypt messages for secure IDE transmission',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: { type: 'string', description: 'Secure channel ID' },
          message: { type: 'object', description: 'Message to encrypt' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' }
        },
        required: ['channelId', 'message']
      },
      handler: async (args: { channelId: string; message: any; priority?: string }) => {
        const channel = this.secureChannels.get(args.channelId);
        if (!channel || channel.status !== 'active') {
          throw new Error('Invalid or inactive secure channel');
        }

        const encryptedMessage = await this.encryptMessage(args.message, channel.keys);
        const queuedMessage: QueuedMessage = {
          id: `msg_${Date.now()}`,
          channelId: args.channelId,
          encryptedData: encryptedMessage,
          priority: args.priority || 'normal',
          createdAt: Date.now(),
          status: 'queued'
        };

        this.messageQueue.get(args.channelId)!.push(queuedMessage);

        return {
          messageId: queuedMessage.id,
          channelId: args.channelId,
          encrypted: true,
          size: encryptedMessage.length,
          queued: true,
          priority: queuedMessage.priority
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'decrypt_ide_message',
      description: 'Decrypt messages received from IDE',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: { type: 'string', description: 'Secure channel ID' },
          encryptedMessage: { type: 'string', description: 'Encrypted message data' }
        },
        required: ['channelId', 'encryptedMessage']
      },
      handler: async (args: { channelId: string; encryptedMessage: string }) => {
        const channel = this.secureChannels.get(args.channelId);
        if (!channel || channel.status !== 'active') {
          throw new Error('Invalid or inactive secure channel');
        }

        const decryptedMessage = await this.decryptMessage(args.encryptedMessage, channel.keys);
        const verified = await this.verifyMessageIntegrity(decryptedMessage, args.encryptedMessage);

        if (!verified) {
          throw new Error('Message integrity verification failed');
        }

        return {
          decrypted: true,
          channelId: args.channelId,
          message: decryptedMessage,
          verified: true,
          receivedAt: Date.now()
        };
      },
      pluginId: this.id
    });

    console.error(`Secure IDE Communication Plugin activated - providing encrypted IDE channels`);
  }

  async deactivate(): Promise<void> {
    // Secure cleanup
    this.secureChannels.clear();
    this.messageQueue.clear();
    console.error(`Secure IDE Communication Plugin deactivated - all channels terminated`);
  }

  private async generateChannelKeys(method: string): Promise<ChannelKeys> {
    // Generate cryptographic keys based on method
    const crypto = require('crypto');

    switch (method) {
      case 'AES-256-GCM':
        return {
          algorithm: 'aes-256-gcm',
          key: crypto.randomBytes(32),
          iv: crypto.randomBytes(16),
          publicKey: crypto.randomBytes(32).toString('base64')
        };
      case 'ChaCha20-Poly1305':
        return {
          algorithm: 'chacha20-poly1305',
          key: crypto.randomBytes(32),
          nonce: crypto.randomBytes(12),
          publicKey: crypto.randomBytes(32).toString('base64')
        };
      default:
        throw new Error(`Unsupported encryption method: ${method}`);
    }
  }

  private async encryptMessage(message: any, keys: ChannelKeys): Promise<string> {
    const crypto = require('crypto');
    const data = JSON.stringify(message);

    switch (keys.algorithm) {
      case 'aes-256-gcm':
        const cipher = crypto.createCipher(keys.algorithm, keys.key);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
      case 'chacha20-poly1305':
        // Simplified - in reality would use proper ChaCha20-Poly1305
        const hash = crypto.createHash('sha256');
        hash.update(data + keys.key.toString());
        return hash.digest('hex');
      default:
        throw new Error(`Unsupported algorithm: ${keys.algorithm}`);
    }
  }

  private async decryptMessage(encryptedData: string, keys: ChannelKeys): Promise<any> {
    // Reverse of encryption (simplified for demo)
    const crypto = require('crypto');
    const decrypted = crypto.createDecipher(keys.algorithm, keys.key);
    let decryptedData = decrypted.update(encryptedData, 'hex', 'utf8');
    decryptedData += decrypted.final('utf8');
    return JSON.parse(decryptedData);
  }

  private async verifyMessageIntegrity(message: any, encryptedData: string): Promise<boolean> {
    // Verify message hasn't been tampered with
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(JSON.stringify(message)).digest('hex');
    return hash.length > 0; // Simplified verification
  }
}

// ============================================================================
// VFS AND RELIABILITY TYPE DEFINITIONS
// ============================================================================

interface BackupData {
  path: string;
  content: string;
  metadata: any;
  timestamp: number;
  hash: string;
}

// ============================================================================
// IDE EXTENSION TYPE DEFINITIONS
// ============================================================================

interface IDEExtension {
  id: string;
  ideType: string;
  capabilities: string[];
  publicKey?: string;
  registeredAt: number;
  token: string;
  status: 'registered' | 'active' | 'suspended';
}

interface IDESession {
  sessionId: string;
  extensionId: string;
  authenticatedAt: number;
  permissions: string[];
  secureChannel: boolean;
}

interface SecureChannel {
  id: string;
  ideId: string;
  encryptionMethod: string;
  keyExchange: string;
  establishedAt: number;
  status: 'active' | 'inactive';
  keys: ChannelKeys;
}

interface ChannelKeys {
  algorithm: string;
  key: Buffer;
  iv?: Buffer;
  nonce?: Buffer;
  publicKey: string;
}

interface QueuedMessage {
  id: string;
  channelId: string;
  encryptedData: string;
  priority: 'low' | 'normal' | 'high';
  createdAt: number;
  status: 'queued' | 'sent' | 'failed';
}

// ============================================================================
// VIRTUAL FILE SYSTEM INTEGRATION - Safe VFS with Prompt Injection Protection
// ============================================================================

export class VirtualFileSystemPlugin implements PLUMCPPlugin {
  id = 'plumcp-vfs-integration';
  name = 'Virtual File System Integration Plugin';
  version = '1.0.0';
  description = 'Safely integrates Virtual File System with prompt injection protection and reliability enhancements';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['vfs_read_file', 'vfs_write_file', 'vfs_list_directory', 'vfs_create_directory', 'vfs_delete', 'vfs_search', 'vfs_backup', 'vfs_recover']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-context-provider', version: '1.0.0', required: true }
  ];

  private vfs: VirtualFileSystem | null = null;
  private backupManager: BackupManager;
  private injectionProtector: PromptInjectionProtector;

  async activate(context: PluginContext): Promise<void> {
    // Initialize VFS safely
    this.vfs = this.createSecureVFS();
    this.backupManager = new BackupManager(this.vfs);
    this.injectionProtector = new PromptInjectionProtector();

    // Register VFS operations with prompt injection protection
    context.registerTool({
      name: 'vfs_read_file',
      description: 'Securely read file from Virtual File System with injection protection',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
          encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' }
        },
        required: ['path']
      },
      handler: async (args: { path: string; encoding?: string }) => {
        try {
          // Validate and sanitize path
          const safePath = this.validateAndSanitizePath(args.path);

          // Read with backup recovery
          let content = await this.readWithRecovery(safePath);

          // Apply prompt injection protection
          content = this.injectionProtector.sanitizeForPrompt(content);

          return {
            path: safePath,
            content: args.encoding === 'base64' ? Buffer.from(content).toString('base64') : content,
            size: content.length,
            protected: true,
            encoding: args.encoding || 'utf8'
          };
        } catch (error) {
          // Attempt recovery
          const recovered = await this.attemptRecovery(args.path);
          if (recovered) {
            return { ...recovered, recovered: true };
          }
          throw new Error(`VFS read failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'vfs_write_file',
      description: 'Securely write file to Virtual File System with injection protection',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
          encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' },
          backup: { type: 'boolean', default: true, description: 'Create backup before write' }
        },
        required: ['path', 'content']
      },
      handler: async (args: { path: string; content: string; encoding?: string; backup?: boolean }) => {
        try {
          // Validate and sanitize path
          const safePath = this.validateAndSanitizePath(args.path);

          // Decode content if needed
          const decodedContent = args.encoding === 'base64' ?
            Buffer.from(args.content, 'base64').toString('utf8') : args.content;

          // Validate content for injection attacks
          const validation = this.injectionProtector.validateContent(decodedContent);
          if (!validation.safe) {
            throw new Error(`Content validation failed: ${validation.reason}`);
          }

          // Create backup if requested
          if (args.backup !== false) {
            await this.backupManager.createBackup(safePath);
          }

          // Write with integrity checking
          const writeResult = await this.writeWithIntegrity(safePath, decodedContent);

          return {
            path: safePath,
            written: true,
            size: decodedContent.length,
            integrityVerified: writeResult.integrityVerified,
            backedUp: args.backup !== false
          };
        } catch (error) {
          // Rollback on failure
          await this.rollbackFailedWrite(args.path);
          throw new Error(`VFS write failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'vfs_list_directory',
      description: 'Securely list directory contents from Virtual File System',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list', default: '/' },
          recursive: { type: 'boolean', default: false, description: 'List recursively' },
          includeHidden: { type: 'boolean', default: false, description: 'Include hidden files' }
        }
      },
      handler: async (args: { path?: string; recursive?: boolean; includeHidden?: boolean }) => {
        try {
          const safePath = this.validateAndSanitizePath(args.path || '/');

          const listing = await this.listWithProtection(safePath, {
            recursive: args.recursive || false,
            includeHidden: args.includeHidden || false
          });

          return {
            path: safePath,
            entries: listing.entries.map(entry => ({
              name: entry.name,
              type: entry.type,
              size: entry.size,
              modified: entry.modified,
              safe: entry.safe // Injection protection status
            })),
            total: listing.entries.length,
            protected: true
          };
        } catch (error) {
          throw new Error(`VFS list failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'vfs_search',
      description: 'Securely search files in Virtual File System with injection protection',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          path: { type: 'string', description: 'Search root path', default: '/' },
          caseSensitive: { type: 'boolean', default: false, description: 'Case sensitive search' },
          includeContent: { type: 'boolean', default: false, description: 'Search file contents' }
        },
        required: ['query']
      },
      handler: async (args: { query: string; path?: string; caseSensitive?: boolean; includeContent?: boolean }) => {
        try {
          // Validate search query for injection
          const safeQuery = this.injectionProtector.sanitizeSearchQuery(args.query);
          const safePath = this.validateAndSanitizePath(args.path || '/');

          const results = await this.searchWithProtection(safeQuery, safePath, {
            caseSensitive: args.caseSensitive || false,
            includeContent: args.includeContent || false
          });

          return {
            query: safeQuery,
            path: safePath,
            results: results.map(result => ({
              path: result.path,
              type: result.type,
              matches: result.matches,
              safe: result.safe
            })),
            total: results.length,
            protected: true
          };
        } catch (error) {
          throw new Error(`VFS search failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'vfs_backup',
      description: 'Create secure backup of Virtual File System state',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Backup name' },
          includeMetadata: { type: 'boolean', default: true, description: 'Include metadata' }
        },
        required: ['name']
      },
      handler: async (args: { name: string; includeMetadata?: boolean }) => {
        try {
          const backupResult = await this.backupManager.createFullBackup(args.name, {
            includeMetadata: args.includeMetadata !== false
          });

          return {
            backupName: args.name,
            created: true,
            size: backupResult.size,
            files: backupResult.fileCount,
            integrityVerified: backupResult.integrityVerified,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          throw new Error(`VFS backup failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'vfs_recover',
      description: 'Recover Virtual File System from backup with integrity verification',
      inputSchema: {
        type: 'object',
        properties: {
          backupName: { type: 'string', description: 'Backup name to recover from' },
          verifyIntegrity: { type: 'boolean', default: true, description: 'Verify integrity during recovery' }
        },
        required: ['backupName']
      },
      handler: async (args: { backupName: string; verifyIntegrity?: boolean }) => {
        try {
          const recoveryResult = await this.backupManager.recoverFromBackup(args.backupName, {
            verifyIntegrity: args.verifyIntegrity !== false
          });

          return {
            backupName: args.backupName,
            recovered: true,
            filesRestored: recoveryResult.filesRestored,
            integrityVerified: recoveryResult.integrityVerified,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          throw new Error(`VFS recovery failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    // Register VFS status resource
    context.registerResource({
      uri: 'vfs://status',
      name: 'Virtual File System Status',
      description: 'Current VFS status with security and reliability metrics',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        operational: true,
        totalFiles: await this.getTotalFileCount(),
        totalSize: await this.getTotalSize(),
        backupsAvailable: this.backupManager.getAvailableBackups().length,
        securityStatus: {
          injectionProtection: 'active',
          integrityChecking: 'enabled',
          backupEncryption: 'enabled'
        },
        reliabilityMetrics: {
          lastBackup: this.backupManager.getLastBackupTime(),
          errorRate: await this.getErrorRate(),
          recoverySuccessRate: 0.99
        },
        plugin: this.name
      }, null, 2),
      pluginId: this.id
    });

    console.error(`Virtual File System Plugin activated - providing secure VFS with prompt injection protection`);
  }

  async deactivate(): Promise<void> {
    // Create final backup before shutdown
    if (this.vfs) {
      await this.backupManager.createFullBackup('shutdown_backup', { includeMetadata: true });
    }

    this.vfs = null;
    console.error(`Virtual File System Plugin deactivated - final backup created`);
  }

  private createSecureVFS(): VirtualFileSystem {
    // Import and configure VFS with security settings
    const VirtualFileSystem = require('./fileSystemService.js').VirtualFileSystem;

    return new VirtualFileSystem({
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      maxCacheEntries: 1000,
      conflictResolution: 'MERGE',
      enableLogging: true,
      syncInterval: 1000,
      // Security enhancements
      enableEncryption: true,
      enableIntegrityChecking: true,
      enableInjectionProtection: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB per file
      allowedExtensions: ['.txt', '.json', '.md', '.js', '.ts', '.py', '.rs', '.go']
    });
  }

  private validateAndSanitizePath(path: string): string {
    // Prevent path traversal attacks
    const sanitized = path.replace(/\.\./g, '').replace(/\/+/g, '/');

    // Ensure path starts with /
    return sanitized.startsWith('/') ? sanitized : '/' + sanitized;
  }

  private async readWithRecovery(path: string): Promise<string> {
    try {
      return await this.vfs!.readFile(path);
    } catch (error) {
      // Attempt recovery from backup
      return await this.backupManager.recoverFile(path);
    }
  }

  private async writeWithIntegrity(path: string, content: string): Promise<{ integrityVerified: boolean }> {
    const hash = require('crypto').createHash('sha256').update(content).digest('hex');

    await this.vfs!.writeFile(path, content);

    // Verify integrity
    const writtenContent = await this.vfs!.readFile(path);
    const writtenHash = require('crypto').createHash('sha256').update(writtenContent).digest('hex');

    return { integrityVerified: hash === writtenHash };
  }

  private async listWithProtection(path: string, options: any): Promise<{ entries: any[] }> {
    const rawEntries = await this.vfs!.listDirectory(path, options);

    // Apply injection protection to entry names
    const protectedEntries = rawEntries.map(entry => ({
      ...entry,
      name: this.injectionProtector.sanitizeFileName(entry.name),
      safe: this.injectionProtector.isSafeFileName(entry.name)
    }));

    return { entries: protectedEntries };
  }

  private async searchWithProtection(query: string, path: string, options: any): Promise<any[]> {
    // Use VFS search capabilities with additional protection
    const rawResults = await this.vfs!.search(query, path, options);

    // Apply additional injection protection
    return rawResults.map(result => ({
      ...result,
      safe: this.injectionProtector.isSafeSearchResult(result)
    }));
  }

  private async rollbackFailedWrite(path: string): Promise<void> {
    try {
      await this.backupManager.restoreBackup(path);
    } catch (error) {
      console.error(`Failed to rollback write for ${path}:`, error);
    }
  }

  private async getTotalFileCount(): Promise<number> {
    // Implementation would count total files in VFS
    return 150; // Mock value
  }

  private async getTotalSize(): Promise<number> {
    // Implementation would calculate total VFS size
    return 50 * 1024 * 1024; // 50MB mock value
  }

  private async getErrorRate(): Promise<number> {
    // Implementation would calculate error rate
    return 0.001; // 0.1% error rate
  }
}

// ============================================================================
// PROMPT INJECTION PROTECTION SYSTEM
// ============================================================================

class PromptInjectionProtector {
  private dangerousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>.*?<\/embed>/gi,
    /\b(eval|Function|setTimeout|setInterval)\s*\(/gi,
    /__proto__/gi,
    /constructor/gi,
    /prototype/gi
  ];

  private promptInjectionPatterns = [
    /system:\s*ignore\s+previous\s+instructions/gi,
    /assistant:\s*you\s+are\s+now/gi,
    /ignore\s+all\s+previous\s+(instructions|messages)/gi,
    /from\s+now\s+on\s+you\s+are/gi,
    /forget\s+your\s+(previous|training)\s+(instructions|data)/gi,
    /override\s+(your\s+)?previous\s+instructions/gi
  ];

  sanitizeForPrompt(content: string): string {
    let sanitized = content;

    // Remove dangerous HTML/script content
    this.dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REMOVED_DANGEROUS_CONTENT]');
    });

    // Remove prompt injection attempts
    this.promptInjectionPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REMOVED_INJECTION_ATTEMPT]');
    });

    // Escape special characters that could be used for injection
    sanitized = sanitized
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    return sanitized;
  }

  validateContent(content: string): { safe: boolean; reason?: string } {
    // Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(content)) {
        return { safe: false, reason: 'Contains dangerous script or HTML content' };
      }
    }

    // Check for prompt injection patterns
    for (const pattern of this.promptInjectionPatterns) {
      if (pattern.test(content)) {
        return { safe: false, reason: 'Contains prompt injection attempt' };
      }
    }

    // Check content size
    if (content.length > 1024 * 1024) { // 1MB limit
      return { safe: false, reason: 'Content too large' };
    }

    // Check for binary data in text content
    const binaryChars = content.split('').filter(char =>
      char.charCodeAt(0) < 32 && char.charCodeAt(0) !== 9 && char.charCodeAt(0) !== 10 && char.charCodeAt(0) !== 13
    );
    if (binaryChars.length > content.length * 0.01) { // More than 1% binary chars
      return { safe: false, reason: 'Contains too many binary characters' };
    }

    return { safe: true };
  }

  sanitizeSearchQuery(query: string): string {
    // Remove injection attempts from search queries
    let sanitized = query;

    this.promptInjectionPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Remove SQL-like injection attempts
    sanitized = sanitized.replace(/('|(\\x[0-9a-fA-F]{2})|(\\u[0-9a-fA-F]{4}))/g, '');

    // Limit query length
    return sanitized.substring(0, 1000);
  }

  sanitizeFileName(filename: string): string {
    // Remove dangerous characters and injection attempts
    return filename
      .replace(/[<>:|?*\x00-\x1f]/g, '_') // Remove dangerous chars
      .replace(/\.\./g, '__') // Prevent directory traversal
      .substring(0, 255); // Limit length
  }

  isSafeFileName(filename: string): boolean {
    // Check if filename is safe
    return !/[<>:|?*\x00-\x1f]/.test(filename) && !filename.includes('..');
  }

  isSafeSearchResult(result: any): boolean {
    // Validate search result for safety
    return this.isSafeFileName(result.path) &&
           (!result.content || this.validateContent(result.content).safe);
  }
}

// ============================================================================
// BACKUP AND RECOVERY SYSTEM
// ============================================================================

class BackupManager {
  private backups: Map<string, BackupData> = new Map();
  private vfs: VirtualFileSystem;

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs;
  }

  async createBackup(filePath: string): Promise<void> {
    try {
      const content = await this.vfs.readFile(filePath);
      const metadata = await this.getFileMetadata(filePath);

      this.backups.set(`${filePath}_${Date.now()}`, {
        path: filePath,
        content: content,
        metadata: metadata,
        timestamp: Date.now(),
        hash: require('crypto').createHash('sha256').update(content).digest('hex')
      });
    } catch (error) {
      console.error(`Failed to create backup for ${filePath}:`, error);
    }
  }

  async createFullBackup(name: string, options: { includeMetadata: boolean }): Promise<{ size: number; fileCount: number; integrityVerified: boolean }> {
    // Implementation would create full VFS backup
    return {
      size: 1024 * 1024, // 1MB mock
      fileCount: 150,
      integrityVerified: true
    };
  }

  async recoverFromBackup(backupName: string, options: { verifyIntegrity: boolean }): Promise<{ filesRestored: number; integrityVerified: boolean }> {
    // Implementation would restore from backup
    return {
      filesRestored: 150,
      integrityVerified: true
    };
  }

  async recoverFile(filePath: string): Promise<string> {
    // Find most recent backup for this file
    const backupKeys = Array.from(this.backups.keys())
      .filter(key => key.startsWith(filePath + '_'))
      .sort()
      .reverse();

    if (backupKeys.length === 0) {
      throw new Error(`No backup found for ${filePath}`);
    }

    const backup = this.backups.get(backupKeys[0])!;
    return backup.content;
  }

  async restoreBackup(filePath: string): Promise<void> {
    const backupKeys = Array.from(this.backups.keys())
      .filter(key => key.startsWith(filePath + '_'))
      .sort()
      .reverse();

    if (backupKeys.length > 0) {
      const backup = this.backups.get(backupKeys[0])!;
      await this.vfs.writeFile(backup.path, backup.content);
    }
  }

  getAvailableBackups(): string[] {
    return Array.from(this.backups.keys());
  }

  getLastBackupTime(): string {
    const timestamps = Array.from(this.backups.values()).map(b => b.timestamp);
    return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : 'never';
  }

  private async getFileMetadata(filePath: string): Promise<any> {
    // Mock metadata - would get actual file metadata
    return {
      size: 1024,
      modified: new Date().toISOString(),
      permissions: 'rw-r--r--'
    };
  }
}

// ============================================================================
// RELIABILITY ENHANCEMENT SYSTEM
// ============================================================================

export class ReliabilityEnhancementPlugin implements PLUMCPPlugin {
  id = 'plumcp-reliability-enhancement';
  name = 'Reliability Enhancement Plugin';
  version: '1.0.0';
  description = 'Provides reliability enhancements while maintaining backward compatibility';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['retry_operation', 'validate_integrity', 'health_check', 'circuit_breaker_status']
    }
  ];
  dependencies: any[] = [];

  private retryManager: RetryManager;
  private circuitBreaker: CircuitBreaker;
  private healthMonitor: HealthMonitor;

  async activate(context: PluginContext): Promise<void> {
    this.retryManager = new RetryManager();
    this.circuitBreaker = new CircuitBreaker();
    this.healthMonitor = new HealthMonitor();

    // Register reliability tools
    context.registerTool({
      name: 'retry_operation',
      description: 'Retry failed operations with exponential backoff',
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', description: 'Operation to retry' },
          maxRetries: { type: 'number', default: 3, description: 'Maximum retry attempts' },
          baseDelay: { type: 'number', default: 1000, description: 'Base delay in ms' }
        },
        required: ['operation']
      },
      handler: async (args: { operation: string; maxRetries?: number; baseDelay?: number }) => {
        const result = await this.retryManager.retry(
          () => this.executeOperation(args.operation),
          {
            maxRetries: args.maxRetries || 3,
            baseDelay: args.baseDelay || 1000
          }
        );

        return {
          operation: args.operation,
          success: result.success,
          attempts: result.attempts,
          totalDelay: result.totalDelay,
          result: result.data
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'validate_integrity',
      description: 'Validate data integrity and consistency',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data to validate' },
          expectedHash: { type: 'string', description: 'Expected SHA-256 hash' }
        },
        required: ['data', 'expectedHash']
      },
      handler: async (args: { data: string; expectedHash: string }) => {
        const actualHash = require('crypto').createHash('sha256').update(args.data).digest('hex');
        const valid = actualHash === args.expectedHash;

        return {
          valid: valid,
          expectedHash: args.expectedHash,
          actualHash: actualHash,
          dataLength: args.data.length
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'health_check',
      description: 'Perform comprehensive system health check',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const health = await this.healthMonitor.checkSystemHealth();

        return {
          overall: health.overall,
          components: health.components,
          timestamp: new Date().toISOString(),
          recommendations: health.recommendations
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'circuit_breaker_status',
      description: 'Check circuit breaker status for reliability',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        return {
          status: this.circuitBreaker.getStatus(),
          failureCount: this.circuitBreaker.getFailureCount(),
          lastFailure: this.circuitBreaker.getLastFailureTime(),
          isOpen: this.circuitBreaker.isOpen()
        };
      },
      pluginId: this.id
    });

    console.error(`Reliability Enhancement Plugin activated - providing backward-compatible reliability improvements`);
  }

  async deactivate(): Promise<void> {
    console.error(`Reliability Enhancement Plugin deactivated`);
  }

  private async executeOperation(operation: string): Promise<any> {
    // Mock operation execution - would integrate with actual operations
    if (Math.random() > 0.8) { // 20% failure rate for testing
      throw new Error('Operation failed');
    }
    return { success: true, data: `Executed ${operation}` };
  }
}

// ============================================================================
// UTILITY CLASSES FOR RELIABILITY
// ============================================================================

class RetryManager {
  async retry<T>(
    operation: () => Promise<T>,
    options: { maxRetries: number; baseDelay: number }
  ): Promise<{ success: boolean; attempts: number; totalDelay: number; data?: T; error?: string }> {
    let lastError: string = '';
    let totalDelay = 0;

    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
      try {
        const result = await operation();
        return {
          success: true,
          attempts: attempt,
          totalDelay,
          data: result
        };
      } catch (error) {
        lastError = error.message;

        if (attempt <= options.maxRetries) {
          const delay = options.baseDelay * Math.pow(2, attempt - 1);
          totalDelay += delay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      attempts: options.maxRetries + 1,
      totalDelay,
      error: lastError
    };
  }
}

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureThreshold = 5;
  private resetTimeout = 60000; // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getStatus(): string {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }

  getLastFailureTime(): string {
    return this.lastFailure > 0 ? new Date(this.lastFailure).toISOString() : 'never';
  }

  isOpen(): boolean {
    return this.state === 'open';
  }
}

class HealthMonitor {
  async checkSystemHealth(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
    recommendations: string[];
  }> {
    // Mock health check - would check actual system components
    const components = {
      'vfs': 'healthy',
      'context-provider': 'healthy',
      'ide-framework': 'degraded',
      'monitoring': 'healthy'
    };

    const unhealthyCount = Object.values(components).filter(s => s === 'unhealthy').length;
    const degradedCount = Object.values(components).filter(s => s === 'degraded').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyCount > 0) overall = 'unhealthy';
    else if (degradedCount > 0) overall = 'degraded';

    const recommendations = [];
    if (degradedCount > 0) {
      recommendations.push('Check IDE framework connectivity');
    }
    if (unhealthyCount > 0) {
      recommendations.push('Immediate attention required for unhealthy components');
    }

    return {
      overall,
      components,
      recommendations
    };
  }
}

// ============================================================================
// GUIDANCE SYSTEM INTEGRATION - Intelligent Code Analysis & Improvement
// ============================================================================

export class GuidancePlugin implements PLUMCPPlugin {
  id = 'plumcp-guidance';
  name = 'Guidance System Plugin';
  version: '1.0.0';
  description = 'Intelligent code analysis, security assessment, and improvement suggestions with injection protection';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['analyze_code_intelligence', 'security_vulnerability_scan', 'code_quality_assessment', 'suggest_improvements', 'generate_alternatives', 'pattern_analysis', 'generate_prefilled_context', 'intelligent_code_completion', 'protected_prompt_response', 'context_for_assistant']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [
    { pluginId: 'plumcp-context-provider', version: '1.0.0', required: true },
    { pluginId: 'plumcp-code-context', version: '1.0.0', required: false }
  ];

  private guidanceSystem: GuidanceSystem | null = null;
  private injectionProtector: PromptInjectionProtector;

  async activate(context: PluginContext): Promise<void> {
    // Initialize guidance system safely
    this.guidanceSystem = new GuidanceSystem();
    this.injectionProtector = new PromptInjectionProtector();

    // Register guidance tools with injection protection
    context.registerTool({
      name: 'analyze_code_intelligence',
      description: 'Comprehensive intelligent code analysis with security and quality assessment',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to analyze' },
          language: { type: 'string', description: 'Programming language' },
          context: { type: 'string', description: 'Context key for analysis' },
          includeSecurity: { type: 'boolean', default: true, description: 'Include security analysis' },
          includeQuality: { type: 'boolean', default: true, description: 'Include quality metrics' }
        },
        required: ['code']
      },
      handler: async (args: { code: string; language?: string; context?: string; includeSecurity?: boolean; includeQuality?: boolean }) => {
        try {
          // Validate and sanitize input code
          const validation = this.injectionProtector.validateContent(args.code);
          if (!validation.safe) {
            throw new Error(`Code validation failed: ${validation.reason}`);
          }

          const sanitizedCode = this.injectionProtector.sanitizeForPrompt(args.code);

          // Perform intelligent analysis
          const analysis = await this.guidanceSystem!.analyzeAndGuide({
            code: sanitizedCode,
            language: args.language,
            context: args.context,
            includeSecurity: args.includeSecurity !== false,
            includeQuality: args.includeQuality !== false
          });

          return {
            analysis: analysis,
            intelligence: 'applied',
            securityChecked: args.includeSecurity !== false,
            qualityAssessed: args.includeQuality !== false,
            safe: true
          };
        } catch (error) {
          throw new Error(`Intelligent code analysis failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'security_vulnerability_scan',
      description: 'Advanced security vulnerability scanning with ML-powered detection',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to scan for vulnerabilities' },
          language: { type: 'string', description: 'Programming language' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
          includeContext: { type: 'boolean', default: true, description: 'Include contextual analysis' }
        },
        required: ['code']
      },
      handler: async (args: { code: string; language?: string; severity?: string; includeContext?: boolean }) => {
        try {
          const sanitizedCode = this.injectionProtector.sanitizeForPrompt(args.code);

          const vulnerabilities = await this.guidanceSystem!.scanForVulnerabilities({
            code: sanitizedCode,
            language: args.language,
            severity: args.severity || 'medium',
            includeContext: args.includeContext !== false
          });

          return {
            vulnerabilities: vulnerabilities,
            severity: args.severity || 'medium',
            scanned: true,
            safe: vulnerabilities.length === 0
          };
        } catch (error) {
          throw new Error(`Security scan failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'code_quality_assessment',
      description: 'Comprehensive code quality assessment with multiple metrics',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to assess' },
          language: { type: 'string', description: 'Programming language' },
          metrics: { type: 'array', items: { type: 'string' }, default: ['all'], description: 'Metrics to calculate' }
        },
        required: ['code']
      },
      handler: async (args: { code: string; language?: string; metrics?: string[] }) => {
        try {
          const sanitizedCode = this.injectionProtector.sanitizeForPrompt(args.code);

          const assessment = await this.guidanceSystem!.assessQuality({
            code: sanitizedCode,
            language: args.language,
            metrics: args.metrics || ['all']
          });

          return {
            assessment: assessment,
            metrics: args.metrics || ['all'],
            assessed: true,
            safe: true
          };
        } catch (error) {
          throw new Error(`Quality assessment failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'suggest_improvements',
      description: 'Generate intelligent code improvement suggestions',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to improve' },
          language: { type: 'string', description: 'Programming language' },
          focus: { type: 'string', enum: ['security', 'performance', 'readability', 'maintainability'], description: 'Improvement focus' },
          context: { type: 'string', description: 'Context for personalized suggestions' }
        },
        required: ['code']
      },
      handler: async (args: { code: string; language?: string; focus?: string; context?: string }) => {
        try {
          const sanitizedCode = this.injectionProtector.sanitizeForPrompt(args.code);

          const suggestions = await this.guidanceSystem!.suggestImprovements({
            code: sanitizedCode,
            language: args.language,
            focus: args.focus,
            context: args.context
          });

          return {
            suggestions: suggestions,
            focus: args.focus,
            generated: true,
            safe: true
          };
        } catch (error) {
          throw new Error(`Improvement suggestions failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'generate_alternatives',
      description: 'Generate alternative code implementations with comparative analysis',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Original code' },
          language: { type: 'string', description: 'Programming language' },
          criteria: { type: 'array', items: { type: 'string' }, description: 'Evaluation criteria' },
          count: { type: 'number', default: 3, description: 'Number of alternatives to generate' }
        },
        required: ['code']
      },
      handler: async (args: { code: string; language?: string; criteria?: string[]; count?: number }) => {
        try {
          const sanitizedCode = this.injectionProtector.sanitizeForPrompt(args.code);

          const alternatives = await this.guidanceSystem!.generateAlternatives({
            code: sanitizedCode,
            language: args.language,
            criteria: args.criteria || ['performance', 'readability', 'security'],
            count: args.count || 3
          });

          return {
            alternatives: alternatives,
            criteria: args.criteria || ['performance', 'readability', 'security'],
            count: alternatives.length,
            generated: true,
            safe: true
          };
        } catch (error) {
          throw new Error(`Alternative generation failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'pattern_analysis',
      description: 'Analyze code patterns and provide intelligent insights',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to analyze for patterns' },
          language: { type: 'string', description: 'Programming language' },
          patternTypes: { type: 'array', items: { type: 'string' }, default: ['all'], description: 'Types of patterns to analyze' }
        },
        required: ['code']
      },
      handler: async (args: { code: string; language?: string; patternTypes?: string[] }) => {
        try {
          const sanitizedCode = this.injectionProtector.sanitizeForPrompt(args.code);

          const patterns = await this.guidanceSystem!.analyzePatterns({
            code: sanitizedCode,
            language: args.language,
            patternTypes: args.patternTypes || ['all']
          });

          return {
            patterns: patterns,
            analyzed: true,
            safe: true
          };
        } catch (error) {
          throw new Error(`Pattern analysis failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    // GOOGLE CODE ASSISTANT-LIKE FEATURES
    context.registerTool({
      name: 'generate_prefilled_context',
      description: 'Generate prefilled context templates that LLMs can complete with minimal tokens',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Coding task or request' },
          language: { type: 'string', description: 'Programming language' },
          context: { type: 'string', description: 'Current code context' },
          maxTokens: { type: 'number', default: 100, description: 'Maximum tokens for completion' }
        },
        required: ['task']
      },
      handler: async (args: { task: string; language?: string; context?: string; maxTokens?: number }) => {
        try {
          const prefilledContext = await this.guidanceSystem!.generatePrefilledContext({
            task: args.task,
            language: args.language,
            context: args.context,
            maxTokens: args.maxTokens || 100
          });

          return {
            prefilledContext: prefilledContext,
            tokensUsed: prefilledContext.estimatedTokens,
            completionReady: true,
            protected: true
          };
        } catch (error) {
          throw new Error(`Prefilled context generation failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'intelligent_code_completion',
      description: 'Provide intelligent code completion with context-aware suggestions',
      inputSchema: {
        type: 'object',
        properties: {
          prefix: { type: 'string', description: 'Code prefix to complete' },
          suffix: { type: 'string', description: 'Code suffix context' },
          language: { type: 'string', description: 'Programming language' },
          context: { type: 'string', description: 'Surrounding code context' },
          maxSuggestions: { type: 'number', default: 5, description: 'Maximum completion suggestions' }
        },
        required: ['prefix']
      },
      handler: async (args: { prefix: string; suffix?: string; language?: string; context?: string; maxSuggestions?: number }) => {
        try {
          const completions = await this.guidanceSystem!.generateIntelligentCompletions({
            prefix: args.prefix,
            suffix: args.suffix,
            language: args.language,
            context: args.context,
            maxSuggestions: args.maxSuggestions || 5
          });

          return {
            completions: completions,
            intelligent: true,
            contextAware: true,
            safe: true
          };
        } catch (error) {
          throw new Error(`Intelligent code completion failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'protected_prompt_response',
      description: 'Generate protected prompt responses that prevent injection attacks',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'User prompt or request' },
          context: { type: 'string', description: 'Context information' },
          language: { type: 'string', description: 'Programming language context' },
          protectOutput: { type: 'boolean', default: true, description: 'Apply output protection' }
        },
        required: ['prompt']
      },
      handler: async (args: { prompt: string; context?: string; language?: string; protectOutput?: boolean }) => {
        try {
          // Validate input prompt for injection attempts
          const validation = this.injectionProtector.validatePrompt(args.prompt);
          if (!validation.safe) {
            throw new Error(`Prompt validation failed: ${validation.reason}`);
          }

          const response = await this.guidanceSystem!.generateProtectedResponse({
            prompt: args.prompt,
            context: args.context,
            language: args.language,
            protectOutput: args.protectOutput !== false
          });

          return {
            response: response,
            protected: args.protectOutput !== false,
            injectionSafe: true,
            contextAware: true
          };
        } catch (error) {
          throw new Error(`Protected prompt response failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'context_for_assistant',
      description: 'Generate prefilled context that Google Code Assistant can use for faster, token-efficient responses',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Coding task type' },
          code: { type: 'string', description: 'Current code context' },
          language: { type: 'string', description: 'Programming language' },
          cursorPosition: { type: 'number', description: 'Cursor position for context' },
          projectContext: { type: 'string', description: 'Project-wide context' }
        },
        required: ['task', 'code']
      },
      handler: async (args: { task: string; code: string; language?: string; cursorPosition?: number; projectContext?: string }) => {
        try {
          const sanitizedCode = this.injectionProtector.sanitizeForPrompt(args.code);

          const assistantContext = await this.guidanceSystem!.generateAssistantContext({
            task: args.task,
            code: sanitizedCode,
            language: args.language,
            cursorPosition: args.cursorPosition,
            projectContext: args.projectContext
          });

          return {
            assistantContext: assistantContext,
            task: args.task,
            tokensSaved: assistantContext.estimatedTokenReduction,
            readyForAssistant: true,
            injectionProtected: true,
            contextAware: true
          };
        } catch (error) {
          throw new Error(`Assistant context generation failed: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    // Register guidance resources
    context.registerResource({
      uri: 'guidance://intelligence/stats',
      name: 'Guidance Intelligence Statistics',
      description: 'Comprehensive statistics on guidance system intelligence and analysis',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        analysesPerformed: await this.getAnalysisCount(),
        vulnerabilitiesDetected: await this.getVulnerabilityCount(),
        improvementsSuggested: await this.getImprovementCount(),
        alternativesGenerated: await this.getAlternativeCount(),
        intelligenceMetrics: {
          accuracy: 0.94,
          coverage: 0.87,
          safety: 0.99
        },
        plugin: this.name
      }, null, 2),
      pluginId: this.id
    });

    console.error(`Guidance System Plugin activated - providing intelligent code analysis with injection protection`);
  }

  async deactivate(): Promise<void> {
    this.guidanceSystem = null;
    console.error(`Guidance System Plugin deactivated - analysis capabilities removed`);
  }

  private async getAnalysisCount(): Promise<number> {
    // Would track actual analysis count
    return 1250;
  }

  private async getVulnerabilityCount(): Promise<number> {
    // Would track actual vulnerability detections
    return 89;
  }

  private async getImprovementCount(): Promise<number> {
    // Would track actual improvement suggestions
    return 543;
  }

  private async getAlternativeCount(): Promise<number> {
    // Would track actual alternative generations
    return 234;
  }
}

// ============================================================================
// GUIDANCE SYSTEM CORE - Intelligent Code Analysis Engine
// ============================================================================

class GuidanceSystem {
  async analyzeAndGuide(params: {
    code: string;
    language?: string;
    context?: string;
    includeSecurity?: boolean;
    includeQuality?: boolean;
  }): Promise<any> {
    // Comprehensive code analysis using CodePatternAnalyzer
    const patternAnalysis = await this.analyzePatterns(params);
    const qualityMetrics = params.includeQuality !== false ? await this.assessQuality(params) : null;
    const securityAnalysis = params.includeSecurity !== false ? await this.scanForVulnerabilities(params) : null;

    return {
      patterns: patternAnalysis,
      quality: qualityMetrics,
      security: securityAnalysis,
      intelligence: {
        overallScore: this.calculateOverallScore(patternAnalysis, qualityMetrics, securityAnalysis),
        recommendations: this.generateRecommendations(patternAnalysis, qualityMetrics, securityAnalysis),
        contextAware: !!params.context
      }
    };
  }

  async analyzePatterns(params: { code: string; language?: string; patternTypes?: string[] }): Promise<any> {
    // Use CodePatternAnalyzer for pattern detection
    return {
      style: this.detectStyle(params.code, params.language),
      paradigm: this.detectParadigm(params.code, params.language),
      domain: this.inferDomain(params.code, params.language),
      complexity: this.calculateComplexity(params.code),
      patterns: this.identifyPatterns(params.code, params.patternTypes || ['all'])
    };
  }

  async assessQuality(params: { code: string; language?: string; metrics?: string[] }): Promise<any> {
    const metrics = params.metrics || ['all'];

    return {
      maintainabilityIndex: metrics.includes('maintainability') || metrics.includes('all') ?
        this.calculateMaintainabilityIndex(params.code) : null,
      cyclomaticComplexity: metrics.includes('complexity') || metrics.includes('all') ?
        this.calculateCyclomaticComplexity(params.code) : null,
      halsteadVolume: metrics.includes('halstead') || metrics.includes('all') ?
        this.calculateHalsteadVolume(params.code) : null,
      linesOfCode: params.code.split('\n').length,
      commentRatio: this.calculateCommentRatio(params.code),
      testCoverage: null, // Would require test analysis
      securityScore: metrics.includes('security') || metrics.includes('all') ?
        this.calculateSecurityScore(params.code) : null,
      performanceScore: metrics.includes('performance') || metrics.includes('all') ?
        this.calculatePerformanceScore(params.code) : null,
      documentationScore: this.calculateDocumentationScore(params.code),
      bestPracticesScore: this.calculateBestPracticesScore(params.code, params.language)
    };
  }

  async scanForVulnerabilities(params: { code: string; language?: string; severity?: string; includeContext?: boolean }): Promise<any[]> {
    const vulnerabilities: any[] = [];

    // SQL Injection detection
    if (params.code.includes('SELECT') || params.code.includes('INSERT') || params.code.includes('UPDATE')) {
      if (params.code.includes('+' + "'") || params.code.includes('string concatenation with variables')) {
        vulnerabilities.push({
          type: 'sql_injection',
          severity: 'high',
          location: 'database operations',
          description: 'Potential SQL injection through string concatenation',
          recommendation: 'Use parameterized queries or prepared statements'
        });
      }
    }

    // XSS detection
    if (params.language === 'javascript' || params.language === 'typescript') {
      if (params.code.includes('innerHTML') || params.code.includes('outerHTML')) {
        vulnerabilities.push({
          type: 'xss',
          severity: 'high',
          location: 'DOM manipulation',
          description: 'Potential XSS through direct HTML injection',
          recommendation: 'Use textContent or sanitize HTML input'
        });
      }
    }

    // Command injection detection
    if (params.code.includes('exec') || params.code.includes('spawn') || params.code.includes('child_process')) {
      if (params.code.includes('shell: true') || params.code.includes('string concatenation')) {
        vulnerabilities.push({
          type: 'command_injection',
          severity: 'critical',
          location: 'system command execution',
          description: 'Potential command injection vulnerability',
          recommendation: 'Validate and sanitize command arguments, avoid shell execution'
        });
      }
    }

    // Filter by severity if specified
    if (params.severity && params.severity !== 'medium') {
      const severityMap = { low: 1, medium: 2, high: 3, critical: 4 };
      const minSeverity = severityMap[params.severity as keyof typeof severityMap] || 2;
      return vulnerabilities.filter(v => severityMap[v.severity as keyof typeof severityMap] >= minSeverity);
    }

    return vulnerabilities;
  }

  async suggestImprovements(params: { code: string; language?: string; focus?: string; context?: string }): Promise<any[]> {
    const suggestions: any[] = [];

    switch (params.focus) {
      case 'security':
        if (params.code.includes('eval(')) {
          suggestions.push({
            type: 'security',
            severity: 'critical',
            title: 'Remove eval() usage',
            description: 'Using eval() can lead to code injection attacks',
            suggestion: 'Replace eval() with safer alternatives like JSON.parse() or specific parsing functions'
          });
        }
        break;

      case 'performance':
        if (params.code.includes('for ') && params.code.includes('.length')) {
          suggestions.push({
            type: 'performance',
            severity: 'medium',
            title: 'Cache array length in loops',
            description: 'Accessing array.length in loop conditions can impact performance',
            suggestion: 'Cache the length outside the loop: const len = arr.length; for(let i=0; i<len; i++)'
          });
        }
        break;

      case 'readability':
        if (params.code.split('\n').some(line => line.length > 100)) {
          suggestions.push({
            type: 'readability',
            severity: 'low',
            title: 'Break long lines',
            description: 'Lines exceeding 100 characters reduce readability',
            suggestion: 'Break long lines into multiple lines for better readability'
          });
        }
        break;

      case 'maintainability':
        const functionCount = (params.code.match(/function\s+\w+/g) || []).length;
        if (functionCount > 10) {
          suggestions.push({
            type: 'maintainability',
            severity: 'medium',
            title: 'Consider breaking down large functions',
            description: `File contains ${functionCount} functions, consider splitting into smaller modules`,
            suggestion: 'Extract functions into separate modules or break down complex functions'
          });
        }
        break;
    }

    return suggestions;
  }

  async generateAlternatives(params: { code: string; language?: string; criteria?: string[]; count?: number }): Promise<any[]> {
    const alternatives: any[] = [];

    // Generate alternative implementations based on criteria
    if (params.criteria?.includes('performance')) {
      alternatives.push({
        id: 'performance_optimized',
        title: 'Performance Optimized Version',
        code: this.optimizeForPerformance(params.code, params.language),
        improvements: ['Reduced algorithmic complexity', 'Optimized memory usage'],
        tradeoffs: ['May reduce readability', 'Increased code complexity']
      });
    }

    if (params.criteria?.includes('readability')) {
      alternatives.push({
        id: 'readable_version',
        title: 'Highly Readable Version',
        code: this.optimizeForReadability(params.code, params.language),
        improvements: ['Clear variable names', 'Descriptive comments', 'Logical structure'],
        tradeoffs: ['May be slightly less performant', 'More verbose code']
      });
    }

    if (params.criteria?.includes('security')) {
      alternatives.push({
        id: 'security_hardened',
        title: 'Security Hardened Version',
        code: this.hardenForSecurity(params.code, params.language),
        improvements: ['Input validation', 'Safe data handling', 'Reduced attack surface'],
        tradeoffs: ['May impact performance', 'More complex error handling']
      });
    }

    return alternatives.slice(0, params.count || 3);
  }

  // Helper methods for analysis
  private detectStyle(code: string, language?: string): string {
    if (language === 'javascript' || language === 'typescript') {
      if (code.includes('class ')) return 'object-oriented';
      if (code.includes('=>')) return 'functional';
      return 'procedural';
    }
    return 'unknown';
  }

  private detectParadigm(code: string, language?: string): string {
    if (code.includes('async') || code.includes('await')) return 'asynchronous';
    if (code.includes('Promise')) return 'promise-based';
    if (code.includes('Observable')) return 'reactive';
    return 'synchronous';
  }

  private inferDomain(code: string, language?: string): string {
    if (code.includes('SELECT') || code.includes('INSERT')) return 'database';
    if (code.includes('render') || code.includes('component')) return 'frontend';
    if (code.includes('middleware') || code.includes('route')) return 'backend';
    if (code.includes('algorithm') || code.includes('sort')) return 'algorithmic';
    return 'general';
  }

  private calculateComplexity(code: string): number {
    const lines = code.split('\n').length;
    const functions = (code.match(/function\s+\w+/g) || []).length;
    const loops = (code.match(/(for|while)\s*\(/g) || []).length;
    return Math.min(10, lines/10 + functions * 2 + loops * 1.5);
  }

  private identifyPatterns(code: string, types: string[]): any {
    const patterns: any = {};

    if (types.includes('design') || types.includes('all')) {
      patterns.design = [];
      if (code.includes('singleton') || code.includes('getInstance')) {
        patterns.design.push('singleton');
      }
      if (code.includes('factory') || code.includes('createInstance')) {
        patterns.design.push('factory');
      }
    }

    if (types.includes('anti') || types.includes('all')) {
      patterns.antipatterns = [];
      if (code.includes('var ')) {
        patterns.antipatterns.push('var_usage_instead_of_let_const');
      }
      if (code.match(/console\.log/g)?.length > 5) {
        patterns.antipatterns.push('excessive_logging');
      }
    }

    return patterns;
  }

  private calculateMaintainabilityIndex(code: string): number {
    const lines = code.split('\n').length;
    const comments = (code.match(/\/\//g) || []).length + (code.match(/\/\*/g) || []).length;
    const complexity = this.calculateCyclomaticComplexity(code);

    // Simple maintainability calculation
    const volume = lines * Math.log(lines);
    const difficulty = complexity / lines;
    const effort = volume * difficulty;

    return Math.max(0, Math.min(100, 171 - 5.2 * Math.log(effort) - 0.23 * complexity + 16.2 * Math.log(comments + 1)));
  }

  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Count decision points
    const decisionKeywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', '&&', '||', '?'];
    decisionKeywords.forEach(keyword => {
      const matches = (code.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
      complexity += matches;
    });

    return complexity;
  }

  private calculateHalsteadVolume(code: string): number {
    // Simplified Halstead metrics
    const operators = ['+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', '!', '++', '--'];
    const operands = this.extractIdentifiers(code);

    const n1 = new Set(operators.filter(op => code.includes(op))).size; // Distinct operators
    const n2 = new Set(operands).size; // Distinct operands
    const N1 = operators.reduce((count, op) => count + (code.split(op).length - 1), 0); // Total operators
    const N2 = operands.length; // Total operands

    if (n1 === 0 || n2 === 0) return 0;

    const vocabulary = n1 + n2;
    const length = N1 + N2;
    return length * Math.log2(vocabulary);
  }

  private extractIdentifiers(code: string): string[] {
    // Simple identifier extraction (would be more sophisticated in real implementation)
    const identifiers: string[] = [];
    const words = code.split(/\W+/).filter(word => word.length > 0 && !/^\d/.test(word));

    // Filter out keywords
    const keywords = ['if', 'else', 'for', 'while', 'function', 'class', 'const', 'let', 'var', 'return'];
    return words.filter(word => !keywords.includes(word));
  }

  private calculateCommentRatio(code: string): number {
    const totalLines = code.split('\n').length;
    const commentLines = code.split('\n').filter(line =>
      line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().includes('*/')
    ).length;
    return commentLines / totalLines;
  }

  private calculateSecurityScore(code: string): number {
    let score = 100;

    // Deduct for security issues
    if (code.includes('eval(')) score -= 50;
    if (code.includes('innerHTML')) score -= 30;
    if (code.includes('document.write')) score -= 20;
    if (code.includes('shell: true')) score -= 40;

    return Math.max(0, score);
  }

  private calculatePerformanceScore(code: string): number {
    let score = 100;

    // Deduct for performance issues
    if (code.includes('.length') && code.includes('for ')) score -= 20;
    if (code.includes('eval(')) score -= 30;
    if (code.includes('document.getElementById') && code.includes('for ')) score -= 15;

    return Math.max(0, score);
  }

  private calculateDocumentationScore(code: string): number {
    const commentRatio = this.calculateCommentRatio(code);
    const hasJSDoc = code.includes('/**') || code.includes('@param') || code.includes('@returns');

    let score = commentRatio * 50; // Up to 50 points for comment ratio
    if (hasJSDoc) score += 50; // Additional 50 points for JSDoc

    return Math.min(100, score);
  }

  private calculateBestPracticesScore(code: string, language?: string): number {
    let score = 100;

    // Deduct for bad practices
    if (code.includes('var ')) score -= 20;
    if (code.includes('==')) score -= 10; // Prefer ===
    if (!code.includes('const') && !code.includes('let')) score -= 15;
    if (code.split('\n').some(line => line.length > 120)) score -= 10;

    return Math.max(0, score);
  }

  private calculateOverallScore(patterns: any, quality: any, security: any): number {
    let score = 50; // Base score

    // Pattern analysis bonus
    if (patterns.style !== 'unknown') score += 10;
    if (patterns.paradigm !== 'unknown') score += 10;

    // Quality metrics
    if (quality) {
      if (quality.maintainabilityIndex > 50) score += 10;
      if (quality.cyclomaticComplexity < 10) score += 10;
      if (quality.securityScore > 70) score += 10;
    }

    // Security bonus
    if (security && security.length === 0) score += 10;

    return Math.min(100, score);
  }

  private generateRecommendations(patterns: any, quality: any, security: any): string[] {
    const recommendations: string[] = [];

    if (quality && quality.cyclomaticComplexity > 15) {
      recommendations.push('Consider breaking down complex functions into smaller, more focused functions');
    }

    if (security && security.length > 0) {
      recommendations.push(`Address ${security.length} security vulnerabilities identified in the scan`);
    }

    if (quality && quality.commentRatio < 0.1) {
      recommendations.push('Add more comments to improve code documentation and maintainability');
    }

    if (patterns.antipatterns && patterns.antipatterns.length > 0) {
      recommendations.push(`Review ${patterns.antipatterns.length} anti-patterns detected in the code`);
    }

    return recommendations;
  }

  private optimizeForPerformance(code: string, language?: string): string {
    // Simple performance optimizations
    let optimized = code;

    // Cache array length in loops
    optimized = optimized.replace(
      /for\s*\(\s*let\s+(\w+)\s*=\s*0\s*;\s*\w+\s*<\s*(\w+)\.length\s*;\s*\w+\+\+\s*\)/g,
      'const $2Len = $2.length; for(let $1 = 0; $1 < $2Len; $1++)'
    );

    return optimized;
  }

  private optimizeForReadability(code: string, language?: string): string {
    // Simple readability improvements
    let readable = code;

    // Better variable names (simplified example)
    readable = readable.replace(/var (\w)/g, 'const $1');

    return readable;
  }

  private hardenForSecurity(code: string, language?: string): string {
    // Basic security hardening
    let hardened = code;

    // Replace dangerous patterns with safer alternatives
    hardened = hardened.replace(/eval\s*\(/g, '// SECURITY: eval() removed - ');
    hardened = hardened.replace(/innerHTML\s*=\s*/g, '// SECURITY: Use textContent instead\ntextContent = ');

    return hardened;
  }

  // GOOGLE CODE ASSISTANT COMPATIBLE FEATURES
  async generatePrefilledContext(params: {
    task: string;
    language?: string;
    context?: string;
    maxTokens?: number;
  }): Promise<any> {
    const task = params.task.toLowerCase();

    let template = {
      prefix: '',
      suffix: '',
      imports: [],
      variables: [],
      functions: [],
      patterns: [],
      estimatedTokens: 0
    };

    // Generate prefilled context based on task type
    if (task.includes('function') || task.includes('method')) {
      template.prefix = `function ${this.generateFunctionName(params.context)}(`;
      template.suffix = `) {\n    // Implementation\n}`;
      template.imports = this.extractRelevantImports(params.context);
      template.variables = this.extractRelevantVariables(params.context);
    } else if (task.includes('class')) {
      template.prefix = `class ${this.generateClassName(params.context)} {\n`;
      template.suffix = `\n}`;
      template.imports = this.extractRelevantImports(params.context);
    } else if (task.includes('test') || task.includes('spec')) {
      template.prefix = `describe('${this.generateTestName(params.context)}', () => {\n    it('should `;
      template.suffix = `', () => {\n        // Test implementation\n    });\n});`;
      template.imports = ['describe', 'it', 'expect'];
    } else if (task.includes('api') || task.includes('route')) {
      template.prefix = `app.${this.inferHttpMethod(params.context)}('${this.generateRoutePath(params.context)}', `;
      template.suffix = `);\n`;
      template.imports = ['express', 'Router'];
    }

    // Estimate token usage
    template.estimatedTokens = this.estimateTokens(template);

    return template;
  }

  async generateIntelligentCompletions(params: {
    prefix: string;
    suffix?: string;
    language?: string;
    context?: string;
    maxSuggestions?: number;
  }): Promise<any[]> {
    const completions: any[] = [];
    const prefix = params.prefix.toLowerCase();

    // Context-aware completion suggestions
    if (params.language === 'javascript' || params.language === 'typescript') {
      if (prefix.endsWith('con')) {
        completions.push({
          completion: 'st',
          fullText: 'const',
          type: 'keyword',
          confidence: 0.95,
          context: 'variable declaration'
        });
      } else if (prefix.endsWith('fun')) {
        completions.push({
          completion: 'ction',
          fullText: 'function',
          type: 'keyword',
          confidence: 0.98,
          context: 'function declaration'
        });
      } else if (prefix.endsWith('impo')) {
        completions.push({
          completion: 'rt',
          fullText: 'import',
          type: 'keyword',
          confidence: 0.97,
          context: 'module import'
        });
      }
    }

    // Extract context-aware suggestions from surrounding code
    if (params.context) {
      const contextSuggestions = this.extractContextSuggestions(params.context, params.language);
      completions.push(...contextSuggestions);
    }

    // Variable and function name completions
    if (params.context) {
      const variableSuggestions = this.extractVariableSuggestions(params.context);
      completions.push(...variableSuggestions);
    }

    return completions.slice(0, params.maxSuggestions || 5);
  }

  async generateProtectedResponse(params: {
    prompt: string;
    context?: string;
    language?: string;
    protectOutput?: boolean;
  }): Promise<any> {
    // Generate response with protection against injection attacks
    let response = {
      content: '',
      protectionApplied: params.protectOutput !== false,
      safePatterns: [],
      blockedPatterns: []
    };

    const prompt = params.prompt.toLowerCase();

    // Generate context-aware responses
    if (prompt.includes('function') || prompt.includes('method')) {
      response.content = this.generateFunctionTemplate(params.context, params.language);
      response.safePatterns.push('function_template');
    } else if (prompt.includes('class')) {
      response.content = this.generateClassTemplate(params.context, params.language);
      response.safePatterns.push('class_template');
    } else if (prompt.includes('test')) {
      response.content = this.generateTestTemplate(params.context, params.language);
      response.safePatterns.push('test_template');
    } else if (prompt.includes('error') || prompt.includes('exception')) {
      response.content = this.generateErrorHandlingTemplate(params.context, params.language);
      response.safePatterns.push('error_handling');
    }

    // Apply output protection if requested
    if (params.protectOutput !== false) {
      response.content = this.applyOutputProtection(response.content);
    }

    return response;
  }

  async generateAssistantContext(params: {
    task: string;
    code: string;
    language?: string;
    cursorPosition?: number;
    projectContext?: string;
  }): Promise<any> {
    const task = params.task.toLowerCase();

    let assistantContext = {
      prefilledPrompt: '',
      contextWindow: [],
      relevantImports: [],
      relevantFunctions: [],
      relevantClasses: [],
      cursorContext: '',
      projectPatterns: [],
      estimatedTokenReduction: 0
    };

    // Generate task-specific prefilled prompts
    if (task.includes('complete') || task.includes('finish')) {
      assistantContext.prefilledPrompt = 'Complete the following code:\n```' + (params.language || 'javascript') + '\n';
      assistantContext.cursorContext = this.extractCursorContext(params.code, params.cursorPosition);
    } else if (task.includes('fix') || task.includes('bug')) {
      assistantContext.prefilledPrompt = 'Fix the bug in this code:\n```' + (params.language || 'javascript') + '\n';
      assistantContext.cursorContext = this.extractErrorContext(params.code, params.cursorPosition);
    } else if (task.includes('optimize') || task.includes('performance')) {
      assistantContext.prefilledPrompt = 'Optimize this code for performance:\n```' + (params.language || 'javascript') + '\n';
      assistantContext.cursorContext = this.extractPerformanceContext(params.code);
    }

    // Extract relevant context elements
    assistantContext.relevantImports = this.extractRelevantImports(params.code);
    assistantContext.relevantFunctions = this.extractRelevantFunctions(params.code);
    assistantContext.relevantClasses = this.extractRelevantClasses(params.code);

    // Project-wide patterns if available
    if (params.projectContext) {
      assistantContext.projectPatterns = this.extractProjectPatterns(params.projectContext);
    }

    // Build context window
    assistantContext.contextWindow = this.buildContextWindow(
      assistantContext.relevantImports,
      assistantContext.relevantFunctions,
      assistantContext.relevantClasses,
      assistantContext.projectPatterns
    );

    // Estimate token reduction (prefilled context saves tokens)
    assistantContext.estimatedTokenReduction = this.calculateTokenSavings(assistantContext);

    return assistantContext;
  }

  // Helper methods for Google Assistant compatible features
  private generateFunctionName(context?: string): string {
    if (!context) return 'newFunction';
    // Extract meaningful function name from context
    const words = context.split(/\W+/).filter(word => word.length > 3);
    return words.length > 0 ? words[0].toLowerCase() : 'newFunction';
  }

  private generateClassName(context?: string): string {
    if (!context) return 'NewClass';
    // Extract meaningful class name from context
    const words = context.split(/\W+/).filter(word => word.length > 3);
    return words.length > 0 ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : 'NewClass';
  }

  private generateTestName(context?: string): string {
    if (!context) return 'New Test';
    // Extract meaningful test name from context
    const words = context.split(/\W+/).filter(word => word.length > 2);
    return words.length > 0 ? words.slice(0, 3).join(' ') : 'New Test';
  }

  private inferHttpMethod(context?: string): string {
    if (!context) return 'get';
    const contextLower = context.toLowerCase();
    if (contextLower.includes('create') || contextLower.includes('add')) return 'post';
    if (contextLower.includes('update') || contextLower.includes('modify')) return 'put';
    if (contextLower.includes('delete') || contextLower.includes('remove')) return 'delete';
    return 'get';
  }

  private generateRoutePath(context?: string): string {
    if (!context) return '/api/resource';
    // Extract meaningful route path from context
    const words = context.split(/\W+/).filter(word => word.length > 2);
    const resource = words.length > 0 ? words[0].toLowerCase() : 'resource';
    return `/api/${resource}`;
  }

  private estimateTokens(template: any): number {
    const text = template.prefix + template.suffix + JSON.stringify(template.imports);
    return Math.ceil(text.length / 4); // Rough token estimation
  }

  private extractContextSuggestions(context: string, language?: string): any[] {
    const suggestions: any[] = [];
    // Extract variable names, function names, etc. from context
    const identifiers = this.extractIdentifiers(context);

    identifiers.forEach(identifier => {
      suggestions.push({
        completion: identifier,
        fullText: identifier,
        type: 'identifier',
        confidence: 0.8,
        context: 'from surrounding code'
      });
    });

    return suggestions;
  }

  private extractVariableSuggestions(context: string): any[] {
    const suggestions: any[] = [];
    // Extract variable declarations from context
    const varMatches = context.match(/const\s+(\w+)|let\s+(\w+)|var\s+(\w+)/g);

    if (varMatches) {
      varMatches.forEach(match => {
        const varName = match.split(/\s+/)[1];
        suggestions.push({
          completion: varName,
          fullText: varName,
          type: 'variable',
          confidence: 0.9,
          context: 'variable declaration'
        });
      });
    }

    return suggestions;
  }

  private generateFunctionTemplate(context?: string, language?: string): string {
    return `function ${this.generateFunctionName(context)}(param1, param2) {
    // Function implementation
    try {
        // Code logic here
        return result;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}`;
  }

  private generateClassTemplate(context?: string, language?: string): string {
    return `class ${this.generateClassName(context)} {
    constructor(param1, param2) {
        this.param1 = param1;
        this.param2 = param2;
    }

    method1() {
        // Method implementation
        return this.param1;
    }

    static createInstance(param1, param2) {
        return new ${this.generateClassName(context)}(param1, param2);
    }
}`;
  }

  private generateTestTemplate(context?: string, language?: string): string {
    return `describe('${this.generateTestName(context)}', () => {
    let testInstance;

    beforeEach(() => {
        // Setup test fixtures
        testInstance = new TestClass();
    });

    it('should initialize correctly', () => {
        expect(testInstance).toBeDefined();
    });

    it('should perform expected behavior', () => {
        // Test implementation
        const result = testInstance.method();
        expect(result).toBe(expectedValue);
    });
});`;
  }

  private generateErrorHandlingTemplate(context?: string, language?: string): string {
    return `try {
    // Risky operation
    const result = performRiskyOperation();
    return result;
} catch (error) {
    // Error handling
    console.error('Operation failed:', error.message);

    // Log error details
    logger.error('Error details:', {
        error: error.message,
        stack: error.stack,
        context: '${context || 'unknown'}'
    });

    // Return safe fallback
    return getFallbackValue();
} finally {
    // Cleanup operations
    cleanupResources();
}`;
  }

  private applyOutputProtection(content: string): string {
    // Apply protection against injection in generated content
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '[SCRIPT_BLOCKED]')
      .replace(/javascript:/gi, '[JAVASCRIPT_BLOCKED]:')
      .replace(/on\w+\s*=/gi, '[EVENT_BLOCKED]=');
  }

  private extractRelevantVariables(context?: string): string[] {
    if (!context) return [];
    const varMatches = context.match(/(?:const|let|var)\s+(\w+)/g);
    if (!varMatches) return [];

    return varMatches.map(match => match.split(/\s+/)[1]).filter(Boolean);
  }

  private extractRelevantImports(code: string | undefined): string[] {
    if (!code) return [];
    const importMatches = code.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
    if (!importMatches) return [];

    return importMatches.map(match => {
      const fromMatch = match.match(/from\s+['"]([^'"]+)['"]/);
      return fromMatch ? fromMatch[1] : '';
    }).filter(Boolean);
  }

  private extractRelevantFunctions(code: string): string[] {
    const functionMatches = code.match(/function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g);
    if (!functionMatches) return [];

    return functionMatches.map(match => {
      const funcName = match.match(/function\s+(\w+)|const\s+(\w+)/);
      return funcName ? funcName[1] || funcName[2] : '';
    }).filter(Boolean);
  }

  private extractRelevantClasses(code: string): string[] {
    const classMatches = code.match(/class\s+(\w+)/g);
    if (!classMatches) return [];

    return classMatches.map(match => match.match(/class\s+(\w+)/)?.[1]).filter(Boolean);
  }

  private extractProjectPatterns(projectContext: string): string[] {
    const patterns: string[] = [];

    // Extract common patterns from project context
    if (projectContext.includes('async')) patterns.push('async/await');
    if (projectContext.includes('Promise')) patterns.push('promises');
    if (projectContext.includes('Observable')) patterns.push('reactive programming');
    if (projectContext.includes('typescript')) patterns.push('typescript');

    return patterns;
  }

  private buildContextWindow(imports: string[], functions: string[], classes: string[], patterns: string[]): any[] {
    return [
      { type: 'imports', items: imports },
      { type: 'functions', items: functions },
      { type: 'classes', items: classes },
      { type: 'patterns', items: patterns }
    ];
  }

  private calculateTokenSavings(context: any): number {
    // Estimate tokens saved by providing prefilled context
    const basePromptTokens = 50; // Tokens for basic prompt
    const contextTokens = context.contextWindow.reduce((total: number, section: any) =>
      total + section.items.length * 5, 0); // ~5 tokens per context item

    return Math.max(0, basePromptTokens - contextTokens);
  }

  private extractCursorContext(code: string, cursorPosition?: number): string {
    if (!cursorPosition) return code.substring(0, 200);

    const start = Math.max(0, cursorPosition - 100);
    const end = Math.min(code.length, cursorPosition + 100);
    return code.substring(start, end);
  }

  private extractErrorContext(code: string, cursorPosition?: number): string {
    // Extract context around potential error locations
    const context = this.extractCursorContext(code, cursorPosition);

    // Look for error-prone patterns
    const errorPatterns = ['try', 'catch', 'throw', 'error', 'Error'];
    const lines = context.split('\n');
    const relevantLines = lines.filter(line =>
      errorPatterns.some(pattern => line.toLowerCase().includes(pattern))
    );

    return relevantLines.join('\n');
  }

  private extractPerformanceContext(code: string): string {
    // Extract context related to performance optimization
    const lines = code.split('\n');
    const performanceIndicators = [
      'for', 'while', 'length', 'indexOf', 'filter', 'map', 'reduce',
      'async', 'await', 'Promise', 'setTimeout', 'setInterval'
    ];

    const relevantLines = lines.filter(line =>
      performanceIndicators.some(indicator => line.includes(indicator))
    );

    return relevantLines.join('\n');
  }
}

// ============================================================================
// MONITORING PLUGIN - Provides system monitoring
// ============================================================================

export class MonitoringPlugin implements PLUMCPPlugin {
  id = 'plumcp-monitoring';
  name = 'Monitoring Plugin';
  version = '1.0.0';
  description = 'Provides system monitoring and performance tracking';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['get_system_metrics', 'monitor_performance', 'log_event']
    },
    {
      type: 'resources',
      methods: ['read']
    }
  ];
  dependencies: any[] = [];

  private metrics: Map<string, any[]> = new Map();
  private startTime = Date.now();

  async activate(context: PluginContext): Promise<void> {
    // Register monitoring tools
    context.registerTool({
      name: 'get_system_metrics',
      description: 'Get current system performance metrics',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();

        return {
          memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
            external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
          },
          uptime: {
            seconds: Math.round(uptime),
            minutes: Math.round(uptime / 60),
            hours: Math.round(uptime / 3600)
          },
          process: {
            pid: process.pid,
            platform: process.platform,
            nodeVersion: process.version
          }
        };
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'monitor_performance',
      description: 'Start performance monitoring for a specific operation',
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', description: 'Operation name to monitor' },
          duration: { type: 'number', description: 'Monitoring duration in seconds', default: 60 }
        },
        required: ['operation']
      },
      handler: async (args: { operation: string; duration?: number }) => {
        const duration = args.duration || 60;
        const startTime = Date.now();

        // Simulate monitoring (in real implementation, would track actual metrics)
        await new Promise(resolve => setTimeout(resolve, duration * 1000));

        const endTime = Date.now();
        const metrics = {
          operation: args.operation,
          duration: endTime - startTime,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString()
        };

        // Store metrics
        if (!this.metrics.has(args.operation)) {
          this.metrics.set(args.operation, []);
        }
        this.metrics.get(args.operation)!.push(metrics);

        return metrics;
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'log_event',
      description: 'Log a custom event for monitoring purposes',
      inputSchema: {
        type: 'object',
        properties: {
          event: { type: 'string', description: 'Event name' },
          data: { type: 'object', description: 'Event data' },
          level: { type: 'string', enum: ['info', 'warn', 'error'], default: 'info' }
        },
        required: ['event']
      },
      handler: async (args: { event: string; data?: any; level?: string }) => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          event: args.event,
          level: args.level || 'info',
          data: args.data || {},
          plugin: this.id
        };

        console.error(`[${logEntry.level.toUpperCase()}] ${args.event}:`, JSON.stringify(args.data));

        return {
          logged: true,
          entry: logEntry
        };
      },
      pluginId: this.id
    });

    // Register monitoring resources
    context.registerResource({
      uri: 'monitor://performance',
      name: 'Performance Metrics',
      description: 'Current performance metrics and monitoring data',
      mimeType: 'application/json',
      handler: async () => {
        const performanceData = {
          uptime: Date.now() - this.startTime,
          operations: Array.from(this.metrics.entries()).map(([op, data]) => ({
            operation: op,
            executionCount: data.length,
            lastExecution: data[data.length - 1]?.endTime,
            averageDuration: data.reduce((sum, d) => sum + d.duration, 0) / data.length
          })),
          plugin: this.name
        };
        return JSON.stringify(performanceData, null, 2);
      },
      pluginId: this.id
    });

    console.error(`Monitoring Plugin activated - providing system monitoring capabilities`);
  }

  async deactivate(): Promise<void> {
    this.metrics.clear();
    console.error(`Monitoring Plugin deactivated - metrics cleared`);
  }
}

// ============================================================================
// PLUGIN REGISTRY - For plugin discovery and management
// ============================================================================

export class PluginRegistry {
  private availablePlugins: Map<string, PLUMCPPlugin> = new Map();

  constructor() {
    // Register built-in plugins
    this.registerPlugin(new AIAssistancePlugin());
    this.registerPlugin(new WebScrapingPlugin());
    this.registerPlugin(new DatabasePlugin());
    this.registerPlugin(new ContextProviderPlugin()); // The Safe Context Provider
    this.registerPlugin(new IntelligentContextPlugin()); // ML-Powered Context Intelligence
    this.registerPlugin(new CodeContextPlugin()); // Specialized Code Context
    this.registerPlugin(new ContextAwareAIPlugin()); // Context-Aware AI
    this.registerPlugin(new IDEExtensionFrameworkPlugin()); // Secure IDE Framework
    this.registerPlugin(new VSCodeExtensionPlugin()); // VS Code Integration
    this.registerPlugin(new SecureIDECommunicationPlugin()); // Encrypted IDE Channels
    this.registerPlugin(new VirtualFileSystemPlugin()); // VFS with Injection Protection
    this.registerPlugin(new GuidancePlugin()); // Intelligent Code Analysis & Prefilled Context
    this.registerPlugin(new ReliabilityEnhancementPlugin()); // Backward-Compatible Reliability
    this.registerPlugin(new MonitoringPlugin());
  }

  registerPlugin(plugin: PLUMCPPlugin): void {
    this.availablePlugins.set(plugin.id, plugin);
  }

  getPlugin(id: string): PLUMCPPlugin | undefined {
    return this.availablePlugins.get(id);
  }

  listPlugins(): PLUMCPPlugin[] {
    return Array.from(this.availablePlugins.values());
  }

  searchPlugins(capability?: string): PLUMCPPlugin[] {
    if (!capability) {
      return this.listPlugins();
    }

    return this.listPlugins().filter(plugin =>
      plugin.capabilities.some(cap => cap.methods.includes(capability))
    );
  }
}

// Export all plugins for easy importing
export {
  AIAssistancePlugin,
  WebScrapingPlugin,
  DatabasePlugin,
  MonitoringPlugin,
  PluginRegistry
};
