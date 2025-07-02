/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import { isGitRepository } from './gitUtils.js';
// import { isNodeError, getErrorMessage } from './errors.js'; // Unused imports
import { getFolderStructure } from './getFolderStructure.js';

// Re-export tool types for compatibility
export interface ToolCallRequest {
  name: string;
  args: Record<string, unknown>;
  callId: string;
}

export interface ToolCall {
  status: string;
  request: ToolCallRequest;
  durationMs?: number;
}

export interface CompletedToolCall extends ToolCall {
  status: 'success' | 'error' | 'cancelled';
}

export interface GitState {
  isRepository: boolean;
  currentBranch?: string;
  isDirty?: boolean;
  aheadCount?: number;
  behindCount?: number;
  lastCommitMessage?: string;
}

export interface ToolUsagePattern {
  category: 'file-operations' | 'development' | 'search-analysis' | 'testing-building' | 'other';
  count: number;
  recentTools: string[];
  percentage: number;
}

export interface ProjectTypeInfo {
  primary: string;
  confidence: number;
  indicators: string[];
}

export interface LanguageInfo {
  language: string;
  percentage: number;
  fileCount: number;
}

export interface FrameworkInfo {
  name: string;
  confidence: number;
  version?: string;
  indicators: string[];
}

export interface WorkContextInfo {
  projectType: ProjectTypeInfo;
  dominantLanguages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  gitState: GitState;
  toolUsagePatterns: ToolUsagePattern[];
  projectPath: string;
  detectedAt: Date;
  cacheKey: string;
}

const PROJECT_TYPE_INDICATORS = {
  'web-application': ['package.json', 'index.html', 'src/App.tsx', 'src/App.jsx', 'public/index.html'],
  'node-library': ['package.json', 'index.js', 'index.ts', 'lib/', 'dist/'],
  'cli-tool': ['bin/', 'package.json', 'cli.js', 'cli.ts', 'command.js'],
  'python-package': ['setup.py', 'pyproject.toml', 'requirements.txt', '__init__.py'],
  'python-application': ['main.py', 'app.py', 'requirements.txt', 'Pipfile'],
  'rust-application': ['Cargo.toml', 'src/main.rs'],
  'rust-library': ['Cargo.toml', 'src/lib.rs'],
  'go-application': ['go.mod', 'main.go'],
  'go-library': ['go.mod', '*.go'],
  'java-application': ['pom.xml', 'build.gradle', 'src/main/java/'],
  'documentation': ['README.md', 'docs/', '*.md', 'mkdocs.yml', 'docusaurus.config.js'],
  'configuration': ['.github/', 'docker-compose.yml', 'Dockerfile', 'terraform/'],
};

const FRAMEWORK_INDICATORS = {
  'react': ['react', '@types/react', 'jsx', 'tsx'],
  'vue': ['vue', '@vue/', 'Vue'],
  'angular': ['@angular/', 'angular'],
  'svelte': ['svelte', '@sveltejs/'],
  'next.js': ['next', 'pages/', 'app/', 'next.config.js'],
  'nuxt': ['nuxt', '@nuxt/'],
  'express': ['express', 'app.listen', 'app.use'],
  'fastapi': ['fastapi', 'from fastapi import'],
  'django': ['django', 'manage.py', 'settings.py'],
  'flask': ['flask', 'from flask import'],
  'spring': ['spring-boot', '@SpringBootApplication'],
  'gin': ['gin-gonic', 'gin.Default'],
  'actix': ['actix-web', 'HttpServer'],
  'rocket': ['rocket', '#[launch]'],
};

