/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getLanguageFromFilePath } from './language-detection.js';

describe('language-detection', () => {
  describe('getLanguageFromFilePath', () => {
    it('should detect common programming languages', () => {
      expect(getLanguageFromFilePath('test.js')).toBe('JavaScript');
      expect(getLanguageFromFilePath('test.ts')).toBe('TypeScript');
      expect(getLanguageFromFilePath('test.py')).toBe('Python');
      expect(getLanguageFromFilePath('test.java')).toBe('Java');
      expect(getLanguageFromFilePath('test.cs')).toBe('C#');
      expect(getLanguageFromFilePath('test.cpp')).toBe('C++');
      expect(getLanguageFromFilePath('test.go')).toBe('Go');
      expect(getLanguageFromFilePath('test.rb')).toBe('Ruby');
      expect(getLanguageFromFilePath('test.php')).toBe('PHP');
      expect(getLanguageFromFilePath('test.swift')).toBe('Swift');
      expect(getLanguageFromFilePath('test.kt')).toBe('Kotlin');
      expect(getLanguageFromFilePath('test.rs')).toBe('Rust');
      expect(getLanguageFromFilePath('test.scala')).toBe('Scala');
      expect(getLanguageFromFilePath('test.dart')).toBe('Dart');
      expect(getLanguageFromFilePath('test.ex')).toBe('Elixir');
      expect(getLanguageFromFilePath('test.erl')).toBe('Erlang');
      expect(getLanguageFromFilePath('test.hs')).toBe('Haskell');
      expect(getLanguageFromFilePath('test.lua')).toBe('Lua');
      expect(getLanguageFromFilePath('test.r')).toBe('R');
      expect(getLanguageFromFilePath('test.pl')).toBe('Perl');
      expect(getLanguageFromFilePath('test.clj')).toBe('Clojure');
      expect(getLanguageFromFilePath('test.lisp')).toBe('Lisp');
      expect(getLanguageFromFilePath('test.rkt')).toBe('Racket');
      expect(getLanguageFromFilePath('test.groovy')).toBe('Groovy');
      expect(getLanguageFromFilePath('test.jl')).toBe('Julia');
      expect(getLanguageFromFilePath('test.vb')).toBe('Visual Basic');
      expect(getLanguageFromFilePath('test.fs')).toBe('F#');
    });

    it('should detect web technologies', () => {
      expect(getLanguageFromFilePath('test.html')).toBe('HTML');
      expect(getLanguageFromFilePath('test.htm')).toBe('HTML');
      expect(getLanguageFromFilePath('test.css')).toBe('CSS');
      expect(getLanguageFromFilePath('test.less')).toBe('Less');
      expect(getLanguageFromFilePath('test.sass')).toBe('Sass');
      expect(getLanguageFromFilePath('test.scss')).toBe('Sass');
      expect(getLanguageFromFilePath('test.jsx')).toBe('JavaScript');
      expect(getLanguageFromFilePath('test.tsx')).toBe('TypeScript');
      expect(getLanguageFromFilePath('test.vue')).toBe('Vue');
      expect(getLanguageFromFilePath('test.svelte')).toBe('Svelte');
    });

    it('should detect configuration files', () => {
      expect(getLanguageFromFilePath('test.json')).toBe('JSON');
      expect(getLanguageFromFilePath('test.yaml')).toBe('YAML');
      expect(getLanguageFromFilePath('test.yml')).toBe('YAML');
      expect(getLanguageFromFilePath('test.xml')).toBe('XML');
      expect(getLanguageFromFilePath('test.xaml')).toBe('XAML');
      expect(getLanguageFromFilePath('test.toml')).toBe('TOML');
      expect(getLanguageFromFilePath('test.dockerfile')).toBe('Dockerfile');
    });

    it('should detect markup and documentation files', () => {
      expect(getLanguageFromFilePath('test.md')).toBe('Markdown');
      expect(getLanguageFromFilePath('test.markdown')).toBe('Markdown');
      expect(getLanguageFromFilePath('test.tex')).toBe('LaTeX');
    });

    it('should detect template files', () => {
      expect(getLanguageFromFilePath('test.gohtml')).toBe('Go Template');
      expect(getLanguageFromFilePath('test.hbs')).toBe('Handlebars');
      expect(getLanguageFromFilePath('test.ejs')).toBe('EJS');
      expect(getLanguageFromFilePath('test.erb')).toBe('ERB');
      expect(getLanguageFromFilePath('test.jsp')).toBe('JSP');
    });

    it('should detect shell and script files', () => {
      expect(getLanguageFromFilePath('test.sh')).toBe('Shell');
      expect(getLanguageFromFilePath('test.ps1')).toBe('PowerShell');
      expect(getLanguageFromFilePath('test.bat')).toBe('Batch');
      expect(getLanguageFromFilePath('test.cmd')).toBe('Batch');
    });

    it('should detect database and query files', () => {
      expect(getLanguageFromFilePath('test.sql')).toBe('SQL');
    });

    it('should detect special file types', () => {
      expect(getLanguageFromFilePath('test.ino')).toBe('Arduino');
      expect(getLanguageFromFilePath('test.asm')).toBe('Assembly');
      expect(getLanguageFromFilePath('test.s')).toBe('Assembly');
      expect(getLanguageFromFilePath('test.graphql')).toBe('GraphQL');
      expect(getLanguageFromFilePath('test.proto')).toBe('Protocol Buffers');
    });

    it('should detect Objective-C files', () => {
      expect(getLanguageFromFilePath('test.m')).toBe('Objective-C');
      expect(getLanguageFromFilePath('test.mm')).toBe('Objective-C');
    });

    it('should detect C/C++ header files', () => {
      expect(getLanguageFromFilePath('test.h')).toBe('C/C++');
      expect(getLanguageFromFilePath('test.hpp')).toBe('C++');
    });

    it('should detect JavaScript module files', () => {
      expect(getLanguageFromFilePath('test.mjs')).toBe('JavaScript');
      expect(getLanguageFromFilePath('test.cjs')).toBe('JavaScript');
    });

    it('should detect PHP files', () => {
      expect(getLanguageFromFilePath('test.phtml')).toBe('PHP');
    });

    it('should detect Perl files', () => {
      expect(getLanguageFromFilePath('test.pm')).toBe('Perl');
    });

    it('should detect Scala files', () => {
      expect(getLanguageFromFilePath('test.sc')).toBe('Scala');
    });

    it('should detect special configuration files', () => {
      expect(getLanguageFromFilePath('test.dockerignore')).toBe('Docker');
      expect(getLanguageFromFilePath('test.gitignore')).toBe('Git');
      expect(getLanguageFromFilePath('test.npmignore')).toBe('npm');
      expect(getLanguageFromFilePath('test.editorconfig')).toBe('EditorConfig');
      expect(getLanguageFromFilePath('test.prettierrc')).toBe('Prettier');
      expect(getLanguageFromFilePath('test.eslintrc')).toBe('ESLint');
      expect(getLanguageFromFilePath('test.babelrc')).toBe('Babel');
      expect(getLanguageFromFilePath('test.tsconfig')).toBe('TypeScript');
      expect(getLanguageFromFilePath('test.flow')).toBe('Flow');
    });

    it('should detect Vim script files', () => {
      expect(getLanguageFromFilePath('test.vim')).toBe('Vim script');
    });

    it('should handle files without extensions', () => {
      expect(getLanguageFromFilePath('README')).toBeUndefined();
      expect(getLanguageFromFilePath('Makefile')).toBeUndefined();
      // Dockerfile is actually detected as 'Dockerfile' language
      expect(getLanguageFromFilePath('Dockerfile')).toBe('Dockerfile');
    });

    it('should handle files with multiple dots', () => {
      expect(getLanguageFromFilePath('test.min.js')).toBe('JavaScript');
      expect(getLanguageFromFilePath('test.bundle.js')).toBe('JavaScript');
      expect(getLanguageFromFilePath('test.config.json')).toBe('JSON');
    });

    it('should handle case insensitive extensions', () => {
      expect(getLanguageFromFilePath('test.JS')).toBe('JavaScript');
      expect(getLanguageFromFilePath('test.TS')).toBe('TypeScript');
      expect(getLanguageFromFilePath('test.PY')).toBe('Python');
      expect(getLanguageFromFilePath('test.XAML')).toBe('XAML');
    });

    it('should handle full file paths', () => {
      expect(getLanguageFromFilePath('/path/to/test.js')).toBe('JavaScript');
      expect(getLanguageFromFilePath('C:\\path\\to\\test.ts')).toBe(
        'TypeScript',
      );
      expect(getLanguageFromFilePath('./src/components/Button.tsx')).toBe(
        'TypeScript',
      );
      expect(getLanguageFromFilePath('src/views/MainWindow.xaml')).toBe('XAML');
    });

    it('should handle special filename patterns', () => {
      // These files don't have extensions, so they return undefined
      expect(getLanguageFromFilePath('.editorconfig')).toBeUndefined();
      expect(getLanguageFromFilePath('.prettierrc')).toBeUndefined();
      expect(getLanguageFromFilePath('.eslintrc')).toBeUndefined();
      expect(getLanguageFromFilePath('.babelrc')).toBeUndefined();
      expect(getLanguageFromFilePath('.tsconfig')).toBeUndefined();
      expect(getLanguageFromFilePath('.flow')).toBeUndefined();
    });
  });
});
