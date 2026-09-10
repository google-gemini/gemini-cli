/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isBuildFile } from './buildFileUtils.js';

describe('buildFileUtils', () => {
  describe('isBuildFile', () => {
    it('should identify Bazel and Blaze build files', () => {
      expect(isBuildFile('BUILD')).toBe(true);
      expect(isBuildFile('foo/bar/BUILD')).toBe(true);
      expect(isBuildFile('BUILD.bazel')).toBe(true);
      expect(isBuildFile('path/to/BUILD.bazel')).toBe(true);
      expect(isBuildFile('WORKSPACE')).toBe(true);
      expect(isBuildFile('WORKSPACE.bazel')).toBe(true);
      expect(isBuildFile('MODULE.bazel')).toBe(true);
      expect(isBuildFile('.bazelrc')).toBe(true);
      expect(isBuildFile('.blazerc')).toBe(true);
      expect(isBuildFile('defs.bzl')).toBe(true);
      expect(isBuildFile('rules/custom.bzl')).toBe(true);
      expect(isBuildFile('deps.bazel')).toBe(true);
      expect(isBuildFile('ext.bzlmod')).toBe(true);
    });

    it('should identify Make and CMake files', () => {
      expect(isBuildFile('Makefile')).toBe(true);
      expect(isBuildFile('makefile')).toBe(true);
      expect(isBuildFile('GNUmakefile')).toBe(true);
      expect(isBuildFile('rules.mk')).toBe(true);
      expect(isBuildFile('CMakeLists.txt')).toBe(true);
      expect(isBuildFile('cmake/FindFoo.cmake')).toBe(true);
    });

    it('should identify Node.js build and manifest files', () => {
      expect(isBuildFile('package.json')).toBe(true);
      expect(isBuildFile('packages/core/package.json')).toBe(true);
      expect(isBuildFile('package-lock.json')).toBe(true);
      expect(isBuildFile('pnpm-lock.yaml')).toBe(true);
      expect(isBuildFile('yarn.lock')).toBe(true);
      expect(isBuildFile('bun.lockb')).toBe(true);
    });

    it('should identify Python, Go, Rust, and Java/Kotlin build files', () => {
      expect(isBuildFile('setup.py')).toBe(true);
      expect(isBuildFile('setup.cfg')).toBe(true);
      expect(isBuildFile('pyproject.toml')).toBe(true);
      expect(isBuildFile('go.mod')).toBe(true);
      expect(isBuildFile('go.sum')).toBe(true);
      expect(isBuildFile('Cargo.toml')).toBe(true);
      expect(isBuildFile('Cargo.lock')).toBe(true);
      expect(isBuildFile('pom.xml')).toBe(true);
      expect(isBuildFile('build.gradle')).toBe(true);
      expect(isBuildFile('build.gradle.kts')).toBe(true);
      expect(isBuildFile('settings.gradle')).toBe(true);
      expect(isBuildFile('settings.gradle.kts')).toBe(true);
    });

    it('should identify container build files', () => {
      expect(isBuildFile('Dockerfile')).toBe(true);
      expect(isBuildFile('Dockerfile.dev')).toBe(true);
      expect(isBuildFile('Containerfile')).toBe(true);
      expect(isBuildFile('Containerfile.prod')).toBe(true);
    });

    it('should return false for regular source code and non-build files', () => {
      expect(isBuildFile('')).toBe(false);
      expect(isBuildFile('main.ts')).toBe(false);
      expect(isBuildFile('src/index.js')).toBe(false);
      expect(isBuildFile('README.md')).toBe(false);
      expect(isBuildFile('service.cc')).toBe(false);
      expect(isBuildFile('foo/bar/model.py')).toBe(false);
      expect(isBuildFile('config.json')).toBe(false);
      expect(isBuildFile('settings.toml')).toBe(false);
    });

    it('should correctly identify build files using Windows backslashes on POSIX environments', () => {
      expect(isBuildFile('foo\\bar\\BUILD')).toBe(true);
      expect(isBuildFile('path\\to\\package.json')).toBe(true);
    });
  });
});
