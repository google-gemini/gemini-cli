/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getProjectTypePrompt,
  getLanguagePrompt,
  getFrameworkPrompt,
  getGitWorkflowPrompt,
  getToolUsagePrompt,
  createContextualPrompt,
  getReactTypeScriptTemplate,
  getNodeExpressTemplate,
  getPythonDataScienceTemplate,
  getCLIToolTemplate,
  getLibraryPackageTemplate,
  getFallbackTemplate,
} from './promptTemplates.js';
import { GitState, ToolUsagePattern, FrameworkInfo, LanguageInfo, ProjectTypeInfo } from './workContextDetector.js';

describe('promptTemplates', () => {
  describe('getProjectTypePrompt', () => {
    it('should return web application template for web-application type', () => {
      const prompt = getProjectTypePrompt('web-application');
      expect(prompt).toContain('web application');
      expect(prompt).toContain('Component-based architecture');
      expect(prompt).toContain('Bundle size optimization');
    });

    it('should return node library template for node-library type', () => {
      const prompt = getProjectTypePrompt('node-library');
      expect(prompt).toContain('Node.js library');
      expect(prompt).toContain('public APIs');
      expect(prompt).toContain('Semantic versioning');
    });

    it('should return CLI tool template for cli-tool type', () => {
      const prompt = getProjectTypePrompt('cli-tool');
      expect(prompt).toContain('CLI tool');
      expect(prompt).toContain('command-line interface');
      expect(prompt).toContain('Cross-platform compatibility');
    });

    it('should return Python package template for python-package type', () => {
      const prompt = getProjectTypePrompt('python-package');
      expect(prompt).toContain('Python package');
      expect(prompt).toContain('PEP 8 compliance');
      expect(prompt).toContain('PyPI');
    });

    it('should return Python application template for python-application type', () => {
      const prompt = getProjectTypePrompt('python-application');
      expect(prompt).toContain('Python application');
      expect(prompt).toContain('Clean architecture');
      expect(prompt).toContain('Configuration management');
    });

    it('should return Rust application template for rust-application type', () => {
      const prompt = getProjectTypePrompt('rust-application');
      expect(prompt).toContain('Rust application');
      expect(prompt).toContain('Memory safety');
      expect(prompt).toContain('Result types');
    });

    it('should return Rust library template for rust-library type', () => {
      const prompt = getProjectTypePrompt('rust-library');
      expect(prompt).toContain('Rust library');
      expect(prompt).toContain('API design');
      expect(prompt).toContain('Zero-cost abstractions');
    });

    it('should return Go application template for go-application type', () => {
      const prompt = getProjectTypePrompt('go-application');
      expect(prompt).toContain('Go application');
      expect(prompt).toContain('Idiomatic Go');
      expect(prompt).toContain('Goroutines');
    });

    it('should return Go library template for go-library type', () => {
      const prompt = getProjectTypePrompt('go-library');
      expect(prompt).toContain('Go library');
      expect(prompt).toContain('API design');
      expect(prompt).toContain('godoc comments');
    });

    it('should return Java application template for java-application type', () => {
      const prompt = getProjectTypePrompt('java-application');
      expect(prompt).toContain('Java application');
      expect(prompt).toContain('Object-oriented design');
      expect(prompt).toContain('JUnit');
    });

    it('should return documentation template for documentation type', () => {
      const prompt = getProjectTypePrompt('documentation');
      expect(prompt).toContain('documentation');
      expect(prompt).toContain('Clear, concise writing');
      expect(prompt).toContain('Code examples');
    });

    it('should return configuration template for configuration type', () => {
      const prompt = getProjectTypePrompt('configuration');
      expect(prompt).toContain('configuration');
      expect(prompt).toContain('Infrastructure as Code');
      expect(prompt).toContain('Security scanning');
    });

    it('should return fallback template for unknown project type', () => {
      const prompt = getProjectTypePrompt('unknown-project-type');
      expect(prompt).toContain('unknown-project-type project');
      expect(prompt).toContain('best practices');
      expect(prompt).toContain('Clean, readable');
    });
  });

  describe('getLanguagePrompt', () => {
    it('should return TypeScript-specific guidance', () => {
      const prompt = getLanguagePrompt('TypeScript');
      expect(prompt).toContain('TypeScript guidance');
      expect(prompt).toContain('strong typing');
      expect(prompt).toContain('interfaces');
      expect(prompt).toContain('generics');
    });

    it('should return JavaScript-specific guidance', () => {
      const prompt = getLanguagePrompt('JavaScript');
      expect(prompt).toContain('JavaScript guidance');
      expect(prompt).toContain('ES6+');
      expect(prompt).toContain('async/await');
      expect(prompt).toContain('const/let');
    });

    it('should return Python-specific guidance', () => {
      const prompt = getLanguagePrompt('Python');
      expect(prompt).toContain('Python guidance');
      expect(prompt).toContain('PEP 8');
      expect(prompt).toContain('type hints');
      expect(prompt).toContain('list comprehensions');
    });

    it('should return Rust-specific guidance', () => {
      const prompt = getLanguagePrompt('Rust');
      expect(prompt).toContain('Rust guidance');
      expect(prompt).toContain('ownership');
      expect(prompt).toContain('borrowing');
      expect(prompt).toContain('Result<T, E>');
    });

    it('should return Go-specific guidance', () => {
      const prompt = getLanguagePrompt('Go');
      expect(prompt).toContain('Go guidance');
      expect(prompt).toContain('Go conventions');
      expect(prompt).toContain('interfaces');
      expect(prompt).toContain('goroutines');
    });

    it('should return Java-specific guidance', () => {
      const prompt = getLanguagePrompt('Java');
      expect(prompt).toContain('Java guidance');
      expect(prompt).toContain('Java naming conventions');
      expect(prompt).toContain('access modifiers');
      expect(prompt).toContain('JUnit');
    });

    it('should return C++-specific guidance', () => {
      const prompt = getLanguagePrompt('C++');
      expect(prompt).toContain('C++ guidance');
      expect(prompt).toContain('RAII');
      expect(prompt).toContain('smart pointers');
      expect(prompt).toContain('const correctness');
    });

    it('should return C#-specific guidance', () => {
      const prompt = getLanguagePrompt('C#');
      expect(prompt).toContain('C# guidance');
      expect(prompt).toContain('C# naming conventions');
      expect(prompt).toContain('properties');
      expect(prompt).toContain('IDisposable');
    });

    it('should return PHP-specific guidance', () => {
      const prompt = getLanguagePrompt('PHP');
      expect(prompt).toContain('PHP guidance');
      expect(prompt).toContain('PHP 8+');
      expect(prompt).toContain('PSR standards');
      expect(prompt).toContain('Composer');
    });

    it('should return Ruby-specific guidance', () => {
      const prompt = getLanguagePrompt('Ruby');
      expect(prompt).toContain('Ruby guidance');
      expect(prompt).toContain('Ruby conventions');
      expect(prompt).toContain('blocks');
      expect(prompt).toContain('RSpec');
    });

    it('should return fallback template for unknown language', () => {
      const prompt = getLanguagePrompt('UnknownLang');
      expect(prompt).toContain('UnknownLang guidance');
      expect(prompt).toContain('best practices');
      expect(prompt).toContain('conventions');
    });
  });

  describe('getFrameworkPrompt', () => {
    it('should return React-specific guidance', () => {
      const prompt = getFrameworkPrompt('react');
      expect(prompt).toContain('React-specific');
      expect(prompt).toContain('functional components');
      expect(prompt).toContain('hooks');
      expect(prompt).toContain('useMemo');
    });

    it('should return Vue-specific guidance', () => {
      const prompt = getFrameworkPrompt('vue');
      expect(prompt).toContain('Vue.js-specific');
      expect(prompt).toContain('Composition API');
      expect(prompt).toContain('reactive data binding');
      expect(prompt).toContain('single-file components');
    });

    it('should return Angular-specific guidance', () => {
      const prompt = getFrameworkPrompt('angular');
      expect(prompt).toContain('Angular-specific');
      expect(prompt).toContain('Angular CLI');
      expect(prompt).toContain('dependency injection');
      expect(prompt).toContain('RxJS');
    });

    it('should return Next.js-specific guidance', () => {
      const prompt = getFrameworkPrompt('next.js');
      expect(prompt).toContain('Next.js-specific');
      expect(prompt).toContain('static generation');
      expect(prompt).toContain('server-side rendering');
      expect(prompt).toContain('next/image');
    });

    it('should return Express-specific guidance', () => {
      const prompt = getFrameworkPrompt('express');
      expect(prompt).toContain('Express.js-specific');
      expect(prompt).toContain('middleware');
      expect(prompt).toContain('error handling');
      expect(prompt).toContain('route parameters');
    });

    it('should return FastAPI-specific guidance', () => {
      const prompt = getFrameworkPrompt('fastapi');
      expect(prompt).toContain('FastAPI-specific');
      expect(prompt).toContain('OpenAPI');
      expect(prompt).toContain('Pydantic');
      expect(prompt).toContain('dependency injection');
    });

    it('should return Django-specific guidance', () => {
      const prompt = getFrameworkPrompt('django');
      expect(prompt).toContain('Django-specific');
      expect(prompt).toContain('model-view-template');
      expect(prompt).toContain('Django ORM');
      expect(prompt).toContain('Django admin');
    });

    it('should return Flask-specific guidance', () => {
      const prompt = getFrameworkPrompt('flask');
      expect(prompt).toContain('Flask-specific');
      expect(prompt).toContain('lightweight');
      expect(prompt).toContain('blueprints');
      expect(prompt).toContain('application factories');
    });

    it('should return Spring-specific guidance', () => {
      const prompt = getFrameworkPrompt('spring');
      expect(prompt).toContain('Spring Boot-specific');
      expect(prompt).toContain('dependency injection');
      expect(prompt).toContain('auto-configuration');
      expect(prompt).toContain('Spring Security');
    });

    it('should return fallback template for unknown framework', () => {
      const prompt = getFrameworkPrompt('unknown-framework');
      expect(prompt).toContain('unknown-framework guidance');
      expect(prompt).toContain('framework conventions');
      expect(prompt).toContain('best practices');
    });
  });

  describe('getGitWorkflowPrompt', () => {
    it('should return non-repository guidance when not a git repo', () => {
      const gitState: GitState = { isRepository: false };
      const prompt = getGitWorkflowPrompt(gitState);
      expect(prompt).toContain('Version control guidance');
      expect(prompt).toContain('initializing a Git repository');
      expect(prompt).toContain('.gitignore');
    });

    it('should return basic git guidance for clean repository', () => {
      const gitState: GitState = {
        isRepository: true,
        currentBranch: 'main',
        isDirty: false,
        aheadCount: 0,
        behindCount: 0,
      };
      const prompt = getGitWorkflowPrompt(gitState);
      expect(prompt).toContain('Git workflow guidance for main branch');
      expect(prompt).toContain('feature branches');
      expect(prompt).toContain('commits atomic');
    });

    it('should include dirty state guidance', () => {
      const gitState: GitState = {
        isRepository: true,
        currentBranch: 'feature-branch',
        isDirty: true,
        aheadCount: 0,
        behindCount: 0,
      };
      const prompt = getGitWorkflowPrompt(gitState);
      expect(prompt).toContain('uncommitted changes');
      expect(prompt).toContain('meaningful commits');
      expect(prompt).toContain('descriptive commit messages');
    });

    it('should include ahead count guidance', () => {
      const gitState: GitState = {
        isRepository: true,
        currentBranch: 'main',
        isDirty: false,
        aheadCount: 3,
        behindCount: 0,
      };
      const prompt = getGitWorkflowPrompt(gitState);
      expect(prompt).toContain('3 commit(s) ahead');
      expect(prompt).toContain('consider pushing changes');
      expect(prompt).toContain('tests pass before pushing');
    });

    it('should include behind count guidance', () => {
      const gitState: GitState = {
        isRepository: true,
        currentBranch: 'main',
        isDirty: false,
        aheadCount: 0,
        behindCount: 2,
      };
      const prompt = getGitWorkflowPrompt(gitState);
      expect(prompt).toContain('2 commit(s) behind');
      expect(prompt).toContain('consider pulling latest changes');
      expect(prompt).toContain('merge conflicts');
    });

    it('should handle missing branch name', () => {
      const gitState: GitState = {
        isRepository: true,
        isDirty: false,
      };
      const prompt = getGitWorkflowPrompt(gitState);
      expect(prompt).toContain('Git workflow guidance for current branch');
    });
  });

  describe('getToolUsagePrompt', () => {
    it('should return generic guidance for empty tool patterns', () => {
      const prompt = getToolUsagePrompt([]);
      expect(prompt).toContain('Development workflow guidance');
      expect(prompt).toContain('appropriate tools');
      expect(prompt).toContain('automation');
    });

    it('should return file-operations specific guidance', () => {
      const toolPatterns: ToolUsagePattern[] = [
        {
          category: 'file-operations',
          count: 10,
          recentTools: ['Read', 'Write', 'Edit'],
          percentage: 60,
        },
      ];
      const prompt = getToolUsagePrompt(toolPatterns);
      expect(prompt).toContain('file-operations: 60.0%');
      expect(prompt).toContain('actively working with files');
      expect(prompt).toContain('backup and version control');
    });

    it('should return development specific guidance', () => {
      const toolPatterns: ToolUsagePattern[] = [
        {
          category: 'development',
          count: 8,
          recentTools: ['Bash', 'npm', 'git'],
          percentage: 50,
        },
      ];
      const prompt = getToolUsagePrompt(toolPatterns);
      expect(prompt).toContain('development: 50.0%');
      expect(prompt).toContain('active development mode');
      expect(prompt).toContain('testing practices');
    });

    it('should return search-analysis specific guidance', () => {
      const toolPatterns: ToolUsagePattern[] = [
        {
          category: 'search-analysis',
          count: 6,
          recentTools: ['Grep', 'WebSearch'],
          percentage: 40,
        },
      ];
      const prompt = getToolUsagePrompt(toolPatterns);
      expect(prompt).toContain('search-analysis: 40.0%');
      expect(prompt).toContain('analyzing code');
      expect(prompt).toContain('architectural documentation');
    });

    it('should return testing-building specific guidance', () => {
      const toolPatterns: ToolUsagePattern[] = [
        {
          category: 'testing-building',
          count: 7,
          recentTools: ['test', 'build', 'lint'],
          percentage: 45,
        },
      ];
      const prompt = getToolUsagePrompt(toolPatterns);
      expect(prompt).toContain('testing-building: 45.0%');
      expect(prompt).toContain('testing and building');
      expect(prompt).toContain('test coverage');
    });

    it('should return other category guidance', () => {
      const toolPatterns: ToolUsagePattern[] = [
        {
          category: 'other',
          count: 5,
          recentTools: ['CustomTool'],
          percentage: 30,
        },
      ];
      const prompt = getToolUsagePrompt(toolPatterns);
      expect(prompt).toContain('other: 30.0%');
      expect(prompt).toContain('varied development activities');
      expect(prompt).toContain('consistency');
    });
  });

  describe('createContextualPrompt', () => {
    it('should combine multiple context types into a comprehensive prompt', () => {
      const projectType: ProjectTypeInfo = {
        primary: 'web-application',
        confidence: 0.8,
        indicators: ['package.json', 'src/App.tsx'],
      };
      const dominantLanguages: LanguageInfo[] = [
        { language: 'TypeScript', percentage: 60, fileCount: 30 },
        { language: 'JavaScript', percentage: 25, fileCount: 12 },
      ];
      const frameworks: FrameworkInfo[] = [
        { name: 'react', confidence: 0.9, indicators: ['react'] },
        { name: 'next.js', confidence: 0.7, indicators: ['next'] },
      ];
      const gitState: GitState = {
        isRepository: true,
        currentBranch: 'main',
        isDirty: true,
      };
      const toolPatterns: ToolUsagePattern[] = [
        {
          category: 'development',
          count: 10,
          recentTools: ['npm', 'git'],
          percentage: 50,
        },
      ];

      const prompt = createContextualPrompt(
        projectType,
        dominantLanguages,
        frameworks,
        gitState,
        toolPatterns
      );

      expect(prompt).toContain('web application');
      expect(prompt).toContain('TypeScript guidance');
      expect(prompt).toContain('JavaScript guidance');
      expect(prompt).toContain('React-specific');
      expect(prompt).toContain('Next.js-specific');
      expect(prompt).toContain('Git workflow guidance');
      expect(prompt).toContain('development: 50.0%');
    });

    it('should filter out low-confidence contexts', () => {
      const projectType: ProjectTypeInfo = {
        primary: 'unknown',
        confidence: 0.1,
        indicators: [],
      };
      const dominantLanguages: LanguageInfo[] = [
        { language: 'TypeScript', percentage: 5, fileCount: 2 },
      ];
      const frameworks: FrameworkInfo[] = [
        { name: 'react', confidence: 0.2, indicators: [] },
      ];
      const gitState: GitState = { isRepository: false };
      const toolPatterns: ToolUsagePattern[] = [];

      const prompt = createContextualPrompt(
        projectType,
        dominantLanguages,
        frameworks,
        gitState,
        toolPatterns
      );

      expect(prompt).not.toContain('web application');
      expect(prompt).not.toContain('TypeScript guidance');
      expect(prompt).not.toContain('React-specific');
      expect(prompt).toContain('Version control guidance');
      expect(prompt).toContain('Development workflow guidance');
    });
  });

  describe('specific templates', () => {
    it('should return React TypeScript template', () => {
      const template = getReactTypeScriptTemplate();
      expect(template).toContain('React + TypeScript');
      expect(template).toContain('Component Development');
      expect(template).toContain('Type Safety');
      expect(template).toContain('Testing Strategy');
      expect(template).toContain('Performance Optimization');
      expect(template).toContain('Build and Deployment');
    });

    it('should return Node Express template', () => {
      const template = getNodeExpressTemplate();
      expect(template).toContain('Node.js + Express');
      expect(template).toContain('API Design');
      expect(template).toContain('Security Implementation');
      expect(template).toContain('Error Handling');
      expect(template).toContain('Database Integration');
      expect(template).toContain('Testing and Monitoring');
    });

    it('should return Python Data Science template', () => {
      const template = getPythonDataScienceTemplate();
      expect(template).toContain('Python Data Science');
      expect(template).toContain('Data Management');
      expect(template).toContain('Analysis and Modeling');
      expect(template).toContain('Visualization');
      expect(template).toContain('Code Organization');
      expect(template).toContain('Deployment and Sharing');
    });

    it('should return CLI Tool template', () => {
      const template = getCLIToolTemplate();
      expect(template).toContain('CLI Tool Development');
      expect(template).toContain('User Interface Design');
      expect(template).toContain('Argument Handling');
      expect(template).toContain('Cross-Platform Compatibility');
      expect(template).toContain('Error Handling and Feedback');
      expect(template).toContain('Testing and Distribution');
    });

    it('should return Library Package template', () => {
      const template = getLibraryPackageTemplate();
      expect(template).toContain('Library/Package Development');
      expect(template).toContain('API Design');
      expect(template).toContain('Code Quality');
      expect(template).toContain('Documentation');
      expect(template).toContain('Distribution');
      expect(template).toContain('Maintenance');
    });

    it('should return Fallback template', () => {
      const template = getFallbackTemplate();
      expect(template).toContain('General Software Development');
      expect(template).toContain('Code Quality');
      expect(template).toContain('Testing');
      expect(template).toContain('Documentation');
      expect(template).toContain('Version Control');
      expect(template).toContain('Security');
      expect(template).toContain('Performance');
    });
  });
});