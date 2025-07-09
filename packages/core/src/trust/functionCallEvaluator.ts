/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCall } from '@google/genai';
import { JsonRepairParser } from './jsonRepairParser.js';
import { TrustContentGenerator } from './trustContentGenerator.js';

export interface EvaluationPrompt {
  id: string;
  description: string;
  prompt: string;
  expectedTool: string;
  expectedArgs: Record<string, any>;
  category: 'file_operations' | 'shell_commands' | 'search' | 'web' | 'memory' | 'complex';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface EvaluationResult {
  promptId: string;
  success: boolean;
  validJson: boolean;
  correctTool: boolean;
  correctArgs: boolean;
  responseTime: number;
  rawResponse: string;
  parsedCalls: FunctionCall[];
  errors?: string[];
  repairAttempts?: number;
}

export interface EvaluationSummary {
  totalPrompts: number;
  successfulCalls: number;
  validJsonRate: number;
  correctToolRate: number;
  correctArgsRate: number;
  averageResponseTime: number;
  categoryBreakdown: Record<string, {
    total: number;
    success: number;
    rate: number;
  }>;
  difficultyBreakdown: Record<string, {
    total: number;
    success: number;
    rate: number;
  }>;
}

/**
 * Comprehensive evaluation harness for function calling capabilities
 * Tests across 50 different scenarios to measure success rates
 */
export class FunctionCallEvaluator {
  private contentGenerator: TrustContentGenerator;
  private jsonParser: JsonRepairParser;
  private evaluationPrompts: EvaluationPrompt[];

  constructor(contentGenerator: TrustContentGenerator) {
    this.contentGenerator = contentGenerator;
    this.jsonParser = new JsonRepairParser();
    this.evaluationPrompts = this.createEvaluationPrompts();
  }

