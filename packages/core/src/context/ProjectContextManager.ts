/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ProjectContext,
  DirectoryNode,
  CodingPattern,
  ProjectDependency,
  ProjectPreferences,
  GitContext,
} from './memory-interfaces.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Manages project-level context analysis and tracking
 */
export class ProjectContextManager {
  /**
   * Analyze project structure and create context
   */
  async analyzeProject(rootPath: string): Promise<ProjectContext> {
    const normalizedRoot = path.resolve(rootPath);
    const name = path.basename(normalizedRoot);

    // Detect project type and configuration
    const { type, buildSystem, testFramework } =
      await this.detectProjectType(normalizedRoot);
    const languages = await this.detectLanguages(normalizedRoot);
    const configFiles = await this.detectConfigFiles(normalizedRoot);
    const dependencies = await this.detectDependencies(normalizedRoot);
    const frameworks = await this.detectFrameworks(dependencies);

    // Analyze directory structure
    const structure = await this.analyzeDirectoryStructure(normalizedRoot);

    // Detect coding patterns (this would need source files)
    const sourceFiles = await this.collectSourceFiles(
      normalizedRoot,
      languages,
    );
    const patterns = await this.detectCodingPatterns(sourceFiles);

    // Detect preferences
    const preferences = await this.detectPreferences(normalizedRoot);

    // Analyze git context
    const git = await this.analyzeGitContext(normalizedRoot);

    // Find documentation files
    const documentation = await this.findDocumentationFiles(normalizedRoot);

    return {
      rootPath: normalizedRoot,
      name,
      type,
      languages,
      frameworks,
      buildSystem,
      testFramework,
      configFiles,
      dependencies,
      patterns,
      structure,
      git,
      documentation,
      lastAnalyzed: Date.now(),
      preferences,
    };
  }

  /**
   * Detect project type from configuration files and structure
   */
  async detectProjectType(rootPath: string): Promise<{
    type: ProjectContext['type'];
    buildSystem?: string;
    testFramework?: string;
  }> {
    try {
      // Check for package.json (Node.js projects)
      const packageJsonPath = path.join(rootPath, 'package.json');
      if (await this.fileExists(packageJsonPath)) {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, 'utf-8'),
        ) as Record<string, unknown>;

        // Check for Next.js
        if (
          (packageJson.dependencies as Record<string, unknown>)?.next ||
          (await this.fileExists(path.join(rootPath, 'next.config.js')))
        ) {
          return {
            type: 'nextjs',
            buildSystem: 'npm',
            testFramework: this.detectTestFramework(packageJson),
          };
        }

        // Check for React
        if ((packageJson.dependencies as Record<string, unknown>)?.react) {
          return {
            type: 'react',
            buildSystem: 'npm',
            testFramework: this.detectTestFramework(packageJson),
          };
        }

        // Check for TypeScript
        if (
          (packageJson.dependencies as Record<string, unknown>)?.typescript ||
          (await this.fileExists(path.join(rootPath, 'tsconfig.json')))
        ) {
          return {
            type: 'typescript',
            buildSystem: 'npm',
            testFramework: this.detectTestFramework(packageJson),
          };
        }

        return {
          type: 'nodejs',
          buildSystem: 'npm',
          testFramework: this.detectTestFramework(packageJson),
        };
      }

      // Check for Python projects
      if (
        (await this.fileExists(path.join(rootPath, 'requirements.txt'))) ||
        (await this.fileExists(path.join(rootPath, 'pyproject.toml'))) ||
        (await this.fileExists(path.join(rootPath, 'setup.py')))
      ) {
        return {
          type: 'python',
          buildSystem: 'pip',
          testFramework: await this.detectPythonTestFramework(rootPath),
        };
      }

      // Check for Java projects
      if (await this.fileExists(path.join(rootPath, 'pom.xml'))) {
        return {
          type: 'java',
          buildSystem: 'maven',
        };
      }

      if (await this.fileExists(path.join(rootPath, 'build.gradle'))) {
        return {
          type: 'java',
          buildSystem: 'gradle',
        };
      }

