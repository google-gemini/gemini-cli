/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (!process.cwd().includes('packages')) {
  console.error('must be invoked from a package directory');
  process.exit(1);
}

// build typescript files
execSync('tsc --build', { stdio: 'inherit' });

// copy .{md,json} files
execSync('node ../../scripts/copy_files.js', { stdio: 'inherit' });

// Build optional Rust helpers for sandboxing when present (core package, Linux only)
try {
  const pkgPath = join(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const isCore = pkg.name === '@google/gemini-cli-core';
  if (isCore && process.platform === 'linux') {
    const runnerManifest = join(
      process.cwd(),
      'src',
      'sandbox',
      'linux',
      'Cargo.toml',
    );
    const outputDir = join(process.cwd(), 'dist', 'bin');
    mkdirSync(outputDir, { recursive: true });
    const outPath = join(outputDir, 'landlock-runner');
    console.log(
      `[build] Compiling landlock runner (static musl) to ${outPath}`,
    );
    const target = 'x86_64-unknown-linux-musl';
    // Prefer using rustc directly; fall back to rustup to install target if missing.
    const hasRustc = (() => {
      try {
        execSync('rustc --version', { stdio: 'ignore' });
        return true;
      } catch (_e) {
        return false;
      }
    })();
    if (!hasRustc) {
      throw new Error(
        'rustc not found; install Rust toolchain to build the Landlock runner.',
      );
    }
    const hasCargo = (() => {
      try {
        execSync('cargo --version', { stdio: 'ignore' });
        return true;
      } catch (_e) {
        return false;
      }
    })();
    if (!hasCargo) {
      throw new Error(
        'cargo not found; install Rust toolchain to build the Landlock runner.',
      );
    }

    const targetAvailable = (() => {
      try {
        const list = execFileSync('rustc', [
          '--print',
          'target-list',
        ]).toString();
        return list.split('\n').includes(target);
      } catch (_e) {
        return false;
      }
    })();

    if (!targetAvailable) {
      try {
        execFileSync('rustup', ['--version'], { stdio: 'ignore' });
        execFileSync('rustup', ['target', 'add', target], { stdio: 'inherit' });
      } catch (err) {
        console.error(
          '[build] Error: musl target x86_64-unknown-linux-musl not available. Install rustup and run: rustup target add x86_64-unknown-linux-musl',
        );
        throw err;
      }
    }

    const targetDir = join(process.cwd(), 'dist', 'rust-target');
    try {
      execFileSync(
        'cargo',
        [
          'build',
          '--release',
          '--target',
          target,
          '--manifest-path',
          runnerManifest,
          '--target-dir',
          targetDir,
        ],
        {
          stdio: 'inherit',
          env: { ...process.env, RUSTFLAGS: '-C target-feature=+crt-static' },
        },
      );
      const builtPath = join(targetDir, target, 'release', 'landlock-runner');
      copyFileSync(builtPath, outPath);
    } catch (err) {
      console.error(
        '[build] Error: failed to compile static Landlock runner with musl via cargo. Ensure musl toolchain is installed (musl-gcc) and rustc supports the target.',
      );
      throw err;
    }
  }
} catch (e) {
  console.error(
    '[build] Error: failed to compile landlock runner; per-tool sandboxing requires rustc and a Linux build host.',
    e instanceof Error ? e.message : e,
  );
  process.exit(1);
}

// touch dist/.last_build
writeFileSync(join(process.cwd(), 'dist', '.last_build'), '');
process.exit(0);
