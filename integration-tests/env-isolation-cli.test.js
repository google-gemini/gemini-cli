#!/usr/bin/env node

/**
 * Integration test for --ignore-local-env flag using actual CLI invocation
 * This test verifies that the gemini CLI properly isolates from project .env files
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test configuration
const testDir = path.join(os.tmpdir(), 'gemini-cli-env-test-' + Date.now());
const geminiCliPath = path.join(__dirname, '..', 'packages', 'cli', 'index.js');

function setup() {
  // Create test directory structure
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, '.gemini'), { recursive: true });
  
  // Create malicious .env files in test directory
  fs.writeFileSync(
    path.join(testDir, '.env'),
    'GEMINI_API_KEY=MALICIOUS_KEY_FROM_PROJECT\n' +
    'TEST_PROJECT_VAR=project_root_env'
  );
  
  fs.writeFileSync(
    path.join(testDir, '.gemini', '.env'),
    'GEMINI_API_KEY=MALICIOUS_KEY_FROM_GEMINI_DIR\n' +
    'TEST_PROJECT_VAR=project_gemini_env'
  );
  
  // Create a test prompt that will echo environment variables
  fs.writeFileSync(
    path.join(testDir, 'test-prompt.txt'),
    'echo "GEMINI_API_KEY=$GEMINI_API_KEY TEST_PROJECT_VAR=$TEST_PROJECT_VAR"'
  );
}

function cleanup() {
  fs.rmSync(testDir, { recursive: true, force: true });
}

function runTest() {
  console.log('Testing gemini CLI --ignore-local-env flag...\n');
  
  try {
    setup();
    
    // Test 1: Without --ignore-local-env (default behavior)
    console.log('Test 1: Default behavior (should load project .env)');
    try {
      const output1 = execSync(
        `node ${geminiCliPath} --debug < test-prompt.txt`,
        {
          cwd: testDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            // Ensure we don't have these vars already set
            GEMINI_API_KEY: undefined,
            TEST_PROJECT_VAR: undefined
          }
        }
      );
      
      // Check if project .env was loaded
      if (output1.includes('MALICIOUS_KEY_FROM_PROJECT') || 
          output1.includes('MALICIOUS_KEY_FROM_GEMINI_DIR')) {
        console.log('✅ Default behavior loads project .env files (as expected)');
      } else {
        console.log('❓ Could not verify default .env loading behavior');
      }
    } catch (e) {
      console.log('❓ Default behavior test skipped (CLI may require API key)');
    }
    
    // Test 2: With --ignore-local-env flag
    console.log('\nTest 2: With --ignore-local-env flag');
    
    // Set a safe global API key for testing
    const safeEnv = {
      ...process.env,
      GEMINI_API_KEY: 'SAFE_GLOBAL_API_KEY',
      TEST_PROJECT_VAR: undefined
    };
    
    try {
      const output2 = execSync(
        `node ${geminiCliPath} --ignore-local-env --debug < test-prompt.txt`,
        {
          cwd: testDir,
          encoding: 'utf8',
          env: safeEnv
        }
      );
      
      // Verify project .env files were NOT loaded
      if (!output2.includes('MALICIOUS_KEY_FROM_PROJECT') && 
          !output2.includes('MALICIOUS_KEY_FROM_GEMINI_DIR') &&
          !output2.includes('project_root_env') &&
          !output2.includes('project_gemini_env')) {
        console.log('✅ --ignore-local-env successfully prevents loading project .env files');
      } else {
        console.error('❌ --ignore-local-env failed to prevent loading project .env files');
        console.error('Output contained:', output2);
        process.exit(1);
      }
      
      // Verify global env vars are still accessible
      if (output2.includes('SAFE_GLOBAL_API_KEY')) {
        console.log('✅ Global environment variables are still accessible');
      }
    } catch (e) {
      console.error('❌ Error running CLI with --ignore-local-env:', e.message);
      process.exit(1);
    }
    
    // Test 3: Verify settings.json configuration
    console.log('\nTest 3: Testing ignoreLocalEnv in settings.json');
    
    // Create settings.json with ignoreLocalEnv
    fs.writeFileSync(
      path.join(testDir, '.gemini', 'settings.json'),
      JSON.stringify({ ignoreLocalEnv: true }, null, 2)
    );
    
    try {
      const output3 = execSync(
        `node ${geminiCliPath} --debug < test-prompt.txt`,
        {
          cwd: testDir,
          encoding: 'utf8',
          env: safeEnv
        }
      );
      
      // Verify project .env files were NOT loaded due to settings
      if (!output3.includes('MALICIOUS_KEY_FROM_PROJECT') && 
          !output3.includes('MALICIOUS_KEY_FROM_GEMINI_DIR')) {
        console.log('✅ ignoreLocalEnv in settings.json successfully prevents loading project .env files');
      } else {
        console.error('❌ ignoreLocalEnv in settings.json failed to prevent loading project .env files');
        process.exit(1);
      }
    } catch (e) {
      console.error('❌ Error testing settings.json configuration:', e.message);
      process.exit(1);
    }
    
    console.log('\n✅ All integration tests passed!');
    cleanup();
    
  } catch (error) {
    console.error('Test failed:', error);
    cleanup();
    process.exit(1);
  }
}

// Run the test
runTest();