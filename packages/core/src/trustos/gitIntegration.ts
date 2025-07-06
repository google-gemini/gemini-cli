/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TrustContextManager } from './contextManager.js';
import { TrustChatSession } from './chatSession.js';

/**
 * Git repository information
 */
export interface GitRepoInfo {
  isRepo: boolean;
  branch: string;
  remoteName?: string;
  remoteUrl?: string;
  lastCommit?: string;
  status: {
    staged: string[];
    modified: string[];
    untracked: string[];
    deleted: string[];
  };
}

/**
 * Git diff analysis result
 */
export interface GitDiffAnalysis {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  complexity: 'low' | 'medium' | 'high';
  summary: string;
  suggestions: string[];
}

/**
 * Git integration for Trust CLI workflow automation
 * Trust: An Open System for Modern Assurance
 */
export class TrustGitIntegration {
  private repoPath: string;
  private contextManager: TrustContextManager;

  constructor(repoPath = process.cwd()) {
    this.repoPath = repoPath;
    this.contextManager = new TrustContextManager();
  }

  /**
   * Get repository information
   */
  async getRepoInfo(): Promise<GitRepoInfo> {
    try {
      // Check if it's a git repository
      const isRepo = await this.isGitRepo();
      
      if (!isRepo) {
        return {
          isRepo: false,
          branch: '',
          status: { staged: [], modified: [], untracked: [], deleted: [] },
        };
      }

      // Get current branch
      const branch = this.executeGitCommand('rev-parse --abbrev-ref HEAD').trim();
      
      // Get remote info
      let remoteName: string | undefined;
      let remoteUrl: string | undefined;
      
      try {
        remoteName = this.executeGitCommand('remote').split('\\n')[0].trim();
        if (remoteName) {
          remoteUrl = this.executeGitCommand(`remote get-url ${remoteName}`).trim();
        }
      } catch (error) {
        // No remote configured
      }

      // Get last commit
      let lastCommit: string | undefined;
      try {
        lastCommit = this.executeGitCommand('log -1 --format="%H %s"').trim();
      } catch (error) {
        // No commits yet
      }

      // Get status
      const status = await this.getStatus();

      return {
        isRepo: true,
        branch,
        remoteName,
        remoteUrl,
        lastCommit,
        status,
      };

    } catch (error) {
      throw new Error(`Failed to get repository info: ${error}`);
    }
  }

  /**
   * Analyze changes for code review
   */
  async analyzeChanges(chatSession?: TrustChatSession): Promise<GitDiffAnalysis> {
    const repoInfo = await this.getRepoInfo();
    
    if (!repoInfo.isRepo) {
      throw new Error('Not a git repository');
    }

    // Get diff for staged and modified files
    const stagedDiff = this.getStagedDiff();
    const modifiedDiff = this.getModifiedDiff();
    const combinedDiff = stagedDiff + '\\n' + modifiedDiff;

    if (!combinedDiff.trim()) {
      return {
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
        complexity: 'low',
        summary: 'No changes detected',
        suggestions: [],
      };
    }

    // Parse diff statistics
    const stats = this.parseDiffStats(combinedDiff);
    const complexity = this.assessComplexity(stats);
    
    // Use AI to analyze changes if chat session is available
    let summary = 'Changes detected in repository';
    let suggestions: string[] = [];

    if (chatSession) {
      try {
        const analysis = await this.analyzeChangesWithAI(combinedDiff, chatSession);
        summary = analysis.summary;
        suggestions = analysis.suggestions;
      } catch (error) {
        console.warn('AI analysis failed, using basic analysis:', error);
        suggestions = this.generateBasicSuggestions(stats);
      }
    } else {
      suggestions = this.generateBasicSuggestions(stats);
    }

    return {
      filesChanged: repoInfo.status.staged.length + repoInfo.status.modified.length,
      linesAdded: stats.linesAdded,
      linesRemoved: stats.linesRemoved,
      complexity,
      summary,
      suggestions,
    };
  }

