/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Example usage of promptTemplates module for generating context-aware prompts.
 * This file demonstrates how to use the various template functions.
 */

import {
  createContextualPrompt,
  getProjectTypePrompt,
  getLanguagePrompt,
  getFrameworkPrompt,
  getReactTypeScriptTemplate,
  getNodeExpressTemplate,
} from './promptTemplates.js';
import { 
  ProjectTypeInfo,
  LanguageInfo,
  FrameworkInfo,
  GitState,
  ToolUsagePattern,
} from './workContextDetector.js';

// Example 1: React TypeScript Web Application
export function getReactAppPrompt(): string {
  const projectType: ProjectTypeInfo = {
    primary: 'web-application',
    confidence: 0.9,
    indicators: ['package.json', 'src/App.tsx', 'public/index.html'],
  };

  const languages: LanguageInfo[] = [
    { language: 'TypeScript', percentage: 70, fileCount: 35 },
    { language: 'JavaScript', percentage: 20, fileCount: 10 },
    { language: 'CSS', percentage: 10, fileCount: 5 },
  ];

  const frameworks: FrameworkInfo[] = [
    { name: 'react', confidence: 0.95, indicators: ['react', '@types/react'] },
    { name: 'next.js', confidence: 0.8, indicators: ['next', 'pages/'] },
  ];

  const gitState: GitState = {
    isRepository: true,
    currentBranch: 'feature/new-component',
    isDirty: true,
    aheadCount: 2,
    behindCount: 0,
  };

  const toolPatterns: ToolUsagePattern[] = [
    {
      category: 'development',
      count: 15,
      recentTools: ['npm', 'git', 'node'],
      percentage: 60,
    },
    {
      category: 'file-operations',
      count: 8,
      recentTools: ['Read', 'Write', 'Edit'],
      percentage: 32,
    },
  ];

  return createContextualPrompt(projectType, languages, frameworks, gitState, toolPatterns);
}

// Example 2: Node.js API Backend
export function getNodeApiPrompt(): string {
  const projectType: ProjectTypeInfo = {
    primary: 'node-library',
    confidence: 0.85,
    indicators: ['package.json', 'src/index.ts', 'lib/'],
  };

  const languages: LanguageInfo[] = [
    { language: 'TypeScript', percentage: 80, fileCount: 40 },
    { language: 'JavaScript', percentage: 15, fileCount: 8 },
    { language: 'JSON', percentage: 5, fileCount: 3 },
  ];

  const frameworks: FrameworkInfo[] = [
    { name: 'express', confidence: 0.9, indicators: ['express', 'app.listen'] },
  ];

  const gitState: GitState = {
    isRepository: true,
    currentBranch: 'main',
    isDirty: false,
    aheadCount: 0,
    behindCount: 1,
  };

  const toolPatterns: ToolUsagePattern[] = [
    {
      category: 'testing-building',
      count: 20,
      recentTools: ['test', 'build', 'lint'],
      percentage: 50,
    },
    {
      category: 'development',
      count: 12,
      recentTools: ['npm', 'node', 'git'],
      percentage: 30,
    },
  ];

  return createContextualPrompt(projectType, languages, frameworks, gitState, toolPatterns);
}

// Example 3: Python Data Science Project
export function getPythonDataPrompt(): string {
  const projectType: ProjectTypeInfo = {
    primary: 'python-application',
    confidence: 0.9,
    indicators: ['requirements.txt', 'main.py', 'notebooks/'],
  };

  const languages: LanguageInfo[] = [
    { language: 'Python', percentage: 85, fileCount: 25 },
    { language: 'Jupyter Notebook', percentage: 10, fileCount: 5 },
    { language: 'Markdown', percentage: 5, fileCount: 3 },
  ];

  const frameworks: FrameworkInfo[] = [
    { name: 'fastapi', confidence: 0.7, indicators: ['fastapi', 'from fastapi import'] },
  ];

  const gitState: GitState = {
    isRepository: true,
    currentBranch: 'experiment/new-model',
    isDirty: true,
    aheadCount: 5,
    behindCount: 0,
  };

  const toolPatterns: ToolUsagePattern[] = [
    {
      category: 'search-analysis',
      count: 25,
      recentTools: ['Grep', 'Task', 'WebSearch'],
      percentage: 55,
    },
    {
      category: 'file-operations',
      count: 15,
      recentTools: ['Read', 'Write', 'Edit'],
      percentage: 33,
    },
  ];

  return createContextualPrompt(projectType, languages, frameworks, gitState, toolPatterns);
}

// Example 4: CLI Tool Development
export function getCliToolPrompt(): string {
  const projectType: ProjectTypeInfo = {
    primary: 'cli-tool',
    confidence: 0.95,
    indicators: ['package.json', 'bin/', 'cli.ts'],
  };

  const languages: LanguageInfo[] = [
    { language: 'TypeScript', percentage: 90, fileCount: 20 },
    { language: 'Shell', percentage: 10, fileCount: 3 },
  ];

  const frameworks: FrameworkInfo[] = [];

  const gitState: GitState = {
    isRepository: true,
    currentBranch: 'main',
    isDirty: false,
    aheadCount: 0,
    behindCount: 0,
  };

  const toolPatterns: ToolUsagePattern[] = [
    {
      category: 'development',
      count: 18,
      recentTools: ['npm', 'node', 'git'],
      percentage: 45,
    },
    {
      category: 'testing-building',
      count: 16,
      recentTools: ['test', 'build', 'lint'],
      percentage: 40,
    },
  ];

  return createContextualPrompt(projectType, languages, frameworks, gitState, toolPatterns);
}

// Example 5: Using individual template functions
export function getIndividualTemplateExample(): string {
  const sections: string[] = [];

  // Add project-specific guidance
  sections.push(getProjectTypePrompt('web-application'));

  // Add language-specific guidance
  sections.push(getLanguagePrompt('TypeScript'));

  // Add framework-specific guidance
  sections.push(getFrameworkPrompt('react'));

  // Use specialized templates for common scenarios
  sections.push(getReactTypeScriptTemplate());

  return sections.join('\n\n---\n\n');
}

// Example 6: API Development Context
export function getApiDevelopmentContext(): string {
  return getNodeExpressTemplate();
}

// Usage examples for testing or demonstration
// Note: Uncomment below for standalone execution
/*
console.log('=== React TypeScript Web App Context ===');
console.log(getReactAppPrompt());

console.log('\n\n=== Node.js API Context ===');
console.log(getNodeApiPrompt());

console.log('\n\n=== Python Data Science Context ===');
console.log(getPythonDataPrompt());

console.log('\n\n=== CLI Tool Context ===');
console.log(getCliToolPrompt());

console.log('\n\n=== Individual Templates ===');
console.log(getIndividualTemplateExample());
*/