      return { type: 'generic' };
    } catch {
      return { type: 'generic' };
    }
  }

  /**
   * Detect test framework from package.json
   */
  private detectTestFramework(
    packageJson: Record<string, unknown>,
  ): string | undefined {
    const testFrameworks = [
      'vitest',
      'jest',
      'mocha',
      'jasmine',
      'cypress',
      'playwright',
    ];

    for (const framework of testFrameworks) {
      if (
        (packageJson.dependencies as Record<string, unknown>)?.[framework] ||
        (packageJson.devDependencies as Record<string, unknown>)?.[framework]
      ) {
        return framework;
      }
    }

    return undefined;
  }

  /**
   * Detect Python test framework
   */
  private async detectPythonTestFramework(
    rootPath: string,
  ): Promise<string | undefined> {
    try {
      const requirementsPath = path.join(rootPath, 'requirements.txt');
      if (await this.fileExists(requirementsPath)) {
        const requirements = await fs.readFile(requirementsPath, 'utf-8');
        if (requirements.includes('pytest')) return 'pytest';
        if (requirements.includes('unittest')) return 'unittest';
      }
    } catch {
      // Ignore errors
    }

    return undefined;
  }

  /**
   * Detect programming languages used in the project
   */
  async detectLanguages(rootPath: string): Promise<string[]> {
    const languages = new Set<string>();

    try {
      const files = await this.getAllFiles(rootPath);

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();

        switch (ext) {
          case '.ts':
          case '.tsx':
            languages.add('typescript');
            break;
          case '.js':
          case '.jsx':
          case '.mjs':
            languages.add('javascript');
            break;
          case '.py':
            languages.add('python');
            break;
          case '.java':
            languages.add('java');
            break;
          case '.kt':
            languages.add('kotlin');
            break;
          case '.swift':
            languages.add('swift');
            break;
          case '.go':
            languages.add('go');
            break;
          case '.rs':
            languages.add('rust');
            break;
          case '.cpp':
          case '.hpp':
          case '.cc':
            languages.add('cpp');
            break;
          case '.c':
          case '.h':
            languages.add('c');
            break;
          case '.cs':
            languages.add('csharp');
            break;
          case '.rb':
            languages.add('ruby');
            break;
          case '.php':
            languages.add('php');
            break;

          default:
            // Unknown file extension, no language detected
            break;
        }
      }
    } catch {
      // Ignore errors
    }

    return Array.from(languages);
  }

  /**
   * Detect configuration files in the project
   */
  async detectConfigFiles(rootPath: string): Promise<string[]> {
    const configFiles: string[] = [];
    const commonConfigFiles = [
      'package.json',
      'tsconfig.json',
      'jsconfig.json',
      'webpack.config.js',
      'vite.config.ts',
      'next.config.js',
      '.eslintrc.json',
      '.prettierrc',
      'tailwind.config.js',
      'postcss.config.js',
      'babel.config.js',
      'jest.config.js',
      'vitest.config.ts',
      'requirements.txt',
      'pyproject.toml',
      'setup.py',
      'pom.xml',
      'build.gradle',
      'Cargo.toml',
      'go.mod',
      'Dockerfile',
      'docker-compose.yml',
    ];

    for (const configFile of commonConfigFiles) {
      if (await this.fileExists(path.join(rootPath, configFile))) {
        configFiles.push(configFile);
      }
    }

    return configFiles;
  }

  /**
   * Detect project dependencies
   */
  async detectDependencies(rootPath: string): Promise<ProjectDependency[]> {
    const dependencies: ProjectDependency[] = [];

    // Node.js dependencies
    const packageJsonPath = path.join(rootPath, 'package.json');
    if (await this.fileExists(packageJsonPath)) {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf-8'),
      ) as Record<string, unknown>;
      dependencies.push(...(await this.analyzeDependencies(packageJson)));
    }

    // Python dependencies
    const requirementsPath = path.join(rootPath, 'requirements.txt');
    if (await this.fileExists(requirementsPath)) {
      const requirements = await fs.readFile(requirementsPath, 'utf-8');
      dependencies.push(...this.analyzePythonRequirements(requirements));
    }

    return dependencies;
  }

  /**
   * Analyze package.json dependencies
   */
  async analyzeDependencies(
    packageJson: Record<string, unknown>,
  ): Promise<ProjectDependency[]> {
    const dependencies: ProjectDependency[] = [];

    // Production dependencies
    if (
      packageJson.dependencies &&
      typeof packageJson.dependencies === 'object'
    ) {
      for (const [name, version] of Object.entries(
        packageJson.dependencies as Record<string, string>,
      )) {
        dependencies.push({
          name,
          version,
          type: 'production',
          manager: 'npm',
        });
      }
    }

    // Development dependencies
    if (
      packageJson.devDependencies &&
      typeof packageJson.devDependencies === 'object'
    ) {
      for (const [name, version] of Object.entries(
        packageJson.devDependencies as Record<string, string>,
      )) {
        dependencies.push({
          name,
          version,
          type: 'development',
          manager: 'npm',
        });
      }
    }

    // Peer dependencies
    if (
      packageJson.peerDependencies &&
      typeof packageJson.peerDependencies === 'object'
    ) {
      for (const [name, version] of Object.entries(
        packageJson.peerDependencies as Record<string, string>,
      )) {
        dependencies.push({
          name,
          version,
          type: 'peer',
          manager: 'npm',
        });
      }
    }

    return dependencies;
  }

  /**
   * Analyze Python requirements.txt
   */
  private analyzePythonRequirements(requirements: string): ProjectDependency[] {
    const dependencies: ProjectDependency[] = [];
    const lines = requirements.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)(.*)?$/);
        if (match) {
          dependencies.push({
            name: match[1],
            version: match[2] || '*',
            type: 'production',
            manager: 'pip',
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Detect frameworks from dependencies
   */
  async detectFrameworks(dependencies: ProjectDependency[]): Promise<string[]> {
    const frameworks = new Set<string>();

    const frameworkMap: Record<string, string> = {
      react: 'react',
      next: 'nextjs',
      vue: 'vue',
      '@angular/core': 'angular',
      express: 'express',
      fastify: 'fastify',
      django: 'django',
      flask: 'flask',
      fastapi: 'fastapi',
      'spring-boot': 'spring',
      typescript: 'typescript',
    };

    for (const dep of dependencies) {
      if (frameworkMap[dep.name]) {
        frameworks.add(frameworkMap[dep.name]);
      }
    }

    return Array.from(frameworks);
  }

  /**
   * Analyze directory structure
   */
  async analyzeDirectoryStructure(
    rootPath: string,
    maxDepth: number = 3,
  ): Promise<DirectoryNode> {
    return await this.buildDirectoryTree(rootPath, 0, maxDepth);
  }

  /**
   * Build directory tree recursively
   */
  private async buildDirectoryTree(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
  ): Promise<DirectoryNode> {
    const name = path.basename(dirPath);
    const children: DirectoryNode[] = [];
    let fileCount = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and directories, node_modules, etc.
        if (
          entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === '__pycache__'
        ) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && currentDepth < maxDepth) {
          const childNode = await this.buildDirectoryTree(
            fullPath,
            currentDepth + 1,
            maxDepth,
          );
          children.push(childNode);
          fileCount += childNode.fileCount;
        } else if (entry.isFile()) {
          fileCount++;
        }
      }
    } catch {
      // Ignore errors (permission issues, etc.)
    }

    return {
      name,
      path: dirPath,
      isDirectory: true,
      children,
      fileCount,
      purpose: this.inferDirectoryPurpose(name, children),
    };
  }

  /**
   * Infer the purpose of a directory based on its name and contents
   */
  private inferDirectoryPurpose(
    name: string,
    _children: DirectoryNode[],
  ): string | undefined {
    const purposeMap: Record<string, string> = {
      src: 'Source code',
      lib: 'Library code',
      components: 'React components',
      pages: 'Application pages',
      hooks: 'React hooks',
      utils: 'Utility functions',
      helpers: 'Helper functions',
      services: 'Service layer',
      api: 'API endpoints',
      types: 'Type definitions',
      interfaces: 'Interface definitions',
      models: 'Data models',
      config: 'Configuration files',
      assets: 'Static assets',
      images: 'Image files',
      styles: 'Stylesheets',
      css: 'CSS files',
      scss: 'SCSS files',
      tests: 'Test files',
      test: 'Test files',
      __tests__: 'Test files',
      spec: 'Specification files',
      docs: 'Documentation',
      documentation: 'Documentation',
      public: 'Public assets',
      static: 'Static files',
      build: 'Build output',
      dist: 'Distribution files',
      out: 'Output files',
    };

    return purposeMap[name.toLowerCase()];
  }

  /**
   * Collect source files for pattern analysis
   */
  async collectSourceFiles(
    rootPath: string,
    languages: string[],
  ): Promise<Array<{ path: string; content: string }>> {
    const sourceFiles: Array<{ path: string; content: string }> = [];
    const extensions = this.getExtensionsForLanguages(languages);

    try {
      const files = await this.getAllFiles(rootPath);

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (extensions.includes(ext)) {
          try {
            const content = await fs.readFile(file, 'utf-8');
            sourceFiles.push({ path: file, content });
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return sourceFiles;
  }

  /**
   * Get file extensions for given languages
   */
  private getExtensionsForLanguages(languages: string[]): string[] {
    const extensionMap: Record<string, string[]> = {
      typescript: ['.ts', '.tsx'],
      javascript: ['.js', '.jsx', '.mjs'],
      python: ['.py'],
      java: ['.java'],
      kotlin: ['.kt'],
      swift: ['.swift'],
      go: ['.go'],
      rust: ['.rs'],
      cpp: ['.cpp', '.hpp', '.cc'],
      c: ['.c', '.h'],
      csharp: ['.cs'],
      ruby: ['.rb'],
      php: ['.php'],
    };

    const extensions = new Set<string>();
    for (const language of languages) {
      const exts = extensionMap[language] || [];
      exts.forEach((ext) => extensions.add(ext));
    }

    return Array.from(extensions);
  }

  /**
   * Detect coding patterns in source files
   */
  async detectCodingPatterns(
    sourceFiles: Array<{ path: string; content: string }>,
  ): Promise<CodingPattern[]> {
    const patterns: CodingPattern[] = [];

    // React patterns
    patterns.push(...this.detectReactPatterns(sourceFiles));

    // Custom hook patterns
    patterns.push(...this.detectCustomHookPatterns(sourceFiles));

    // Utility patterns
    patterns.push(...this.detectUtilityPatterns(sourceFiles));

    // Component patterns
    patterns.push(...this.detectComponentPatterns(sourceFiles));

    return patterns;
  }

  /**
   * Detect React component patterns
   */
  private detectReactPatterns(
    sourceFiles: Array<{ path: string; content: string }>,
  ): CodingPattern[] {
    const patterns: CodingPattern[] = [];
    const reactFiles = sourceFiles.filter(
      (f) =>
        f.content.includes("from 'react'") ||
        f.content.includes('from "react"'),
    );

    if (reactFiles.length > 0) {
      // React Component pattern
      const componentFiles = reactFiles.filter(
        (f) =>
          f.content.includes('React.FC') ||
          f.content.includes(': FC<') ||
          f.content.includes('export const'),
      );

      if (componentFiles.length > 0) {
        patterns.push({
          name: 'React Component Pattern',
          description: 'Functional React components using TypeScript',
          examples: ['React.FC<Props>', 'export const Component'],
          confidence: componentFiles.length / reactFiles.length,
          files: componentFiles.map((f) => f.path),
        });
      }

      // Props interface pattern
      const propsFiles = reactFiles.filter(
        (f) => f.content.includes('interface') && f.content.includes('Props'),
      );

      if (propsFiles.length > 0) {
        patterns.push({
          name: 'Props Interface Pattern',
          description: 'TypeScript interfaces for component props',
          examples: ['interface ButtonProps', 'interface ComponentProps'],
          confidence: propsFiles.length / reactFiles.length,
          files: propsFiles.map((f) => f.path),
        });
      }
    }

    return patterns;
  }

  /**
   * Detect custom hook patterns
   */
  private detectCustomHookPatterns(
    sourceFiles: Array<{ path: string; content: string }>,
  ): CodingPattern[] {
    const patterns: CodingPattern[] = [];
    const hookFiles = sourceFiles.filter(
      (f) =>
        f.content.includes('export const use') ||
        f.content.includes('export function use'),
    );

    if (hookFiles.length > 0) {
      const examples: string[] = [];
      hookFiles.forEach((f) => {
        const matches = f.content.match(/export (?:const|function) (use\w+)/g);
        if (matches) {
          examples.push(
            ...matches.map((m) => m.replace(/export (?:const|function) /, '')),
          );
        }
      });

      patterns.push({
        name: 'Custom Hook Pattern',
        description: 'Custom React hooks for shared logic',
        examples: [...new Set(examples)].slice(0, 5),
        confidence: 0.9,
        files: hookFiles.map((f) => f.path),
      });
    }

    return patterns;
  }

  /**
   * Detect utility function patterns
   */
  private detectUtilityPatterns(
    sourceFiles: Array<{ path: string; content: string }>,
  ): CodingPattern[] {
    const patterns: CodingPattern[] = [];
    const utilFiles = sourceFiles.filter(
      (f) =>
        f.path.includes('util') ||
        f.path.includes('helper') ||
        f.content.includes('export const') ||
        f.content.includes('export function'),
    );

    if (utilFiles.length > 0) {
      const examples: string[] = [];
      utilFiles.forEach((f) => {
        const matches = f.content.match(/export (?:const|function) (\w+)/g);
        if (matches) {
          examples.push(
            ...matches.map((m) => m.replace(/export (?:const|function) /, '')),
          );
        }
      });

      patterns.push({
        name: 'Utility Function Pattern',
        description: 'Exported utility functions for common operations',
        examples: [...new Set(examples)].slice(0, 5),
        confidence: 0.8,
        files: utilFiles.map((f) => f.path),
      });
    }

    return patterns;
  }

  /**
   * Detect component organization patterns
   */
  private detectComponentPatterns(
    sourceFiles: Array<{ path: string; content: string }>,
  ): CodingPattern[] {
    const patterns: CodingPattern[] = [];

    // Check for component co-location
    const _componentFiles = sourceFiles.filter(
      (f) =>
        f.path.includes('component') || f.content.includes('export default'),
    );

    // Check for barrel exports (index.ts files)
    const indexFiles = sourceFiles.filter(
      (f) => f.path.endsWith('index.ts') || f.path.endsWith('index.js'),
    );

    if (indexFiles.length > 0) {
      patterns.push({
        name: 'Barrel Export Pattern',
        description: 'Index files for re-exporting modules',
        examples: ['export * from', 'export { default }'],
        confidence: 0.7,
        files: indexFiles.map((f) => f.path),
      });
    }

    return patterns;
  }

  /**
   * Detect project preferences from configuration files
   */
  async detectPreferences(rootPath: string): Promise<ProjectPreferences> {
    const preferences: ProjectPreferences = {
      codeStyle: {
        indentation: 'spaces',
        indentSize: 2,
        lineEnding: 'lf',
        maxLineLength: 80,
      },
      namingConventions: {
        functions: 'camelCase',
        variables: 'camelCase',
        classes: 'PascalCase',
        files: 'kebab-case',
      },
      architecture: {
        testLocation: 'alongside',
        importStyle: 'relative',
        componentStructure: 'feature-based',
      },
    };

    // Override with configuration file settings
    await this.detectCodeStylePreferences(rootPath, preferences);

    return preferences;
  }

  /**
   * Detect code style preferences from config files
   */
  private async detectCodeStylePreferences(
    rootPath: string,
    preferences: ProjectPreferences,
  ): Promise<void> {
    // Check .prettierrc
    const prettierPath = path.join(rootPath, '.prettierrc');
    if (await this.fileExists(prettierPath)) {
      try {
        const prettierConfig = JSON.parse(
          await fs.readFile(prettierPath, 'utf-8'),
        );
        if (prettierConfig.tabWidth)
          preferences.codeStyle.indentSize = prettierConfig.tabWidth;
        if (prettierConfig.useTabs !== undefined) {
          preferences.codeStyle.indentation = prettierConfig.useTabs
            ? 'tabs'
            : 'spaces';
        }
        if (prettierConfig.printWidth)
          preferences.codeStyle.maxLineLength = prettierConfig.printWidth;
      } catch {
        // Ignore errors
      }
    }

    // Check .eslintrc.json
    const eslintPath = path.join(rootPath, '.eslintrc.json');
    if (await this.fileExists(eslintPath)) {
      try {
        const eslintConfig = JSON.parse(await fs.readFile(eslintPath, 'utf-8'));
        if (eslintConfig.rules?.indent) {
          const indentRule = eslintConfig.rules.indent;
          if (Array.isArray(indentRule) && indentRule.length > 1) {
            preferences.codeStyle.indentSize = indentRule[1];
          }
        }
        if (eslintConfig.rules?.['max-len']) {
          const maxLenRule = eslintConfig.rules['max-len'];
          if (Array.isArray(maxLenRule) && maxLenRule.length > 1) {
            const config = maxLenRule[1];
            if (typeof config === 'object' && config.code) {
              preferences.codeStyle.maxLineLength = config.code;
            } else if (typeof config === 'number') {
              preferences.codeStyle.maxLineLength = config;
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Detect naming conventions from source files
   */
  async detectNamingConventions(
    sourceFiles: Array<{ path: string; content: string }>,
  ): Promise<ProjectPreferences['namingConventions']> {
    const conventions: ProjectPreferences['namingConventions'] = {
      functions: 'camelCase',
      variables: 'camelCase',
      classes: 'PascalCase',
      files: 'kebab-case',
    };

    // Analyze file naming patterns
    const fileNames = sourceFiles.map((f) =>
      path.basename(f.path, path.extname(f.path)),
    );
    const kebabCount = fileNames.filter((name) => name.includes('-')).length;
    const camelCount = fileNames.filter((name) =>
      /^[a-z][a-zA-Z0-9]*$/.test(name),
    ).length;
    const pascalCount = fileNames.filter((name) =>
      /^[A-Z][a-zA-Z0-9]*$/.test(name),
    ).length;

    if (kebabCount > camelCount && kebabCount > pascalCount) {
      conventions.files = 'kebab-case';
    } else if (pascalCount > camelCount) {
      conventions.files = 'PascalCase';
    } else {
      conventions.files = 'camelCase';
    }

    return conventions;
  }

  /**
   * Analyze git context if available
   */
  async analyzeGitContext(rootPath: string): Promise<GitContext | undefined> {
    try {
      // This would typically use child_process to run git commands
      // For now, we'll return a placeholder structure
      const gitDir = path.join(rootPath, '.git');
      if (await this.fileExists(gitDir)) {
        return {
          branch: 'main', // Would be detected from git
          commit: 'abc123', // Would be detected from git
          modifiedFiles: [],
          untrackedFiles: [],
          stagedFiles: [],
        };
      }
    } catch {
      // Git not available or not a git repository
    }

    return undefined;
  }

  /**
   * Find documentation files
   */
  async findDocumentationFiles(rootPath: string): Promise<string[]> {
    const docFiles: string[] = [];
    const _docPatterns = [
      'README.md',
      'README.txt',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'LICENSE',
      'LICENSE.md',
      'docs/**/*.md',
    ];

    try {
      const files = await this.getAllFiles(rootPath);
      for (const file of files) {
        const relativePath = path.relative(rootPath, file);
        if (
          relativePath.endsWith('.md') ||
          relativePath.includes('README') ||
          relativePath.includes('LICENSE')
        ) {
          docFiles.push(relativePath);
        }
      }
    } catch {
      // Ignore errors
    }

    return docFiles;
  }

  /**
   * Update project patterns
   */
  async updatePatterns(
    context: ProjectContext,
    newPatterns: CodingPattern[],
  ): Promise<ProjectContext> {
    const updatedPatterns = [...context.patterns];

    for (const newPattern of newPatterns) {
      const existingIndex = updatedPatterns.findIndex(
        (p) => p.name === newPattern.name,
      );
      if (existingIndex >= 0) {
        updatedPatterns[existingIndex] = newPattern;
      } else {
        updatedPatterns.push(newPattern);
      }
    }

    return {
      ...context,
      patterns: updatedPatterns,
      lastAnalyzed: Date.now(),
    };
  }

  /**
   * Update project dependencies
   */
  async updateDependencies(
    context: ProjectContext,
    newDependencies: ProjectDependency[],
  ): Promise<ProjectContext> {
    const updatedDependencies = [...context.dependencies];

    for (const newDep of newDependencies) {
      const existingIndex = updatedDependencies.findIndex(
        (d) => d.name === newDep.name && d.type === newDep.type,
      );
      if (existingIndex >= 0) {
        updatedDependencies[existingIndex] = newDep;
      } else {
        updatedDependencies.push(newDep);
      }
    }

    return {
      ...context,
      dependencies: updatedDependencies,
      lastAnalyzed: Date.now(),
    };
  }

  /**
   * Get all files in directory recursively
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          files.push(...(await this.getAllFiles(fullPath)));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