  /**
   * Prepare repository context for AI analysis
   */
  async prepareRepositoryContext(options: {
    includeHistory?: boolean;
    maxFiles?: number;
    focusOnChanges?: boolean;
  } = {}): Promise<string> {
    const { includeHistory = false, maxFiles = 50, focusOnChanges = true } = options;
    
    // Clear previous context
    this.contextManager.clear();
    
    const repoInfo = await this.getRepoInfo();
    
    if (!repoInfo.isRepo) {
      throw new Error('Not a git repository');
    }

    let context = `# Repository Analysis\\n`;
    context += `**Branch:** ${repoInfo.branch}\\n`;
    context += `**Remote:** ${repoInfo.remoteUrl || 'None'}\\n`;
    context += `**Last Commit:** ${repoInfo.lastCommit || 'None'}\\n\\n`;

    // Add current changes if any
    if (focusOnChanges && (repoInfo.status.staged.length > 0 || repoInfo.status.modified.length > 0)) {
      context += `## Current Changes\\n\\n`;
      
      if (repoInfo.status.staged.length > 0) {
        context += `**Staged files:**\\n`;
        for (const file of repoInfo.status.staged) {
          context += `- ${file}\\n`;
        }
        context += '\\n';
      }
      
      if (repoInfo.status.modified.length > 0) {
        context += `**Modified files:**\\n`;
        for (const file of repoInfo.status.modified) {
          context += `- ${file}\\n`;
        }
        context += '\\n';
      }

      // Add diff content
      const diff = this.getStagedDiff() + '\\n' + this.getModifiedDiff();
      if (diff.trim()) {
        context += `## Diff\\n\\`\\`\\`diff\\n${diff}\\n\\`\\`\\`\\n\\n`;
      }
    }

    // Add important repository files to context
    try {
      const importantFiles = await this.findImportantFiles(maxFiles);
      
      for (const file of importantFiles) {
        try {
          await this.contextManager.addFile(file, this.calculateFileImportance(file));
        } catch (error) {
          console.warn(`Failed to add file to context: ${file}`, error);
        }
      }
      
      // Get optimized context
      const repoContext = this.contextManager.getOptimizedContext(
        'repository analysis code review',
        2000 // Reserve space for changes and conversation
      );
      
      if (repoContext) {
        context += `## Repository Files\\n\\n${repoContext}\\n\\n`;
      }
      
    } catch (error) {
      console.warn('Failed to analyze repository files:', error);
    }

    // Add recent commit history if requested
    if (includeHistory) {
      try {
        const history = this.getRecentCommits(10);
        context += `## Recent Commits\\n\\n${history}\\n\\n`;
      } catch (error) {
        console.warn('Failed to get commit history:', error);
      }
    }

    return context;
  }

  /**
   * Generate commit message suggestion
   */
  async suggestCommitMessage(chatSession?: TrustChatSession): Promise<string> {
    const repoInfo = await this.getRepoInfo();
    
    if (repoInfo.status.staged.length === 0) {
      throw new Error('No staged changes found');
    }

    const diff = this.getStagedDiff();
    
    if (chatSession) {
      try {
        const prompt = `Analyze this git diff and suggest a concise, conventional commit message:\\n\\n\`\`\`diff\\n${diff}\\n\`\`\`\\n\\nPlease provide just the commit message, following conventional commits format (feat/fix/docs/refactor/etc).`;
        
        const response = await chatSession.sendMessageSync(prompt);
        return response.content.trim();
      } catch (error) {
        console.warn('AI commit message generation failed:', error);
      }
    }

    // Fallback to basic commit message generation
    return this.generateBasicCommitMessage(repoInfo.status.staged);
  }

