/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectContextManager } from './ProjectContextManager.js';
import { ProjectContext, CodingPattern, ProjectDependency } from './memory-interfaces.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

describe('ProjectContextManager', () => {
  let projectContextManager: ProjectContextManager;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    projectContextManager = new ProjectContextManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('project detection', () => {
    it('should detect Node.js project from package.json', async () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        scripts: {
          start: 'node index.js',
          test: 'vitest',
        },
        dependencies: {
          react: '^18.0.0',
          typescript: '^5.0.0',
        },
        devDependencies: {
          vitest: '^1.0.0',
          '@types/node': '^20.0.0',
        },
      };

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('File not found');
      });

      mockFs.access.mockImplementation(async (filePath: string) => {
        if (filePath.includes('package.json')) {
          return;
        }
        throw new Error('File not found');
      });

      const context = await projectContextManager.analyzeProject(mockProjectRoot);
      
      expect(context.name).toBe('test-project');
      expect(context.type).toBe('nodejs');
      expect(context.buildSystem).toBe('npm');
      expect(context.testFramework).toBe('vitest');
      expect(context.dependencies).toHaveLength(4);
      expect(context.dependencies.find(d => d.name === 'react')).toBeDefined();
      expect(context.dependencies.find(d => d.name === 'typescript')).toBeDefined();
    });

    it('should detect TypeScript project from tsconfig.json', async () => {
      const tsConfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          strict: true,
          jsx: 'react-jsx',
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
      };

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('tsconfig.json')) {
          return JSON.stringify(tsConfig);
        }
        if (filePath.includes('package.json')) {
          return JSON.stringify({ name: 'ts-project' });
        }
        throw new Error('File not found');
      });

      mockFs.access.mockImplementation(async (filePath: string) => {
        if (filePath.includes('tsconfig.json') || filePath.includes('package.json')) {
          return;
        }
        throw new Error('File not found');
      });

      const context = await projectContextManager.analyzeProject(mockProjectRoot);
      
      expect(context.type).toBe('typescript');
      expect(context.languages).toContain('typescript');
      expect(context.frameworks).toContain('react');
      expect(context.configFiles).toContain('tsconfig.json');
    });

    it('should detect Next.js project', async () => {
      const packageJson = {
        name: 'nextjs-app',
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0',
          'react-dom': '^18.0.0',
        },
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
      };

      const nextConfig = `
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
      `;

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        if (filePath.includes('next.config.js')) {
          return nextConfig;
        }
        throw new Error('File not found');
      });

      mockFs.access.mockImplementation(async (filePath: string) => {
        if (filePath.includes('package.json') || filePath.includes('next.config.js')) {
          return;
        }
        throw new Error('File not found');
      });

      const context = await projectContextManager.analyzeProject(mockProjectRoot);
      
      expect(context.type).toBe('nextjs');
      expect(context.frameworks).toContain('nextjs');
      expect(context.frameworks).toContain('react');
      expect(context.configFiles).toContain('next.config.js');
    });

    it('should detect Python project from requirements.txt', async () => {
      const requirements = `
django>=4.0.0
requests>=2.25.0
pytest>=7.0.0
black>=22.0.0
      `.trim();

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('requirements.txt')) {
          return requirements;
        }
        throw new Error('File not found');
      });

      mockFs.access.mockImplementation(async (filePath: string) => {
        if (filePath.includes('requirements.txt')) {
          return;
        }
        throw new Error('File not found');
      });

      const context = await projectContextManager.analyzeProject(mockProjectRoot);
      
      expect(context.type).toBe('python');
      expect(context.languages).toContain('python');
      expect(context.frameworks).toContain('django');
      expect(context.testFramework).toBe('pytest');
      expect(context.dependencies.find(d => d.name === 'django')).toBeDefined();
    });
  });

  describe('directory structure analysis', () => {
    it('should analyze project directory structure', async () => {
      const mockDirStructure = [
        'src/components/Button.tsx',
        'src/components/Input.tsx',
        'src/hooks/useAuth.ts',
        'src/utils/helpers.ts',
        'tests/Button.test.tsx',
        'public/favicon.ico',
        'README.md',
        'package.json',
      ];

      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        if (dirPath === mockProjectRoot) {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'tests', isDirectory: () => true, isFile: () => false },
            { name: 'public', isDirectory: () => true, isFile: () => false },
            { name: 'README.md', isDirectory: () => false, isFile: () => true },
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        if (dirPath.includes('src')) {
          return [
            { name: 'components', isDirectory: () => true, isFile: () => false },
            { name: 'hooks', isDirectory: () => true, isFile: () => false },
            { name: 'utils', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        if (dirPath.includes('components')) {
          return [
            { name: 'Button.tsx', isDirectory: () => false, isFile: () => true },
            { name: 'Input.tsx', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false,
      } as any);

      const structure = await projectContextManager.analyzeDirectoryStructure(mockProjectRoot);
      
      expect(structure.name).toBe('project');
      expect(structure.isDirectory).toBe(true);
      expect(structure.children).toHaveLength(5);
      
      const srcDir = structure.children.find(child => child.name === 'src');
      expect(srcDir).toBeDefined();
      expect(srcDir?.children).toHaveLength(3);
      
      const componentsDir = srcDir?.children.find(child => child.name === 'components');
      expect(componentsDir).toBeDefined();
      expect(componentsDir?.children).toHaveLength(2);
    });

    it('should calculate file counts correctly', async () => {
      mockFs.readdir.mockImplementation(async (dirPath: string) => {
        if (dirPath === mockProjectRoot) {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
            { name: 'file2.ts', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        if (dirPath.includes('src')) {
          return [
            { name: 'nested.ts', isDirectory: () => false, isFile: () => true },
            { name: 'another.ts', isDirectory: () => false, isFile: () => true },
          ] as any;
        }
        return [];
      });

      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false,
      } as any);

      const structure = await projectContextManager.analyzeDirectoryStructure(mockProjectRoot);
      
      expect(structure.fileCount).toBe(4); // 2 in root + 2 in src
      
      const srcDir = structure.children.find(child => child.name === 'src');
      expect(srcDir?.fileCount).toBe(2);
    });
  });

  describe('coding pattern detection', () => {
    it('should detect React component patterns', async () => {
      const sourceFiles = [
        {
          path: '/test/project/src/Button.tsx',
          content: `
import React from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ children, onClick, variant = 'primary' }) => {
  return (
    <button className={\`btn btn-\${variant}\`} onClick={onClick}>
      {children}
    </button>
  );
};

export default Button;
          `,
        },
        {
          path: '/test/project/src/Input.tsx',
          content: `
import React, { useState } from 'react';

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const Input: React.FC<InputProps> = ({ value, onChange, placeholder }) => {
  const [focused, setFocused] = useState(false);
  
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      className={focused ? 'input-focused' : 'input'}
    />
  );
};

export default Input;
          `,
        },
      ];

      const patterns = await projectContextManager.detectCodingPatterns(sourceFiles);
      
      const reactComponentPattern = patterns.find(p => p.name.includes('React Component'));
      const propsInterfacePattern = patterns.find(p => p.name.includes('Props Interface'));
      const hooksPattern = patterns.find(p => p.name.includes('Hooks'));
      
      expect(reactComponentPattern).toBeDefined();
      expect(reactComponentPattern?.confidence).toBeGreaterThan(0.8);
      expect(reactComponentPattern?.files).toHaveLength(2);
      
      expect(propsInterfacePattern).toBeDefined();
      expect(hooksPattern).toBeDefined();
    });

    it('should detect custom hook patterns', async () => {
      const sourceFiles = [
        {
          path: '/test/project/src/hooks/useAuth.ts',
          content: `
import { useState, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Auth logic here
    checkAuthStatus();
  }, []);
  
  const login = async (email: string, password: string) => {
    // Login logic
  };
  
  const logout = () => {
    setUser(null);
  };
  
  return { user, loading, login, logout };
};
          `,
        },
        {
          path: '/test/project/src/hooks/useLocalStorage.ts',
          content: `
import { useState, useEffect } from 'react';

export const useLocalStorage = <T>(key: string, initialValue: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });
  
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  
  return [value, setValue] as const;
};
          `,
        },
      ];

      const patterns = await projectContextManager.detectCodingPatterns(sourceFiles);
      
      const customHookPattern = patterns.find(p => p.name.includes('Custom Hook'));
      expect(customHookPattern).toBeDefined();
      expect(customHookPattern?.confidence).toBeGreaterThan(0.9);
      expect(customHookPattern?.files).toContain('/test/project/src/hooks/useAuth.ts');
      expect(customHookPattern?.files).toContain('/test/project/src/hooks/useLocalStorage.ts');
    });

    it('should detect utility function patterns', async () => {
      const sourceFiles = [
        {
          path: '/test/project/src/utils/format.ts',
          content: `
export const formatCurrency = (amount: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

export const formatDate = (date: Date, format = 'short') => {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: format as any,
  }).format(date);
};

export const slugify = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};
          `,
        },
      ];

      const patterns = await projectContextManager.detectCodingPatterns(sourceFiles);
      
      const utilityPattern = patterns.find(p => p.name.includes('Utility'));
      expect(utilityPattern).toBeDefined();
      expect(utilityPattern?.examples).toContain('formatCurrency');
      expect(utilityPattern?.examples).toContain('formatDate');
      expect(utilityPattern?.examples).toContain('slugify');
    });
  });

  describe('dependency analysis', () => {
    it('should analyze production dependencies', async () => {
      const packageJson = {
        name: 'test-app',
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          axios: '^1.4.0',
          lodash: '^4.17.21',
        },
        devDependencies: {
          '@types/react': '^18.2.0',
          vitest: '^1.0.0',
          eslint: '^8.45.0',
        },
      };

      const dependencies = await projectContextManager.analyzeDependencies(packageJson);
      
      const prodDeps = dependencies.filter(d => d.type === 'production');
      const devDeps = dependencies.filter(d => d.type === 'development');
      
      expect(prodDeps).toHaveLength(4);
      expect(devDeps).toHaveLength(3);
      
      const reactDep = prodDeps.find(d => d.name === 'react');
      expect(reactDep?.version).toBe('^18.2.0');
      expect(reactDep?.manager).toBe('npm');
    });

    it('should detect framework dependencies', async () => {
      const packageJson = {
        name: 'nextjs-app',
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0',
          '@next/font': '^14.0.0',
        },
      };

      const dependencies = await projectContextManager.analyzeDependencies(packageJson);
      const frameworks = await projectContextManager.detectFrameworks(dependencies);
      
      expect(frameworks).toContain('nextjs');
      expect(frameworks).toContain('react');
    });
  });

  describe('preferences detection', () => {
    it('should detect code style preferences from config files', async () => {
      const eslintConfig = {
        rules: {
          indent: ['error', 2],
          'max-len': ['error', { code: 100 }],
          quotes: ['error', 'single'],
          semi: ['error', 'always'],
        },
      };

      const prettierConfig = {
        tabWidth: 2,
        useTabs: false,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 100,
      };

      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('.eslintrc.json')) {
          return JSON.stringify(eslintConfig);
        }
        if (filePath.includes('.prettierrc')) {
          return JSON.stringify(prettierConfig);
        }
        throw new Error('File not found');
      });

      mockFs.access.mockImplementation(async (filePath: string) => {
        if (filePath.includes('.eslintrc.json') || filePath.includes('.prettierrc')) {
          return;
        }
        throw new Error('File not found');
      });

      const preferences = await projectContextManager.detectPreferences(mockProjectRoot);
      
      expect(preferences.codeStyle.indentation).toBe('spaces');
      expect(preferences.codeStyle.indentSize).toBe(2);
      expect(preferences.codeStyle.maxLineLength).toBe(100);
    });

    it('should detect naming conventions from source files', async () => {
      const sourceFiles = [
        {
          path: '/test/project/src/components/UserProfile.tsx', // PascalCase
          content: 'export const UserProfile = () => {};',
        },
        {
          path: '/test/project/src/utils/string-utils.ts', // kebab-case
          content: 'export const formatString = () => {};', // camelCase
        },
        {
          path: '/test/project/src/hooks/useAuth.ts', // camelCase
          content: 'export const useAuth = () => {};',
        },
      ];

      const preferences = await projectContextManager.detectNamingConventions(sourceFiles);
      
      expect(preferences.functions).toBe('camelCase');
      expect(preferences.files).toBe('kebab-case'); // Most common
      expect(preferences.classes).toBe('PascalCase');
    });
  });

  describe('git integration', () => {
    it('should analyze git context', async () => {
      // Mock git commands (these would typically use child_process)
      const gitContext = await projectContextManager.analyzeGitContext(mockProjectRoot);
      
      // This would require actual git command mocking
      // For now, we'll test the interface
      expect(gitContext).toBeDefined();
      if (gitContext) {
        expect(typeof gitContext.branch).toBe('string');
        expect(Array.isArray(gitContext.modifiedFiles)).toBe(true);
        expect(Array.isArray(gitContext.untrackedFiles)).toBe(true);
        expect(Array.isArray(gitContext.stagedFiles)).toBe(true);
      }
    });
  });

  describe('project context updates', () => {
    it('should update project context incrementally', async () => {
      // Start with basic context
      let context = await projectContextManager.analyzeProject(mockProjectRoot);
      
      // Update with new pattern
      const newPattern: CodingPattern = {
        name: 'State Management',
        description: 'Redux pattern usage',
        examples: ['useSelector', 'useDispatch'],
        confidence: 0.85,
        files: ['/src/store/index.ts'],
      };

      context = await projectContextManager.updatePatterns(context, [newPattern]);
      
      expect(context.patterns).toContain(newPattern);
    });

    it('should merge dependencies without duplicates', async () => {
      let context = await projectContextManager.analyzeProject(mockProjectRoot);
      
      const newDependency: ProjectDependency = {
        name: 'new-package',
        version: '^1.0.0',
        type: 'production',
        manager: 'npm',
      };

      context = await projectContextManager.updateDependencies(context, [newDependency]);
      
      const duplicateDependency: ProjectDependency = {
        name: 'new-package', // Same name
        version: '^1.1.0', // Different version
        type: 'production',
        manager: 'npm',
      };

      context = await projectContextManager.updateDependencies(context, [duplicateDependency]);
      
      const packageDeps = context.dependencies.filter(d => d.name === 'new-package');
      expect(packageDeps).toHaveLength(1);
      expect(packageDeps[0].version).toBe('^1.1.0'); // Should be updated
    });
  });
});