/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getLanguageFromFilePath } from './language-detection.js';

describe('language-detection', () => {
  describe('getLanguageFromFilePath', () => {
    describe('TypeScript detection', () => {
      it('should detect .ts files', () => {
        expect(getLanguageFromFilePath('file.ts')).toBe('TypeScript');
      });

      it('should detect .tsx files', () => {
        expect(getLanguageFromFilePath('Component.tsx')).toBe('TypeScript');
      });

      it('should be case insensitive for extensions', () => {
        expect(getLanguageFromFilePath('file.TS')).toBe('TypeScript');
        expect(getLanguageFromFilePath('file.TSX')).toBe('TypeScript');
      });

      it('should detect TypeScript in nested paths', () => {
        expect(getLanguageFromFilePath('/path/to/file.ts')).toBe('TypeScript');
      });
    });

    describe('JavaScript detection', () => {
      it('should detect .js files', () => {
        expect(getLanguageFromFilePath('script.js')).toBe('JavaScript');
      });

      it('should detect .mjs files', () => {
        expect(getLanguageFromFilePath('module.mjs')).toBe('JavaScript');
      });

      it('should detect .cjs files', () => {
        expect(getLanguageFromFilePath('common.cjs')).toBe('JavaScript');
      });

      it('should detect .jsx files', () => {
        expect(getLanguageFromFilePath('Component.jsx')).toBe('JavaScript');
      });

      it('should be case insensitive', () => {
        expect(getLanguageFromFilePath('file.JS')).toBe('JavaScript');
        expect(getLanguageFromFilePath('file.MJS')).toBe('JavaScript');
      });
    });

    describe('Python detection', () => {
      it('should detect .py files', () => {
        expect(getLanguageFromFilePath('script.py')).toBe('Python');
      });

      it('should be case insensitive', () => {
        expect(getLanguageFromFilePath('script.PY')).toBe('Python');
      });
    });

    describe('Java detection', () => {
      it('should detect .java files', () => {
        expect(getLanguageFromFilePath('Main.java')).toBe('Java');
      });

      it('should be case insensitive', () => {
        expect(getLanguageFromFilePath('Main.JAVA')).toBe('Java');
      });
    });

    describe('Go detection', () => {
      it('should detect .go files', () => {
        expect(getLanguageFromFilePath('main.go')).toBe('Go');
      });

      it('should detect .gohtml files', () => {
        expect(getLanguageFromFilePath('template.gohtml')).toBe('Go Template');
      });
    });

    describe('Ruby detection', () => {
      it('should detect .rb files', () => {
        expect(getLanguageFromFilePath('script.rb')).toBe('Ruby');
      });
    });

    describe('PHP detection', () => {
      it('should detect .php files', () => {
        expect(getLanguageFromFilePath('index.php')).toBe('PHP');
      });

      it('should detect .phtml files', () => {
        expect(getLanguageFromFilePath('template.phtml')).toBe('PHP');
      });
    });

    describe('C# detection', () => {
      it('should detect .cs files', () => {
        expect(getLanguageFromFilePath('Program.cs')).toBe('C#');
      });
    });

    describe('C++ detection', () => {
      it('should detect .cpp files', () => {
        expect(getLanguageFromFilePath('main.cpp')).toBe('C++');
      });

      it('should detect .cxx files', () => {
        expect(getLanguageFromFilePath('main.cxx')).toBe('C++');
      });

      it('should detect .cc files', () => {
        expect(getLanguageFromFilePath('main.cc')).toBe('C++');
      });

      it('should detect .hpp files', () => {
        expect(getLanguageFromFilePath('header.hpp')).toBe('C++');
      });
    });

    describe('C detection', () => {
      it('should detect .c files', () => {
        expect(getLanguageFromFilePath('main.c')).toBe('C');
      });

      it('should detect .h files as C/C++', () => {
        expect(getLanguageFromFilePath('header.h')).toBe('C/C++');
      });
    });

    describe('Swift detection', () => {
      it('should detect .swift files', () => {
        expect(getLanguageFromFilePath('App.swift')).toBe('Swift');
      });
    });

    describe('Kotlin detection', () => {
      it('should detect .kt files', () => {
        expect(getLanguageFromFilePath('Main.kt')).toBe('Kotlin');
      });
    });

    describe('Rust detection', () => {
      it('should detect .rs files', () => {
        expect(getLanguageFromFilePath('main.rs')).toBe('Rust');
      });
    });

    describe('Objective-C detection', () => {
      it('should detect .m files', () => {
        expect(getLanguageFromFilePath('App.m')).toBe('Objective-C');
      });

      it('should detect .mm files', () => {
        expect(getLanguageFromFilePath('App.mm')).toBe('Objective-C');
      });
    });

    describe('Perl detection', () => {
      it('should detect .pl files', () => {
        expect(getLanguageFromFilePath('script.pl')).toBe('Perl');
      });

      it('should detect .pm files', () => {
        expect(getLanguageFromFilePath('Module.pm')).toBe('Perl');
      });
    });

    describe('Lua detection', () => {
      it('should detect .lua files', () => {
        expect(getLanguageFromFilePath('script.lua')).toBe('Lua');
      });
    });

    describe('R detection', () => {
      it('should detect .r files', () => {
        expect(getLanguageFromFilePath('analysis.r')).toBe('R');
      });
    });

    describe('Scala detection', () => {
      it('should detect .scala files', () => {
        expect(getLanguageFromFilePath('Main.scala')).toBe('Scala');
      });

      it('should detect .sc files', () => {
        expect(getLanguageFromFilePath('script.sc')).toBe('Scala');
      });
    });

    describe('Shell script detection', () => {
      it('should detect .sh files', () => {
        expect(getLanguageFromFilePath('script.sh')).toBe('Shell');
      });
    });

    describe('PowerShell detection', () => {
      it('should detect .ps1 files', () => {
        expect(getLanguageFromFilePath('script.ps1')).toBe('PowerShell');
      });
    });

    describe('Batch detection', () => {
      it('should detect .bat files', () => {
        expect(getLanguageFromFilePath('script.bat')).toBe('Batch');
      });

      it('should detect .cmd files', () => {
        expect(getLanguageFromFilePath('script.cmd')).toBe('Batch');
      });
    });

    describe('SQL detection', () => {
      it('should detect .sql files', () => {
        expect(getLanguageFromFilePath('query.sql')).toBe('SQL');
      });
    });

    describe('HTML detection', () => {
      it('should detect .html files', () => {
        expect(getLanguageFromFilePath('index.html')).toBe('HTML');
      });

      it('should detect .htm files', () => {
        expect(getLanguageFromFilePath('index.htm')).toBe('HTML');
      });
    });

    describe('CSS detection', () => {
      it('should detect .css files', () => {
        expect(getLanguageFromFilePath('styles.css')).toBe('CSS');
      });

      it('should detect .less files', () => {
        expect(getLanguageFromFilePath('styles.less')).toBe('Less');
      });

      it('should detect .sass files', () => {
        expect(getLanguageFromFilePath('styles.sass')).toBe('Sass');
      });

      it('should detect .scss files', () => {
        expect(getLanguageFromFilePath('styles.scss')).toBe('Sass');
      });
    });

    describe('JSON detection', () => {
      it('should detect .json files', () => {
        expect(getLanguageFromFilePath('package.json')).toBe('JSON');
      });
    });

    describe('XML detection', () => {
      it('should detect .xml files', () => {
        expect(getLanguageFromFilePath('config.xml')).toBe('XML');
      });
    });

    describe('YAML detection', () => {
      it('should detect .yaml files', () => {
        expect(getLanguageFromFilePath('config.yaml')).toBe('YAML');
      });

      it('should detect .yml files', () => {
        expect(getLanguageFromFilePath('config.yml')).toBe('YAML');
      });
    });

    describe('Markdown detection', () => {
      it('should detect .md files', () => {
        expect(getLanguageFromFilePath('README.md')).toBe('Markdown');
      });

      it('should detect .markdown files', () => {
        expect(getLanguageFromFilePath('README.markdown')).toBe('Markdown');
      });
    });

    describe('Dockerfile detection', () => {
      it('should detect .dockerfile files', () => {
        expect(getLanguageFromFilePath('app.dockerfile')).toBe('Dockerfile');
      });

      it('should detect dockerignore files', () => {
        expect(getLanguageFromFilePath('.dockerignore')).toBe('Docker');
      });
    });

    describe('Vim script detection', () => {
      it('should detect .vim files', () => {
        expect(getLanguageFromFilePath('config.vim')).toBe('Vim script');
      });
    });

    describe('Visual Basic detection', () => {
      it('should detect .vb files', () => {
        expect(getLanguageFromFilePath('Program.vb')).toBe('Visual Basic');
      });
    });

    describe('F# detection', () => {
      it('should detect .fs files', () => {
        expect(getLanguageFromFilePath('Program.fs')).toBe('F#');
      });
    });

    describe('Clojure detection', () => {
      it('should detect .clj files', () => {
        expect(getLanguageFromFilePath('core.clj')).toBe('Clojure');
      });

      it('should detect .cljs files', () => {
        expect(getLanguageFromFilePath('core.cljs')).toBe('Clojure');
      });
    });

    describe('Dart detection', () => {
      it('should detect .dart files', () => {
        expect(getLanguageFromFilePath('main.dart')).toBe('Dart');
      });
    });

    describe('Elixir detection', () => {
      it('should detect .ex files', () => {
        expect(getLanguageFromFilePath('app.ex')).toBe('Elixir');
      });
    });

    describe('Erlang detection', () => {
      it('should detect .erl files', () => {
        expect(getLanguageFromFilePath('server.erl')).toBe('Erlang');
      });
    });

    describe('Haskell detection', () => {
      it('should detect .hs files', () => {
        expect(getLanguageFromFilePath('Main.hs')).toBe('Haskell');
      });
    });

    describe('Lisp detection', () => {
      it('should detect .lisp files', () => {
        expect(getLanguageFromFilePath('app.lisp')).toBe('Lisp');
      });
    });

    describe('Racket detection', () => {
      it('should detect .rkt files', () => {
        expect(getLanguageFromFilePath('app.rkt')).toBe('Racket');
      });
    });

    describe('Groovy detection', () => {
      it('should detect .groovy files', () => {
        expect(getLanguageFromFilePath('script.groovy')).toBe('Groovy');
      });
    });

    describe('Julia detection', () => {
      it('should detect .jl files', () => {
        expect(getLanguageFromFilePath('script.jl')).toBe('Julia');
      });
    });

    describe('LaTeX detection', () => {
      it('should detect .tex files', () => {
        expect(getLanguageFromFilePath('document.tex')).toBe('LaTeX');
      });
    });

    describe('Arduino detection', () => {
      it('should detect .ino files', () => {
        expect(getLanguageFromFilePath('sketch.ino')).toBe('Arduino');
      });
    });

    describe('Assembly detection', () => {
      it('should detect .asm files', () => {
        expect(getLanguageFromFilePath('boot.asm')).toBe('Assembly');
      });

      it('should detect .s files', () => {
        expect(getLanguageFromFilePath('boot.s')).toBe('Assembly');
      });
    });

    describe('TOML detection', () => {
      it('should detect .toml files', () => {
        expect(getLanguageFromFilePath('Cargo.toml')).toBe('TOML');
      });
    });

    describe('Vue detection', () => {
      it('should detect .vue files', () => {
        expect(getLanguageFromFilePath('App.vue')).toBe('Vue');
      });
    });

    describe('Svelte detection', () => {
      it('should detect .svelte files', () => {
        expect(getLanguageFromFilePath('App.svelte')).toBe('Svelte');
      });
    });

    describe('Template engine detection', () => {
      it('should detect .hbs files', () => {
        expect(getLanguageFromFilePath('template.hbs')).toBe('Handlebars');
      });

      it('should detect .ejs files', () => {
        expect(getLanguageFromFilePath('template.ejs')).toBe('EJS');
      });

      it('should detect .erb files', () => {
        expect(getLanguageFromFilePath('template.erb')).toBe('ERB');
      });

      it('should detect .jsp files', () => {
        expect(getLanguageFromFilePath('page.jsp')).toBe('JSP');
      });
    });

    describe('Config file detection', () => {
      it('should detect .gitignore files', () => {
        expect(getLanguageFromFilePath('.gitignore')).toBe('Git');
      });

      it('should detect .npmignore files', () => {
        expect(getLanguageFromFilePath('.npmignore')).toBe('npm');
      });

      it('should detect .editorconfig files', () => {
        expect(getLanguageFromFilePath('.editorconfig')).toBe('EditorConfig');
      });

      it('should detect .prettierrc files', () => {
        expect(getLanguageFromFilePath('.prettierrc')).toBe('Prettier');
      });

      it('should detect .eslintrc files', () => {
        expect(getLanguageFromFilePath('.eslintrc')).toBe('ESLint');
      });

      it('should detect .babelrc files', () => {
        expect(getLanguageFromFilePath('.babelrc')).toBe('Babel');
      });

      it('should detect .tsconfig files', () => {
        expect(getLanguageFromFilePath('.tsconfig')).toBe('TypeScript');
      });

      it('should detect .flow files', () => {
        expect(getLanguageFromFilePath('.flow')).toBe('Flow');
      });
    });

    describe('GraphQL detection', () => {
      it('should detect .graphql files', () => {
        expect(getLanguageFromFilePath('schema.graphql')).toBe('GraphQL');
      });
    });

    describe('Protocol Buffers detection', () => {
      it('should detect .proto files', () => {
        expect(getLanguageFromFilePath('message.proto')).toBe(
          'Protocol Buffers',
        );
      });
    });

    describe('edge cases', () => {
      it('should return undefined for unknown extensions', () => {
        expect(getLanguageFromFilePath('file.unknown')).toBeUndefined();
      });

      it('should return undefined for files without extension', () => {
        expect(getLanguageFromFilePath('Makefile')).toBeUndefined();
      });

      it('should handle files with multiple dots', () => {
        expect(getLanguageFromFilePath('file.test.ts')).toBe('TypeScript');
      });

      it('should handle absolute paths', () => {
        expect(getLanguageFromFilePath('/usr/local/bin/script.py')).toBe(
          'Python',
        );
      });

      it('should handle relative paths', () => {
        expect(getLanguageFromFilePath('../src/main.rs')).toBe('Rust');
      });

      it('should handle Windows paths', () => {
        expect(getLanguageFromFilePath('C:\\Users\\file.cs')).toBe('C#');
      });

      it('should be case insensitive for all extensions', () => {
        expect(getLanguageFromFilePath('file.PY')).toBe('Python');
        expect(getLanguageFromFilePath('file.JAVA')).toBe('Java');
        expect(getLanguageFromFilePath('file.GO')).toBe('Go');
      });

      it('should handle empty string', () => {
        expect(getLanguageFromFilePath('')).toBeUndefined();
      });

      it('should handle path with spaces', () => {
        expect(getLanguageFromFilePath('/path with spaces/file.js')).toBe(
          'JavaScript',
        );
      });

      it('should handle hidden files with known extensions', () => {
        expect(getLanguageFromFilePath('.hidden.ts')).toBe('TypeScript');
      });

      it('should detect config files by name', () => {
        expect(getLanguageFromFilePath('/path/to/.gitignore')).toBe('Git');
      });

      it('should handle uppercase config filenames', () => {
        expect(getLanguageFromFilePath('.GITIGNORE')).toBe('Git');
      });

      it('should return undefined for dotfiles without mapping', () => {
        expect(getLanguageFromFilePath('.env')).toBeUndefined();
      });

      it('should handle very long paths', () => {
        const longPath = '/a'.repeat(100) + '/file.py';
        expect(getLanguageFromFilePath(longPath)).toBe('Python');
      });

      it('should handle paths with special characters', () => {
        expect(getLanguageFromFilePath('/path/@special#/file.js')).toBe(
          'JavaScript',
        );
      });
    });
  });
});