  private async isGitRepo(): Promise<boolean> {
    try {
      const gitDir = path.join(this.repoPath, '.git');
      const stats = await fs.stat(gitDir);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  private executeGitCommand(command: string): string {
    try {
      return execSync(`git ${command}`, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error: any) {
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  private async getStatus(): Promise<GitRepoInfo['status']> {
    const output = this.executeGitCommand('status --porcelain');
    
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    const deleted: string[] = [];

    for (const line of output.split('\\n')) {
      if (!line.trim()) continue;
      
      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status[0] !== ' ') staged.push(file);
      if (status[1] === 'M') modified.push(file);
      if (status === '??') untracked.push(file);
      if (status[1] === 'D' || status[0] === 'D') deleted.push(file);
    }

    return { staged, modified, untracked, deleted };
  }

  private getStagedDiff(): string {
    try {
      return this.executeGitCommand('diff --cached');
    } catch (error) {
      return '';
    }
  }

  private getModifiedDiff(): string {
    try {
      return this.executeGitCommand('diff');
    } catch (error) {
      return '';
    }
  }

  private parseDiffStats(diff: string): { linesAdded: number; linesRemoved: number } {
    const lines = diff.split('\\n');
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        linesAdded++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        linesRemoved++;
      }
    }

    return { linesAdded, linesRemoved };
  }

  private assessComplexity(stats: { linesAdded: number; linesRemoved: number }): 'low' | 'medium' | 'high' {
    const totalChanges = stats.linesAdded + stats.linesRemoved;
    
    if (totalChanges < 50) return 'low';
    if (totalChanges < 200) return 'medium';
    return 'high';
  }

  private async analyzeChangesWithAI(
    diff: string, 
    chatSession: TrustChatSession
  ): Promise<{ summary: string; suggestions: string[] }> {
    const prompt = `Analyze this git diff and provide:\\n1. A brief summary of the changes\\n2. A list of suggestions for improvement\\n\\n\`\`\`diff\\n${diff}\\n\`\`\`\\n\\nFormat your response as:\\nSUMMARY: [brief summary]\\nSUGGESTIONS:\\n- [suggestion 1]\\n- [suggestion 2]\\n- [etc]`;
    
    const response = await chatSession.sendMessageSync(prompt);
    const content = response.content;
    
    const summaryMatch = content.match(/SUMMARY:\\s*(.+)/i);
    const suggestionsMatch = content.match(/SUGGESTIONS:\\s*([\\s\\S]+)/i);
    
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Code changes detected';
    const suggestions = suggestionsMatch 
      ? suggestionsMatch[1].split('\\n').filter(line => line.trim().startsWith('-')).map(line => line.replace(/^-\\s*/, '').trim())
      : [];
    
    return { summary, suggestions };
  }

  private generateBasicSuggestions(stats: { linesAdded: number; linesRemoved: number }): string[] {
    const suggestions: string[] = [];
    
    if (stats.linesAdded > 100) {
      suggestions.push('Large number of additions - consider breaking into smaller commits');
    }
    
    if (stats.linesRemoved > 50) {
      suggestions.push('Significant code removal - ensure functionality is preserved');
    }
    
    if (stats.linesAdded > stats.linesRemoved * 3) {
      suggestions.push('Consider if some additions could be refactored or simplified');
    }
    
    suggestions.push('Run tests before committing');
    suggestions.push('Review code for potential security issues');
    
    return suggestions;
  }

  private async findImportantFiles(maxFiles: number): Promise<string[]> {
    const importantPatterns = [
      'README.md',
      'package.json',
      'Cargo.toml',
      'requirements.txt',
      'Dockerfile',
      '.gitignore',
      'tsconfig.json',
    ];
    
    const files: string[] = [];
    
    // Add important configuration files
    for (const pattern of importantPatterns) {
      try {
        const filePath = path.join(this.repoPath, pattern);
        await fs.access(filePath);
        files.push(filePath);
      } catch (error) {
        // File doesn't exist, skip
      }
    }
    
    // Add source files
    try {
      const sourceFiles = await this.findSourceFiles(maxFiles - files.length);
      files.push(...sourceFiles);
    } catch (error) {
      console.warn('Failed to find source files:', error);
    }
    
    return files.slice(0, maxFiles);
  }

  private async findSourceFiles(maxFiles: number): Promise<string[]> {
    // This would use a more sophisticated approach in production
    // For now, use git ls-files to get tracked files
    try {
      const output = this.executeGitCommand('ls-files');
      const allFiles = output.trim().split('\\n').filter(Boolean);
      
      // Filter for source code files
      const sourceFiles = allFiles.filter(file => {
        const ext = path.extname(file);
        return ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.rs'].includes(ext);
      });
      
      return sourceFiles.slice(0, maxFiles).map(file => path.join(this.repoPath, file));
    } catch (error) {
      return [];
    }
  }

  private calculateFileImportance(filePath: string): number {
    const fileName = path.basename(filePath);
    const relativePath = path.relative(this.repoPath, filePath);
    
    let importance = 1.0;
    
    // Important file names
    if (['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js'].includes(fileName)) {
      importance += 2.0;
    }
    
    // Configuration files
    if (['package.json', 'tsconfig.json', 'Dockerfile'].includes(fileName)) {
      importance += 1.5;
    }
    
    // Root level files are more important
    if (path.dirname(relativePath) === '.') {
      importance += 1.0;
    }
    
    // Test files are less important for general analysis
    if (relativePath.includes('test') || relativePath.includes('spec')) {
      importance *= 0.5;
    }
    
    return importance;
  }

  private getRecentCommits(count: number): string {
    try {
      return this.executeGitCommand(`log --oneline -${count}`);
    } catch (error) {
      return 'No commit history available';
    }
  }

  private generateBasicCommitMessage(stagedFiles: string[]): string {
    if (stagedFiles.length === 1) {
      const file = stagedFiles[0];
      const ext = path.extname(file);
      
      if (['.md', '.txt', '.rst'].includes(ext)) {
        return `docs: update ${path.basename(file)}`;
      } else if (ext === '.json' && file.includes('package')) {
        return 'chore: update dependencies';
      } else {
        return `feat: update ${path.basename(file)}`;
      }
    } else {
      return `feat: update ${stagedFiles.length} files`;
    }
  }
}