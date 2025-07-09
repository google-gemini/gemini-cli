/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolDefinition } from './ollamaClient.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Config } from '../config/config.js';

export interface ToolExecutionResult {
  success: boolean;
  result: string;
  error?: string;
  metadata?: Record<string, any>;
}

export type ToolExecutor = (args: Record<string, any>) => Promise<ToolExecutionResult>;

/**
 * Registry for Ollama-compatible tools using OpenAI function calling spec
 * Converts existing Trust CLI tools to OpenAI-compatible format
 */
export class OllamaToolRegistry {
  private tools: Map<string, ToolExecutor> = new Map();
  private definitions: ToolDefinition[] = [];
  private config: Config;
  private trustToolRegistry: ToolRegistry;

  constructor(config: Config, trustToolRegistry: ToolRegistry) {
    this.config = config;
    this.trustToolRegistry = trustToolRegistry;
    this.initializeTools();
  }

  /**
   * Initialize tools from existing Trust CLI tool registry
   */
  private initializeTools(): void {
    // File operations
    this.registerTool('read_file', {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to read (relative or absolute)',
            },
          },
          required: ['path'],
        },
      },
    }, this.createReadFileExecutor());

    this.registerTool('write_file', {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write content to a file (creates or overwrites)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to write',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
      },
    }, this.createWriteFileExecutor());

    this.registerTool('list_directory', {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'List files and directories in a given path',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (defaults to current directory)',
            },
          },
          required: [],
        },
      },
    }, this.createListDirectoryExecutor());

    this.registerTool('find_files', {
      type: 'function',
      function: {
        name: 'find_files',
        description: 'Find files matching a pattern (glob search)',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern to match files (e.g., "*.js", "**/*.ts")',
            },
            path: {
              type: 'string',
              description: 'Base directory to search (defaults to current directory)',
            },
          },
          required: ['pattern'],
        },
      },
    }, this.createFindFilesExecutor());

    this.registerTool('search_files', {
      type: 'function',
      function: {
        name: 'search_files',
        description: 'Search for text content within files using regex',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Regular expression pattern to search for',
            },
            include: {
              type: 'string',
              description: 'File pattern to include in search (e.g., "*.js")',
            },
            path: {
              type: 'string',
              description: 'Directory to search in (defaults to current directory)',
            },
          },
          required: ['pattern'],
        },
      },
    }, this.createSearchFilesExecutor());

    this.registerTool('shell_command', {
      type: 'function',
      function: {
        name: 'shell_command',
        description: 'Execute a shell command (use with caution)',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (default: 30000)',
            },
          },
          required: ['command'],
        },
      },
    }, this.createShellCommandExecutor());

    // Memory operations
    this.registerTool('save_memory', {
      type: 'function',
      function: {
        name: 'save_memory',
        description: 'Save information to memory for later retrieval',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to save to memory',
            },
            tags: {
              type: 'string',
              description: 'Optional tags for categorization',
            },
          },
          required: ['content'],
        },
      },
    }, this.createSaveMemoryExecutor());

    this.registerTool('search_memory', {
      type: 'function',
      function: {
        name: 'search_memory',
        description: 'Search previously saved memory content',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for memory content',
            },
          },
          required: ['query'],
        },
      },
    }, this.createSearchMemoryExecutor());

    // Web operations (if available)
    this.registerTool('web_search', {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
          },
          required: ['query'],
        },
      },
    }, this.createWebSearchExecutor());

    this.registerTool('web_fetch', {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: 'Fetch content from a URL',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to fetch content from',
            },
          },
          required: ['url'],
        },
      },
    }, this.createWebFetchExecutor());
  }

  /**
   * Register a new tool
   */
  registerTool(name: string, definition: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(name, executor);
    this.definitions.push(definition);
  }

  /**
   * Get all tool definitions for OpenAI API
   */
  getToolDefinitions(): ToolDefinition[] {
    return [...this.definitions];
  }

  /**
   * Execute a tool call
   */
  async executeTool(name: string, args: Record<string, any>): Promise<ToolExecutionResult> {
    const executor = this.tools.get(name);
    if (!executor) {
      return {
        success: false,
        result: '',
        error: `Tool '${name}' not found`,
      };
    }

    try {
      return await executor(args);
    } catch (error) {
      return {
        success: false,
        result: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get list of available tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Extract result text from ToolResult
   */
  private extractResultText(result: any): string {
    if (result.llmContent) {
      return typeof result.llmContent === 'string' ? result.llmContent : JSON.stringify(result.llmContent);
    }
    if (result.returnDisplay) {
      return typeof result.returnDisplay === 'string' ? result.returnDisplay : JSON.stringify(result.returnDisplay);
    }
    return JSON.stringify(result);
  }

  // Tool executor factories
  private createReadFileExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('read_file');
        if (!tool) {
          throw new Error('Read file tool not available');
        }

        const result = await tool.execute({
          path: args.path,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'File read successfully',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createWriteFileExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('write_file');
        if (!tool) {
          throw new Error('Write file tool not available');
        }

        const result = await tool.execute({
          path: args.path,
          content: args.content,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || `File written successfully to ${args.path}`,
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createListDirectoryExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('list_directory');
        if (!tool) {
          throw new Error('List directory tool not available');
        }

        const result = await tool.execute({
          path: args.path || '.',
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Directory listed successfully',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createFindFilesExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('glob');
        if (!tool) {
          throw new Error('Find files tool not available');
        }

        const result = await tool.execute({
          pattern: args.pattern,
          path: args.path,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Files found successfully',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createSearchFilesExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('grep');
        if (!tool) {
          throw new Error('Search files tool not available');
        }

        const result = await tool.execute({
          pattern: args.pattern,
          include: args.include,
          path: args.path,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Search completed successfully',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createShellCommandExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('shell');
        if (!tool) {
          throw new Error('Shell command tool not available');
        }

        const result = await tool.execute({
          command: args.command,
          timeout: args.timeout || 30000,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Command executed successfully',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createSaveMemoryExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('save_memory');
        if (!tool) {
          throw new Error('Save memory tool not available');
        }

        const result = await tool.execute({
          content: args.content,
          tags: args.tags,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Memory saved successfully',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createSearchMemoryExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('search_memory');
        if (!tool) {
          throw new Error('Search memory tool not available');
        }

        const result = await tool.execute({
          query: args.query,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Memory search completed',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createWebSearchExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('web_search');
        if (!tool) {
          throw new Error('Web search tool not available');
        }

        const result = await tool.execute({
          query: args.query,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Web search completed',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }

  private createWebFetchExecutor(): ToolExecutor {
    return async (args) => {
      try {
        const tool = this.trustToolRegistry.getTool('web_fetch');
        if (!tool) {
          throw new Error('Web fetch tool not available');
        }

        const result = await tool.execute({
          url: args.url,
        }, new AbortController().signal);

        return {
          success: true,
          result: this.extractResultText(result) || 'Web content fetched successfully',
        };
      } catch (error) {
        return {
          success: false,
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
  }
}