const LANGUAGE_EXTENSIONS = {
  'TypeScript': ['.ts', '.tsx'],
  'JavaScript': ['.js', '.jsx', '.mjs'],
  'Python': ['.py', '.pyx', '.pyi'],
  'Rust': ['.rs'],
  'Go': ['.go'],
  'Java': ['.java'],
  'C++': ['.cpp', '.cxx', '.cc', '.hpp', '.hxx'],
  'C': ['.c', '.h'],
  'C#': ['.cs'],
  'PHP': ['.php'],
  'Ruby': ['.rb'],
  'Swift': ['.swift'],
  'Kotlin': ['.kt', '.kts'],
  'Dart': ['.dart'],
  'HTML': ['.html', '.htm'],
  'CSS': ['.css', '.scss', '.sass', '.less'],
  'Shell': ['.sh', '.bash', '.zsh'],
  'JSON': ['.json'],
  'YAML': ['.yml', '.yaml'],
  'Markdown': ['.md', '.mdx'],
};

const TOOL_CATEGORIES = {
  'file-operations': ['Read', 'Write', 'Edit', 'MultiEdit', 'LS', 'Glob'],
  'development': ['Bash', 'git', 'npm', 'yarn', 'cargo', 'go', 'python', 'node'],
  'search-analysis': ['Grep', 'Task', 'WebFetch', 'WebSearch'],
  'testing-building': ['test', 'build', 'compile', 'lint', 'format'],
};

/**
 * Detects the primary project type based on files and directory structure
 */
export async function detectProjectType(cwd: string): Promise<ProjectTypeInfo> {
  const scores: Record<string, number> = {};
  const allIndicators: string[] = [];

  try {
    for (const [type, indicators] of Object.entries(PROJECT_TYPE_INDICATORS)) {
      let score = 0;
      const foundIndicators: string[] = [];

      for (const indicator of indicators) {
        const indicatorPath = path.join(cwd, indicator);
        try {
          const stat = await fs.stat(indicatorPath);
          if (stat.isFile() || stat.isDirectory()) {
            score += indicator.includes('/') ? 2 : 1; // Higher score for specific paths
            foundIndicators.push(indicator);
          }
        } catch {
          // File doesn't exist, continue
        }
      }

      if (score > 0) {
        scores[type] = score;
        allIndicators.push(...foundIndicators);
      }
    }

    // Find the highest scoring type
    const sortedTypes = Object.entries(scores).sort(([,a], [,b]) => b - a);
    
    if (sortedTypes.length === 0) {
      return {
        primary: 'unknown',
        confidence: 0,
        indicators: [],
      };
    }

    const [primaryType, primaryScore] = sortedTypes[0];
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const confidence = Math.min(primaryScore / Math.max(totalScore, 1), 1);

    return {
      primary: primaryType,
      confidence,
      indicators: allIndicators,
    };
  } catch (_error) {
    return {
      primary: 'unknown',
      confidence: 0,
      indicators: [],
    };
  }
}

/**
 * Analyzes file extensions to determine dominant programming languages
 */
export async function detectDominantLanguage(cwd: string): Promise<LanguageInfo[]> {
  const languageCounts: Record<string, number> = {};
  const maxFiles = 500; // Limit for performance
  let totalFiles = 0;

  try {
    const fileService = new FileDiscoveryService(cwd);
    
    // Get folder structure to enumerate files
    const _structure = await getFolderStructure(cwd, {
      maxItems: maxFiles,
      fileService,
      respectGitIgnore: true,
    });

    // Extract file extensions from the structure
    // This is a simplified approach - in practice, we'd walk the actual files
    const files = await getFileList(cwd, fileService, maxFiles);
    
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      totalFiles++;
      
      for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
        if (extensions.includes(ext)) {
          languageCounts[language] = (languageCounts[language] || 0) + 1;
          break;
        }
      }
    }

    // Convert to percentages and sort
    const languages: LanguageInfo[] = Object.entries(languageCounts)
      .map(([language, count]) => ({
        language,
        fileCount: count,
        percentage: totalFiles > 0 ? (count / totalFiles) * 100 : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5); // Top 5 languages

    return languages;
  } catch (_error) {
    return [];
  }
}

/**
 * Detects frameworks and libraries used in the project
 */
