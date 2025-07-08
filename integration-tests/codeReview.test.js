// integration-tests/codeReview.test.js
// Pyrmethus, the Termux Coding Wizard, conjures tests for the codeReview spell.

const { TestRig } = require('./test-helper');
const { join } = require('path');
const { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } = require('fs');

describe('codeReview command', () => {
  let rig;

  beforeEach(() => {
    rig = new TestRig();
    rig.setup(expect.getState().currentTestName);
  });

  afterEach(() => {
    rig.cleanup();
  });

  test('should report unsupported file type', async () => {
    const filePath = rig.createFile('test.txt', 'This is a test file.');
    const stdout = rig.run('codeReview', filePath);
    expect(stdout).toContain('Unsupported file type for code review: .txt');
    expect(stdout).toContain('Pyrmethus currently supports .js, .ts, and .py files for code review.');
  });

  test('should report file not found', async () => {
    const stdout = rig.run('codeReview', 'nonexistent.js');
    expect(stdout).toContain('Error: File not found at nonexistent.js');
  });

  test('should report no ESLint issues for a clean JS file', async () => {
    const filePath = rig.createFile('clean.js', 'console.log("Hello");');
    // Mock ESLint to return no issues
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('eslint')) {
        return { stdout: '[]', stderr: '' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('codeReview', filePath);
    expect(stdout).toContain('No ESLint issues found in clean.js. Your JavaScript/TypeScript is harmonious.');
    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should report ESLint warnings/errors for a problematic JS file', async () => {
    const filePath = rig.createFile('problem.js', 'var x = 1;'); // 'var' should trigger a warning/error
    // Mock ESLint to return issues
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('eslint')) {
        return { stdout: JSON.stringify([
          {
            filePath: filePath,
            messages: [
              {
                ruleId: 'no-var',
                severity: 2,
                message: 'Unexpected var, use let or const instead.',
                line: 1,
                column: 1,
              },
            ],
            errorCount: 1,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
          },
        ]), stderr: '' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('codeReview', filePath);
    expect(stdout).toContain('--- ESLint Report for problem.js ---');
    expect(stdout).toContain('ERROR: Line 1, Col 1 - Unexpected var, use let or const instead. (no-var)');
    expect(stdout).toContain('Consider running: npm run lint:fix to automatically resolve some issues, or manually address them.');
    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should handle ESLint failure (e.g., syntax error)', async () => {
    const filePath = rig.createFile('syntax_error.js', 'const x =;'); // Syntax error
    // Mock ESLint to return an error in stderr
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('eslint')) {
        return { stdout: '', stderr: 'Error: Parsing error: Unexpected token ;' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('codeReview', filePath);
    expect(stdout).toContain('Failed to run ESLint: Error: Parsing error: Unexpected token ;. Ensure ESLint is installed and configured.');
    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should report no Ruff issues for a clean Python file', async () => {
    const filePath = rig.createFile('clean.py', `def hello():
    print("Hello")
`);
    // Mock Ruff to return no issues
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('ruff')) {
        return { stdout: '[]', stderr: '' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('codeReview', filePath);
    expect(stdout).toContain('No Ruff issues found in clean.py. Your Python is harmonious.');
    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should report Ruff issues for a problematic Python file', async () => {
    const filePath = rig.createFile('problem.py', 'import os; x =  1'); // F401, E225
    // Mock Ruff to return issues
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('ruff')) {
        return { stdout: JSON.stringify([
          {
            code: 'F401',
            message: '`os` imported but unused',
            location: { row: 1, column: 8 },
            end_location: { row: 1, column: 10 },
            fix: null,
            filename: filePath,
            url: 'https://docs.astral.sh/ruff/rules/#F401',
            linter: 'Pyflakes'
          },
          {
            code: 'E225',
            message: 'Missing whitespace around operator',
            location: { row: 1, column: 15 },
            end_location: { row: 1, column: 16 },
            fix: null,
            filename: filePath,
            url: 'https://docs.astral.sh/ruff/rules/#E225',
            linter: 'pycodestyle'
          }
        ]), stderr: '' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('codeReview', filePath);
    expect(stdout).toContain('--- Ruff Report for problem.py ---');
    expect(stdout).toContain('ERROR: Line 1, Col 8 - `os` imported but unused (F401)');
    expect(stdout).toContain('ERROR: Line 1, Col 15 - Missing whitespace around operator (E225)');
    expect(stdout).toContain('Consider running: ruff format problem.py && ruff check --fix problem.py to automatically resolve some issues, or manually address them.');
    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should handle Ruff failure (e.g., syntax error)', async () => {
    const filePath = rig.createFile('syntax_error.py', 'def func(:'); // Syntax error
    // Mock Ruff to return an error in stderr
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('ruff')) {
        return { stdout: '', stderr: 'Error: SyntaxError: invalid syntax' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('codeReview', filePath);
    expect(stdout).toContain('Failed to run Ruff: Error: SyntaxError: invalid syntax. Ensure Ruff is installed (pip install ruff).');
    global.default_api.run_shell_command = originalRunShellCommand;
  });
});
