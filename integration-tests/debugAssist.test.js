// integration-tests/debugAssist.test.js
// Pyrmethus, the Termux Coding Wizard, conjures tests for the debugAssist spell.

const { TestRig } = require('./test-helper');
const { join } = require('path');
const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} = require('fs');
const readline = require('readline');

// Mock readline for interactive input
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('debugAssist command', () => {
  let rig;
  let mockRl;

  beforeEach(() => {
    rig = new TestRig();
    rig.setup(expect.getState().currentTestName);
    mockRl = readline.createInterface();
  });

  afterEach(() => {
    rig.cleanup();
    jest.clearAllMocks();
  });

  test('should provide a fix for a TypeError in a code snippet', async () => {
    const codeSnippet = 'function add(a, b) { return a + b; }\nadd("5", "3");';
    const errorMsg = 'TypeError: Cannot concatenate strings';

    // Mock user input for confirmation
    mockRl.question
      .mockImplementationOnce((query, callback) => {
        callback('yes'); // Confirm applying fix
      })
      .mockImplementationOnce((query, callback) => {
        callback('no'); // Exit debugging session
      });

    const stdout = rig.run('debugAssist', codeSnippet, errorMsg);

    expect(stdout).toContain('Summoning the debugging spirits...');
    expect(stdout).toContain('Analyzing code snippet...');
    expect(stdout).toContain(
      'Observed Error: TypeError: Cannot concatenate strings',
    );
    expect(stdout).toContain(
      'Suggestion: It seems like a TypeError, possibly due to incorrect type concatenation. Consider converting variables to numbers before addition.',
    );
    expect(stdout).toContain('Fix applied to snippet.');
    expect(stdout).toContain(
      'Debugging session complete. May your code be bug-free.',
    );
  });

  test('should suggest running a command for a logging code snippet', async () => {
    const codeSnippet = 'console.log("Test output");';

    // Mock user input for confirmation
    mockRl.question
      .mockImplementationOnce((query, callback) => {
        callback('yes'); // Confirm running command
      })
      .mockImplementationOnce((query, callback) => {
        callback('no'); // Exit debugging session
      });

    // Mock run_shell_command output
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('node -e')) {
        return { stdout: 'Test output\n', stderr: '' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('debugAssist', codeSnippet);

    expect(stdout).toContain(
      'Suggestion: The code seems to be logging. Try running it to see the output.',
    );
    expect(stdout).toContain('Command Output (stdout):\nTest output');
    expect(stdout).toContain(
      'Debugging session complete. May your code be bug-free.',
    );

    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should provide informational suggestion when no specific error or action', async () => {
    const codeSnippet = 'function greet() { return "Hello"; }';

    // Mock user input for confirmation
    mockRl.question.mockImplementationOnce((query, callback) => {
      callback('no'); // Exit debugging session
    });

    const stdout = rig.run('debugAssist', codeSnippet);

    expect(stdout).toContain(
      'Suggestion: Please provide more context or a specific error message for a better suggestion.',
    );
    expect(stdout).toContain(
      'Debugging session complete. May your code be bug-free.',
    );
  });

  test('should debug a Python file with a TypeError', async () => {
    const filePath = rig.createFile(
      'python_error.py',
      'def divide(a, b):\n    return a / b\n\ndivide(\"10\", 2);',
    );
    const errorMsg =
      "TypeError: unsupported operand type(s) for /: 'str' and 'int'";

    // Mock user input for confirmation
    mockRl.question
      .mockImplementationOnce((query, callback) => {
        callback('yes'); // Confirm applying fix
      })
      .mockImplementationOnce((query, callback) => {
        callback('no'); // Exit debugging session
      });

    const stdout = rig.run('debugAssist', filePath, errorMsg);

    expect(stdout).toContain(`Analyzing file: ${filePath}`);
    expect(stdout).toContain(
      "Observed Error: TypeError: unsupported operand type(s) for /: 'str' and 'int'",
    );
    expect(stdout).toContain(
      'Suggestion: It seems like a TypeError, possibly due to incorrect type concatenation. Consider converting variables to numbers before addition.',
    );
    expect(stdout).toContain('Fix applied to file.');
    expect(stdout).toContain(
      'Debugging session complete. May your code be bug-free.',
    );
  });

  test('should debug a JavaScript file by suggesting a run', async () => {
    const filePath = rig.createFile(
      'js_log.js',
      'console.log(\"Hello from JS\");',
    );

    // Mock user input for confirmation
    mockRl.question
      .mockImplementationOnce((query, callback) => {
        callback('yes'); // Confirm running command
      })
      .mockImplementationOnce((query, callback) => {
        callback('no'); // Exit debugging session
      });

    // Mock run_shell_command output
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command.includes('node -e')) {
        return { stdout: 'Hello from JS\n', stderr: '' };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('debugAssist', filePath);

    expect(stdout).toContain(`Analyzing file: ${filePath}`);
    expect(stdout).toContain(
      'Suggestion: The code seems to be logging. Try running it to see the output.',
    );
    expect(stdout).toContain('Command Output (stdout):\nHello from JS');
    expect(stdout).toContain(
      'Debugging session complete. May your code be bug-free.',
    );

    global.default_api.run_shell_command = originalRunShellCommand;
  });
});
