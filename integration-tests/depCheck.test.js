// integration-tests/depCheck.test.js
// Pyrmethus, the Termux Coding Wizard, conjures tests for the depCheck spell.

const { TestRig } = require('./test-helper');
const { join } = require('path');
const { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } = require('fs');

describe('depCheck command', () => {
  let rig;

  beforeEach(() => {
    rig = new TestRig();
    rig.setup(expect.getState().currentTestName);
  });

  afterEach(() => {
    rig.cleanup(); // Assuming a cleanup method exists or will be added to TestRig
  });

  test('should report no project detected in an empty directory', async () => {
    const stdout = rig.run('depCheck');
    expect(stdout).toContain('No Node.js (package.json) or Python (requirements.txt) project detected in this realm.');
    expect(stdout).toContain('Dependency check complete. The ether is clear.');
  });

  test('should report all Node.js dependencies in harmony', async () => {
    rig.createFile('package.json', JSON.stringify({
      name: 'test-node-app',
      version: '1.0.0',
      dependencies: {
        'express': '^4.17.1',
        'lodash': '^4.17.21'
      }
    }));
    rig.mkdir('node_modules/express');
    rig.createFile('node_modules/express/package.json', JSON.stringify({ version: '4.17.1' }));
    rig.mkdir('node_modules/lodash');
    rig.createFile('node_modules/lodash/package.json', JSON.stringify({ version: '4.17.21' }));

    const stdout = rig.run('depCheck');
    expect(stdout).toContain('All Node.js dependencies are in harmony.');
    expect(stdout).toContain('Installed: express (Version: 4.17.1)');
    expect(stdout).toContain('Installed: lodash (Version: 4.17.21)');
  });

  test('should report missing Node.js dependencies', async () => {
    rig.createFile('package.json', JSON.stringify({
      name: 'test-node-app',
      version: '1.0.0',
      dependencies: {
        'express': '^4.17.1',
        'missing-package': '^1.0.0'
      }
    }));
    rig.mkdir('node_modules/express');
    rig.createFile('node_modules/express/package.json', JSON.stringify({ version: '4.17.1' }));

    const stdout = rig.run('depCheck');
    expect(stdout).toContain('Missing: missing-package (Required: ^1.0.0)');
    expect(stdout).toContain('Found 1 missing Node.js dependencies. Consider running: npm install');
  });

  test('should report outdated Node.js dependencies', async () => {
    rig.createFile('package.json', JSON.stringify({
      name: 'test-node-app',
      version: '1.0.0',
      dependencies: {
        'express': '^4.18.0', // Required newer version
      }
    }));
    rig.mkdir('node_modules/express');
    rig.createFile('node_modules/express/package.json', JSON.stringify({ version: '4.17.1' })); // Installed older version

    const stdout = rig.run('depCheck');
    expect(stdout).toContain('Outdated: express (Required: ^4.18.0, Installed: 4.17.1)');
    expect(stdout).toContain('Found 1 outdated Node.js dependencies. Consider running: npm update');
  });

  test('should report all Python dependencies in harmony', async () => {
    rig.createFile('requirements.txt', 'requests==2.28.1\nflask==2.1.0');
    // Simulate pip freeze output
    const mockPipFreezeOutput = 'requests==2.28.1\nflask==2.1.0';
    // Mock run_shell_command for pip freeze
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command === 'pip freeze') {
        return { stdout: mockPipFreezeOutput };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('depCheck');
    expect(stdout).toContain('All Python dependencies are in harmony.');
    expect(stdout).toContain('Installed: requests (Version: 2.28.1)');
    expect(stdout).toContain('Installed: flask (Version: 2.1.0)');

    global.default_api.run_shell_command = originalRunShellCommand; // Restore original
  });

  test('should report missing Python dependencies', async () => {
    rig.createFile('requirements.txt', 'requests==2.28.1\nmissing-package==1.0.0');
    const mockPipFreezeOutput = 'requests==2.28.1';
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command === 'pip freeze') {
        return { stdout: mockPipFreezeOutput };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('depCheck');
    expect(stdout).toContain('Missing: missing-package (Required: 1.0.0)');
    expect(stdout).toContain('Found 1 missing Python dependencies. Consider running: pip install -r requirements.txt');

    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should report outdated Python dependencies', async () => {
    rig.createFile('requirements.txt', 'requests==2.29.0'); // Required newer version
    const mockPipFreezeOutput = 'requests==2.28.1'; // Installed older version
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command === 'pip freeze') {
        return { stdout: mockPipFreezeOutput };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('depCheck');
    expect(stdout).toContain('Outdated: requests (Required: 2.29.0, Installed: 2.28.1)');
    expect(stdout).toContain('Found 1 outdated Python dependencies. Consider running: pip install --upgrade -r requirements.txt');

    global.default_api.run_shell_command = originalRunShellCommand;
  });

  test('should handle invalid package.json', async () => {
    rig.createFile('package.json', '{ "name": "test", "dependencies": { "express": } }'); // Malformed JSON
    const stdout = rig.run('depCheck');
    expect(stdout).toContain('Failed to check Node.js dependencies:');
  });

  test('should handle invalid requirements.txt (empty line)', async () => {
    rig.createFile('requirements.txt', 'requests==2.28.1\n\nflask'); // Malformed line
    const mockPipFreezeOutput = 'requests==2.28.1';
    const originalRunShellCommand = global.default_api.run_shell_command;
    global.default_api.run_shell_command = async ({ command }) => {
      if (command === 'pip freeze') {
        return { stdout: mockPipFreezeOutput };
      }
      return originalRunShellCommand({ command });
    };

    const stdout = rig.run('depCheck');
    expect(stdout).toContain('Missing: flask (Required: any)'); // It will treat 'flask' as a missing package with no version spec
    global.default_api.run_shell_command = originalRunShellCommand;
  });
});
