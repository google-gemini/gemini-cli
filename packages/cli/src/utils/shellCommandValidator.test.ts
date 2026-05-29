/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isLikelyShellCommand } from './shellCommandValidator.js';

describe('isLikelyShellCommand', () => {
  it('returns false for empty string', () => {
    expect(isLikelyShellCommand('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isLikelyShellCommand('   ')).toBe(false);
  });

  it('returns true for commands with shell pipe operator', () => {
    expect(isLikelyShellCommand('echo hello | grep world')).toBe(true);
  });

  it('returns true for commands with redirection', () => {
    expect(isLikelyShellCommand('ls > output.txt')).toBe(true);
    expect(isLikelyShellCommand('cat < input.txt')).toBe(true);
  });

  it('returns true for commands with shell variable', () => {
    expect(isLikelyShellCommand('echo $HOME')).toBe(true);
  });

  it('returns true for commands with && chaining', () => {
    expect(isLikelyShellCommand('cd /tmp && rm -rf test')).toBe(true);
  });

  it('returns true for commands with known binary', () => {
    expect(isLikelyShellCommand('ls -la')).toBe(true);
    expect(isLikelyShellCommand('git status')).toBe(true);
    expect(isLikelyShellCommand('docker ps')).toBe(true);
    expect(isLikelyShellCommand('npm install')).toBe(true);
    expect(isLikelyShellCommand('cat file.txt')).toBe(true);
  });

  it('returns true for command with backtick', () => {
    expect(isLikelyShellCommand('echo `date`')).toBe(true);
  });

  it('returns true for command with $() substitution', () => {
    expect(isLikelyShellCommand('echo $(date)')).toBe(true);
  });

  it('returns true for command with ${} variable', () => {
    expect(isLikelyShellCommand('echo ${HOME}')).toBe(true);
  });

  it('returns false for natural language text', () => {
    expect(isLikelyShellCommand('mostrar diretório, modelo e contexto')).toBe(
      false,
    );
    expect(isLikelyShellCommand('show directory, model and context')).toBe(
      false,
    );
    expect(
      isLikelyShellCommand('please list all files in the current directory'),
    ).toBe(false);
  });

  it('returns false for natural language with punctuation', () => {
    expect(isLikelyShellCommand('Hello, how are you?')).toBe(false);
    expect(isLikelyShellCommand('This is a test.')).toBe(false);
  });

  it('returns true for simple known commands without arguments', () => {
    expect(isLikelyShellCommand('ls')).toBe(true);
    expect(isLikelyShellCommand('pwd')).toBe(true);
  });

  it('returns true for common shells and interpreters', () => {
    expect(isLikelyShellCommand('bash script.sh')).toBe(true);
    expect(isLikelyShellCommand('sh script.sh')).toBe(true);
    expect(isLikelyShellCommand('powershell -Command Get-Process')).toBe(true);
  });

  it('returns true for path-prefixed commands', () => {
    expect(isLikelyShellCommand('./my-script')).toBe(true);
    expect(isLikelyShellCommand('../run.sh')).toBe(true);
    expect(isLikelyShellCommand('/usr/bin/custom-tool')).toBe(true);
    expect(isLikelyShellCommand('C:\\tools\\run.exe')).toBe(true);
  });

  it('returns true for commands ending with executable extensions', () => {
    expect(isLikelyShellCommand('my-script.sh')).toBe(true);
    expect(isLikelyShellCommand('run.bat')).toBe(true);
    expect(isLikelyShellCommand('app.exe --help')).toBe(true);
  });

  it('returns true for g++ commands', () => {
    expect(isLikelyShellCommand('g++ main.cpp')).toBe(true);
  });
});
