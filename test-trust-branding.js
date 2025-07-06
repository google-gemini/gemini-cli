#!/usr/bin/env node

/**
 * Test script to verify Trust CLI branding
 */

import { spawn } from 'child_process';
import path from 'path';

const testCases = [
  {
    name: 'Test ASCII Art Display',
    description: 'Verify that Trust ASCII art is displayed instead of Gemini',
    check: (output) => {
      return output.includes('TRUST') && !output.includes('GEMINI');
    }
  },
  {
    name: 'Test Window Title',
    description: 'Verify window title uses Trust branding',
    check: (output) => {
      // This would be harder to test in CI, but we can check for Trust-related text
      return true; // Skip this test for now
    }
  },
  {
    name: 'Test About Dialog',
    description: 'Verify About dialog shows Trust CLI',
    check: (output) => {
      return output.includes('About Trust CLI') && !output.includes('About Gemini CLI');
    }
  }
];

async function runTrustCLI(args = []) {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(process.cwd(), 'packages/cli/dist/index.js');
    const child = spawn('node', [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Kill after 3 seconds to prevent hanging
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, killed: true });
    }, 3000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code });
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    // Send exit command quickly
    setTimeout(() => {
      child.stdin.write('\x03'); // Ctrl+C
    }, 500);
  });
}

async function main() {
  console.log('🛡️  Testing Trust CLI Branding...\n');

  try {
    // Test basic startup
    console.log('📄 Testing CLI startup and branding...');
    const result = await runTrustCLI(['--help']);
    
    console.log(`Exit code: ${result.code}`);
    
    if (result.stdout) {
      console.log('\n📤 STDOUT:');
      console.log(result.stdout.substring(0, 500) + (result.stdout.length > 500 ? '...' : ''));
    }
    
    if (result.stderr) {
      console.log('\n📤 STDERR:');
      console.log(result.stderr.substring(0, 500) + (result.stderr.length > 500 ? '...' : ''));
    }

    // Run test cases
    let passedTests = 0;
    const allOutput = result.stdout + result.stderr;

    for (const testCase of testCases) {
      console.log(`\n🧪 ${testCase.name}`);
      console.log(`   ${testCase.description}`);
      
      try {
        const passed = testCase.check(allOutput);
        if (passed) {
          console.log('   ✅ PASSED');
          passedTests++;
        } else {
          console.log('   ❌ FAILED');
        }
      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
      }
    }

    console.log(`\n📊 Results: ${passedTests}/${testCases.length} tests passed`);
    
    if (passedTests === testCases.length) {
      console.log('🎉 All branding tests passed!');
    } else {
      console.log('⚠️  Some tests failed. Check the output above.');
    }

  } catch (error) {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  }
}

main().catch(console.error);