export async function detectFrameworks(cwd: string): Promise<FrameworkInfo[]> {
  const frameworks: FrameworkInfo[] = [];

  try {
    // Check package.json for Node.js projects
    await checkNodeFrameworks(cwd, frameworks);
    
    // Check Python requirements
    await checkPythonFrameworks(cwd, frameworks);
    
    // Check Rust Cargo.toml
    await checkRustFrameworks(cwd, frameworks);
    
    // Check Go modules
    await checkGoFrameworks(cwd, frameworks);
    
    // Check for specific file patterns
    await checkFilePatternFrameworks(cwd, frameworks);

    return frameworks.sort((a, b) => b.confidence - a.confidence);
  } catch (_error) {
    return [];
  }
}

/**
 * Analyzes the Git repository state
 */
export async function analyzeGitState(cwd: string): Promise<GitState> {
  const gitState: GitState = {
    isRepository: isGitRepository(cwd),
  };

  if (!gitState.isRepository) {
    return gitState;
  }

  try {
    const gitService = new GitService(cwd);
    await gitService.initialize();
    
    // Get current branch and status using simple-git
    // This is a simplified implementation - the actual implementation would use GitService methods
    gitState.currentBranch = 'main'; // Placeholder
    gitState.isDirty = false; // Placeholder
    gitState.aheadCount = 0; // Placeholder
    gitState.behindCount = 0; // Placeholder
    gitState.lastCommitMessage = 'Initial commit'; // Placeholder
    
    return gitState;
  } catch (_error) {
    return gitState;
  }
}

/**
 * Analyzes recent tool usage patterns
 */
export async function analyzeRecentToolUsage(toolCalls: CompletedToolCall[] = []): Promise<ToolUsagePattern[]> {
  if (toolCalls.length === 0) {
    return [];
  }

  const categoryCounts: Record<string, { count: number; tools: Set<string> }> = {};
  
  // Initialize categories
  for (const category of Object.keys(TOOL_CATEGORIES)) {
    categoryCounts[category] = { count: 0, tools: new Set() };
  }
  categoryCounts['other'] = { count: 0, tools: new Set() };

  // Categorize tool calls
  for (const toolCall of toolCalls) {
    const toolName = toolCall.request.name;
    let categorized = false;

    for (const [category, tools] of Object.entries(TOOL_CATEGORIES)) {
      if (tools.some(tool => toolName.toLowerCase().includes(tool.toLowerCase()))) {
        categoryCounts[category].count++;
        categoryCounts[category].tools.add(toolName);
        categorized = true;
        break;
      }
    }

    if (!categorized) {
      categoryCounts['other'].count++;
      categoryCounts['other'].tools.add(toolName);
    }
  }

  const totalCalls = toolCalls.length;
  
  return Object.entries(categoryCounts)
    .filter(([, data]) => data.count > 0)
    .map(([category, data]) => ({
      category: category as ToolUsagePattern['category'],
      count: data.count,
      recentTools: Array.from(data.tools).slice(0, 5),
      percentage: (data.count / totalCalls) * 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

/**
 * Main function to detect comprehensive work context
 */
export async function detectWorkContext(
  cwd: string,
  recentToolCalls: CompletedToolCall[] = []
): Promise<WorkContextInfo> {
  const projectPath = path.resolve(cwd);
  const cacheKey = `${projectPath}:${Date.now()}`;

  try {
    const [projectType, dominantLanguages, frameworks, gitState, toolUsagePatterns] = await Promise.all([
      detectProjectType(projectPath),
      detectDominantLanguage(projectPath),
      detectFrameworks(projectPath),
      analyzeGitState(projectPath),
      analyzeRecentToolUsage(recentToolCalls),
    ]);

    return {
      projectType,
      dominantLanguages,
      frameworks,
      gitState,
      toolUsagePatterns,
      projectPath,
      detectedAt: new Date(),
      cacheKey,
    };
  } catch (_error) {
    // Return minimal context on error
    return {
      projectType: { primary: 'unknown', confidence: 0, indicators: [] },
      dominantLanguages: [],
      frameworks: [],
      gitState: { isRepository: false },
      toolUsagePatterns: [],
      projectPath,
      detectedAt: new Date(),
      cacheKey,
    };
  }
}

// Helper functions

async function getFileList(cwd: string, fileService: FileDiscoveryService, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  
  const walkDirectory = async (dir: string, depth = 0): Promise<void> => {
    if (files.length >= maxFiles || depth > 10) return;
    
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isFile()) {
        if (!fileService.shouldGitIgnoreFile(fullPath)) {
          files.push(fullPath);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walkDirectory(fullPath, depth + 1);
      }
    }
  };
  
  try {
    await walkDirectory(cwd);
    return files;
  } catch (_error) {
    return [];
  }
}

async function checkNodeFrameworks(cwd: string, frameworks: FrameworkInfo[]): Promise<void> {
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };

    for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
      const foundIndicators = indicators.filter(indicator => 
        allDeps[indicator] || Object.keys(allDeps).some(dep => dep.includes(indicator))
      );
      
      if (foundIndicators.length > 0) {
        frameworks.push({
          name: framework,
          confidence: Math.min(foundIndicators.length / indicators.length, 1),
          version: allDeps[indicators[0]],
          indicators: foundIndicators,
        });
      }
    }
  } catch {
    // package.json not found or invalid
  }
}