  /**
   * Run complete evaluation suite
   */
  async runEvaluation(): Promise<EvaluationSummary> {
    const results: EvaluationResult[] = [];
    
    console.log(`Starting function call evaluation with ${this.evaluationPrompts.length} prompts...`);
    
    for (const prompt of this.evaluationPrompts) {
      console.log(`Evaluating: ${prompt.description}`);
      
      const result = await this.evaluatePrompt(prompt);
      results.push(result);
      
      // Brief pause to prevent overloading
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return this.generateSummary(results);
  }

  /**
   * Evaluate a single prompt
   */
  private async evaluatePrompt(prompt: EvaluationPrompt): Promise<EvaluationResult> {
    const startTime = Date.now();
    
    try {
      // Generate response using the content generator
      const response = await this.contentGenerator.generateContent({
        model: 'trust-model', // This will be ignored by TrustContentGenerator
        contents: [{ parts: [{ text: prompt.prompt }], role: 'user' }]
      });
      
      const responseTime = Date.now() - startTime;
      const rawResponse = response.text || '';
      
      // Parse function calls from response
      const parseResult = this.jsonParser.parseFunctionCalls(rawResponse);
      
      // Evaluate results
      const validJson = parseResult.success;
      const parsedCalls = parseResult.functionCalls || [];
      
      let correctTool = false;
      let correctArgs = false;
      
      if (parsedCalls.length > 0) {
        const firstCall = parsedCalls[0];
        correctTool = firstCall.name === prompt.expectedTool;
        
        if (correctTool) {
          correctArgs = this.compareArgs(firstCall.args || {}, prompt.expectedArgs);
        }
      }
      
      const success = validJson && correctTool && correctArgs;
      
      return {
        promptId: prompt.id,
        success,
        validJson,
        correctTool,
        correctArgs,
        responseTime,
        rawResponse,
        parsedCalls,
        errors: parseResult.errors,
        repairAttempts: parseResult.errors?.length || 0
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        promptId: prompt.id,
        success: false,
        validJson: false,
        correctTool: false,
        correctArgs: false,
        responseTime,
        rawResponse: '',
        parsedCalls: [],
        errors: [String(error)]
      };
    }
  }

  /**
   * Compare function arguments with expected values
   */
  private compareArgs(actual: Record<string, any>, expected: Record<string, any>): boolean {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    
    // Check if all expected keys are present
    for (const key of expectedKeys) {
      if (!actualKeys.includes(key)) {
        return false;
      }
      
      // For string values, allow partial matches
      if (typeof expected[key] === 'string' && typeof actual[key] === 'string') {
        if (!actual[key].includes(expected[key])) {
          return false;
        }
      } else if (actual[key] !== expected[key]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Generate evaluation summary
   */
  private generateSummary(results: EvaluationResult[]): EvaluationSummary {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const validJson = results.filter(r => r.validJson).length;
    const correctTool = results.filter(r => r.correctTool).length;
    const correctArgs = results.filter(r => r.correctArgs).length;
    const totalTime = results.reduce((sum, r) => sum + r.responseTime, 0);
    
    // Category breakdown
    const categoryBreakdown: Record<string, { total: number; success: number; rate: number }> = {};
    const difficultyBreakdown: Record<string, { total: number; success: number; rate: number }> = {};
    
    for (const prompt of this.evaluationPrompts) {
      const result = results.find(r => r.promptId === prompt.id);
      if (!result) continue;
      
      // Category stats
      if (!categoryBreakdown[prompt.category]) {
        categoryBreakdown[prompt.category] = { total: 0, success: 0, rate: 0 };
      }
      categoryBreakdown[prompt.category].total++;
      if (result.success) {
        categoryBreakdown[prompt.category].success++;
      }
      
      // Difficulty stats
      if (!difficultyBreakdown[prompt.difficulty]) {
        difficultyBreakdown[prompt.difficulty] = { total: 0, success: 0, rate: 0 };
      }
      difficultyBreakdown[prompt.difficulty].total++;
      if (result.success) {
        difficultyBreakdown[prompt.difficulty].success++;
      }
    }
    
    // Calculate rates
    for (const category of Object.keys(categoryBreakdown)) {
      const stats = categoryBreakdown[category];
      stats.rate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
    }
    
    for (const difficulty of Object.keys(difficultyBreakdown)) {
      const stats = difficultyBreakdown[difficulty];
      stats.rate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
    }
    
    return {
      totalPrompts: total,
      successfulCalls: successful,
      validJsonRate: total > 0 ? (validJson / total) * 100 : 0,
      correctToolRate: total > 0 ? (correctTool / total) * 100 : 0,
      correctArgsRate: total > 0 ? (correctArgs / total) * 100 : 0,
      averageResponseTime: total > 0 ? totalTime / total : 0,
      categoryBreakdown,
      difficultyBreakdown
    };
  }

  /**
   * Create the 50-prompt evaluation dataset
   */
  private createEvaluationPrompts(): EvaluationPrompt[] {
    return [
      // File Operations (Easy)
      {
        id: 'file_01',
        description: 'List files in current directory',
        prompt: 'List all files in the current directory',
        expectedTool: 'list_directory',
        expectedArgs: { path: '.' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'file_02',
        description: 'Read a specific file',
        prompt: 'Read the contents of package.json',
        expectedTool: 'read_file',
        expectedArgs: { path: 'package.json' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'file_03',
        description: 'Write to a file',
        prompt: 'Create a new file called test.txt with the content "Hello World"',
        expectedTool: 'write_file',
        expectedArgs: { path: 'test.txt', content: 'Hello World' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'file_04',
        description: 'List files in specific directory',
        prompt: 'Show me what files are in the /tmp directory',
        expectedTool: 'list_directory',
        expectedArgs: { path: '/tmp' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'file_05',
        description: 'Read file with path',
        prompt: 'Can you read the file at /etc/hosts?',
        expectedTool: 'read_file',
        expectedArgs: { path: '/etc/hosts' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      
      // Shell Commands (Medium)
      {
        id: 'shell_01',
        description: 'Basic shell command',
        prompt: 'Run the command "ls -la"',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'ls -la' },
        category: 'shell_commands',
        difficulty: 'medium'
      },
      {
        id: 'shell_02',
        description: 'Check disk usage',
        prompt: 'Check how much disk space is being used',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'df -h' },
        category: 'shell_commands',
        difficulty: 'medium'
      },
      {
        id: 'shell_03',
        description: 'Find process',
        prompt: 'Find all running processes containing "node"',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'ps aux | grep node' },
        category: 'shell_commands',
        difficulty: 'medium'
      },
      {
        id: 'shell_04',
        description: 'Network status',
        prompt: 'Show network connections',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'netstat -an' },
        category: 'shell_commands',
        difficulty: 'medium'
      },
      {
        id: 'shell_05',
        description: 'System information',
        prompt: 'Get system information about the OS',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'uname -a' },
        category: 'shell_commands',
        difficulty: 'medium'
      },
      
      // Search Operations (Medium)
      {
        id: 'search_01',
        description: 'Search for files',
        prompt: 'Find all .js files in the current directory',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'find . -name "*.js"' },
        category: 'search',
        difficulty: 'medium'
      },
      {
        id: 'search_02',
        description: 'Search file contents',
        prompt: 'Search for the word "function" in all TypeScript files',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'grep -r "function" --include="*.ts" .' },
        category: 'search',
        difficulty: 'medium'
      },
      {
        id: 'search_03',
        description: 'Find large files',
        prompt: 'Find files larger than 1MB in the current directory',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'find . -size +1M' },
        category: 'search',
        difficulty: 'medium'
      },
      {
        id: 'search_04',
        description: 'Search with pattern',
        prompt: 'Find all files modified today',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'find . -newermt today' },
        category: 'search',
        difficulty: 'medium'
      },
      {
        id: 'search_05',
        description: 'Complex search',
        prompt: 'Find all JSON files that contain the word "test"',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'find . -name "*.json" -exec grep -l "test" {} \\;' },
        category: 'search',
        difficulty: 'hard'
      },
      
      // Web Operations (Hard)
      {
        id: 'web_01',
        description: 'Web search',
        prompt: 'Search the web for "Node.js best practices"',
        expectedTool: 'web_search',
        expectedArgs: { query: 'Node.js best practices' },
        category: 'web',
        difficulty: 'hard'
      },
      {
        id: 'web_02',
        description: 'Fetch web page',
        prompt: 'Fetch the contents of https://example.com',
        expectedTool: 'web_fetch',
        expectedArgs: { url: 'https://example.com' },
        category: 'web',
        difficulty: 'hard'
      },
      {
        id: 'web_03',
        description: 'Search for documentation',
        prompt: 'Find documentation about TypeScript interfaces',
        expectedTool: 'web_search',
        expectedArgs: { query: 'TypeScript interfaces documentation' },
        category: 'web',
        difficulty: 'hard'
      },
      {
        id: 'web_04',
        description: 'Fetch API documentation',
        prompt: 'Get the content from https://api.github.com/users/octocat',
        expectedTool: 'web_fetch',
        expectedArgs: { url: 'https://api.github.com/users/octocat' },
        category: 'web',
        difficulty: 'hard'
      },
      {
        id: 'web_05',
        description: 'Search with specific terms',
        prompt: 'Search for "JavaScript async await examples"',
        expectedTool: 'web_search',
        expectedArgs: { query: 'JavaScript async await examples' },
        category: 'web',
        difficulty: 'hard'
      },
      
      // Memory Operations (Medium)
      {
        id: 'memory_01',
        description: 'Save to memory',
        prompt: 'Remember that the project uses TypeScript',
        expectedTool: 'save_memory',
        expectedArgs: { content: 'project uses TypeScript' },
        category: 'memory',
        difficulty: 'medium'
      },
      {
        id: 'memory_02',
        description: 'Search memory',
        prompt: 'What do you remember about TypeScript?',
        expectedTool: 'search_memory',
        expectedArgs: { query: 'TypeScript' },
        category: 'memory',
        difficulty: 'medium'
      },
      {
        id: 'memory_03',
        description: 'Save project info',
        prompt: 'Remember that this is a CLI tool for AI development',
        expectedTool: 'save_memory',
        expectedArgs: { content: 'CLI tool for AI development' },
        category: 'memory',
        difficulty: 'medium'
      },
      {
        id: 'memory_04',
        description: 'Search for saved info',
        prompt: 'What do you remember about this project?',
        expectedTool: 'search_memory',
        expectedArgs: { query: 'project' },
        category: 'memory',
        difficulty: 'medium'
      },
      {
        id: 'memory_05',
        description: 'Save configuration',
        prompt: 'Remember that the default model is phi-3.5-mini',
        expectedTool: 'save_memory',
        expectedArgs: { content: 'default model is phi-3.5-mini' },
        category: 'memory',
        difficulty: 'medium'
      },
      
      // Complex Operations (Hard)
      {
        id: 'complex_01',
        description: 'Multi-step file operation',
        prompt: 'Create a backup of package.json by copying it to package.json.backup',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'cp package.json package.json.backup' },
        category: 'complex',
        difficulty: 'hard'
      },
      {
        id: 'complex_02',
        description: 'Analysis request',
        prompt: 'Analyze the structure of this project by listing all directories',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'find . -type d' },
        category: 'complex',
        difficulty: 'hard'
      },
      {
        id: 'complex_03',
        description: 'Development task',
        prompt: 'Check if there are any TypeScript compilation errors',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'tsc --noEmit' },
        category: 'complex',
        difficulty: 'hard'
      },
      {
        id: 'complex_04',
        description: 'Project maintenance',
        prompt: 'Update all npm dependencies to their latest versions',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'npm update' },
        category: 'complex',
        difficulty: 'hard'
      },
      {
        id: 'complex_05',
        description: 'Code quality check',
        prompt: 'Run the linter to check for code quality issues',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'npm run lint' },
        category: 'complex',
        difficulty: 'hard'
      },
      
      // Additional varied prompts to reach 50
      {
        id: 'misc_01',
        description: 'Environment variable',
        prompt: 'Show the value of the PATH environment variable',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'echo $PATH' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_02',
        description: 'Count lines in file',
        prompt: 'Count the number of lines in README.md',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'wc -l README.md' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'misc_03',
        description: 'Check Git status',
        prompt: 'Show the current Git status',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'git status' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_04',
        description: 'Create directory',
        prompt: 'Create a new directory called "temp"',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'mkdir temp' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'misc_05',
        description: 'Archive files',
        prompt: 'Create a tar archive of the src directory',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'tar -czf src.tar.gz src/' },
        category: 'complex',
        difficulty: 'medium'
      },
      {
        id: 'misc_06',
        description: 'Permission check',
        prompt: 'Check the permissions of the package.json file',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'ls -l package.json' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'misc_07',
        description: 'Process monitoring',
        prompt: 'Show the current system load average',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'uptime' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_08',
        description: 'Date and time',
        prompt: 'Show the current date and time',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'date' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_09',
        description: 'File comparison',
        prompt: 'Compare two files: file1.txt and file2.txt',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'diff file1.txt file2.txt' },
        category: 'file_operations',
        difficulty: 'medium'
      },
      {
        id: 'misc_10',
        description: 'System resources',
        prompt: 'Show memory usage information',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'free -h' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_11',
        description: 'Text processing',
        prompt: 'Sort the lines in data.txt alphabetically',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'sort data.txt' },
        category: 'file_operations',
        difficulty: 'medium'
      },
      {
        id: 'misc_12',
        description: 'File size',
        prompt: 'Show the size of all files in the current directory',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'ls -lh' },
        category: 'file_operations',
        difficulty: 'easy'
      },
      {
        id: 'misc_13',
        description: 'Search and replace',
        prompt: 'Replace all occurrences of "old" with "new" in config.txt',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'sed -i s/old/new/g config.txt' },
        category: 'file_operations',
        difficulty: 'hard'
      },
      {
        id: 'misc_14',
        description: 'Network connectivity',
        prompt: 'Test network connectivity to google.com',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'ping -c 3 google.com' },
        category: 'shell_commands',
        difficulty: 'medium'
      },
      {
        id: 'misc_15',
        description: 'Package info',
        prompt: 'Show information about the installed Node.js version',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'node --version' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_16',
        description: 'List running processes',
        prompt: 'Show me all currently running processes',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'ps aux' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_17',
        description: 'Check environment variables',
        prompt: 'Show all environment variables',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'printenv' },
        category: 'shell_commands',
        difficulty: 'easy'
      },
      {
        id: 'misc_18',
        description: 'File backup operation',
        prompt: 'Create a backup of the file important.txt',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'cp important.txt important.txt.backup' },
        category: 'file_operations',
        difficulty: 'medium'
      },
      {
        id: 'misc_19',
        description: 'Monitor system resources',
        prompt: 'Show current CPU and memory usage',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'top -n 1' },
        category: 'shell_commands',
        difficulty: 'medium'
      },
      {
        id: 'misc_20',
        description: 'Package management',
        prompt: 'Check which version of npm is installed',
        expectedTool: 'shell_command',
        expectedArgs: { command: 'npm --version' },
        category: 'shell_commands',
        difficulty: 'easy'
      }
    ];
  }

  /**
   * Print detailed evaluation report
   */
  printReport(summary: EvaluationSummary): void {
    console.log('\n=== FUNCTION CALL EVALUATION REPORT ===\n');
    
    console.log('OVERALL RESULTS:');
    console.log(`Total Prompts: ${summary.totalPrompts}`);
    console.log(`Successful Calls: ${summary.successfulCalls} (${(summary.successfulCalls/summary.totalPrompts*100).toFixed(1)}%)`);
    console.log(`Valid JSON Rate: ${summary.validJsonRate.toFixed(1)}%`);
    console.log(`Correct Tool Rate: ${summary.correctToolRate.toFixed(1)}%`);
    console.log(`Correct Args Rate: ${summary.correctArgsRate.toFixed(1)}%`);
    console.log(`Average Response Time: ${summary.averageResponseTime.toFixed(0)}ms`);
    
    console.log('\nCATEGORY BREAKDOWN:');
    for (const [category, stats] of Object.entries(summary.categoryBreakdown)) {
      console.log(`${category.padEnd(20)}: ${stats.success}/${stats.total} (${stats.rate.toFixed(1)}%)`);
    }
    
    console.log('\nDIFFICULTY BREAKDOWN:');
    for (const [difficulty, stats] of Object.entries(summary.difficultyBreakdown)) {
      console.log(`${difficulty.padEnd(20)}: ${stats.success}/${stats.total} (${stats.rate.toFixed(1)}%)`);
    }
    
    console.log('\n=== END REPORT ===\n');
  }
}