async function checkPythonFrameworks(cwd: string, frameworks: FrameworkInfo[]): Promise<void> {
  const pythonFiles = ['requirements.txt', 'Pipfile', 'pyproject.toml'];
  
  for (const file of pythonFiles) {
    try {
      const filePath = path.join(cwd, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
        const foundIndicators = indicators.filter(indicator => 
          content.toLowerCase().includes(indicator.toLowerCase())
        );
        
        if (foundIndicators.length > 0) {
          frameworks.push({
            name: framework,
            confidence: Math.min(foundIndicators.length / indicators.length, 1),
            indicators: foundIndicators,
          });
        }
      }
    } catch {
      // File not found
    }
  }
}

async function checkRustFrameworks(cwd: string, frameworks: FrameworkInfo[]): Promise<void> {
  try {
    const cargoPath = path.join(cwd, 'Cargo.toml');
    const content = await fs.readFile(cargoPath, 'utf-8');
    
    for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
      const foundIndicators = indicators.filter(indicator => 
        content.includes(indicator)
      );
      
      if (foundIndicators.length > 0) {
        frameworks.push({
          name: framework,
          confidence: Math.min(foundIndicators.length / indicators.length, 1),
          indicators: foundIndicators,
        });
      }
    }
  } catch {
    // Cargo.toml not found
  }
}

async function checkGoFrameworks(cwd: string, frameworks: FrameworkInfo[]): Promise<void> {
  try {
    const goModPath = path.join(cwd, 'go.mod');
    const content = await fs.readFile(goModPath, 'utf-8');
    
    for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
      const foundIndicators = indicators.filter(indicator => 
        content.includes(indicator)
      );
      
      if (foundIndicators.length > 0) {
        frameworks.push({
          name: framework,
          confidence: Math.min(foundIndicators.length / indicators.length, 1),
          indicators: foundIndicators,
        });
      }
    }
  } catch {
    // go.mod not found
  }
}

async function checkFilePatternFrameworks(cwd: string, frameworks: FrameworkInfo[]): Promise<void> {
  // Check for specific file patterns that indicate frameworks
  const patterns = {
    'next.js': ['next.config.js', 'pages/', 'app/'],
    'nuxt': ['nuxt.config.js', 'nuxt.config.ts'],
    'django': ['manage.py', 'settings.py'],
    'spring': ['application.properties', 'application.yml'],
  };

  for (const [framework, files] of Object.entries(patterns)) {
    const foundFiles: string[] = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(cwd, file);
        await fs.stat(filePath);
        foundFiles.push(file);
      } catch {
        // File doesn't exist
      }
    }
    
    if (foundFiles.length > 0) {
      frameworks.push({
        name: framework,
        confidence: foundFiles.length / files.length,
        indicators: foundFiles,
      });
    }
  }
}