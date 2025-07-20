/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert';
import { test, skip } from 'node:test';
import { TestRig } from './test-helper.js';

// Skip these tests unless AWS Bedrock is configured
const shouldRunBedrockTests = process.env.BEDROCK_E2E_TESTS === 'true' && 
                             process.env.AWS_REGION && 
                             (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE);

const bedrockTest = shouldRunBedrockTests ? test : skip;

bedrockTest('generates text with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  const output = rig.run('Say "Hello from AWS Bedrock"');
  
  assert.ok(output.toLowerCase().includes('hello'));
  assert.ok(output.toLowerCase().includes('bedrock'));
});

bedrockTest('reads file with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  // Create a test file
  rig.createFile('bedrock-test.txt', 'AWS Bedrock integration test content');
  
  const output = rig.run('read the file bedrock-test.txt and tell me what it contains');
  
  assert.ok(output.toLowerCase().includes('aws bedrock'));
  assert.ok(output.toLowerCase().includes('integration test'));
});

bedrockTest('writes file with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  rig.run('create a file called bedrock-output.txt with the message "Written by Claude via AWS Bedrock"');
  
  const fileContent = rig.readFile('bedrock-output.txt');
  assert.ok(fileContent.includes('Claude') || fileContent.includes('Bedrock'));
});

bedrockTest('handles JSON mode with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  const output = rig.run('--json generate a JSON object with status: "success" and provider: "bedrock"');
  
  // Try to parse the output as JSON
  let parsed;
  try {
    // Extract JSON from the output (it might have markdown formatting)
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (_e) {
    // If not direct JSON, look for code blocks
    const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      parsed = JSON.parse(codeBlockMatch[1]);
    }
  }
  
  assert.ok(parsed, 'Output should contain valid JSON');
  assert.ok(parsed.status === 'success' || parsed.provider === 'bedrock', 
    'JSON should contain requested fields');
});

bedrockTest('lists directory with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  // Create some test files
  rig.createFile('file1.txt', 'content1');
  rig.createFile('file2.txt', 'content2');
  rig.createFile('file3.md', 'content3');
  
  const output = rig.run('list all txt files in the current directory');
  
  assert.ok(output.includes('file1.txt'));
  assert.ok(output.includes('file2.txt'));
});

bedrockTest('handles multi-file operations with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  // Create test files
  rig.createFile('test1.js', 'console.log("test1");');
  rig.createFile('test2.js', 'console.log("test2");');
  
  rig.run('read test1.js and test2.js, then create a summary.txt file listing what each file does');
  
  const summary = rig.readFile('summary.txt');
  assert.ok(summary.toLowerCase().includes('test1'));
  assert.ok(summary.toLowerCase().includes('test2'));
});

bedrockTest('uses grep functionality with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  // Create test files with specific content
  rig.createFile('config.json', '{"apiKey": "secret", "endpoint": "https://api.example.com"}');
  rig.createFile('readme.md', 'This project uses an API endpoint for communication.');
  rig.createFile('main.js', 'const endpoint = process.env.API_ENDPOINT;');
  
  const output = rig.run('search for "endpoint" in all files');
  
  assert.ok(output.includes('config.json'));
  assert.ok(output.includes('main.js'));
  assert.ok(output.includes('readme.md') || output.includes('README.md'));
});

// Test streaming capability (if the test rig supports it)
bedrockTest('streams responses with AWS Bedrock', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Configure for Bedrock
  rig.run('config set selectedAuthType aws-bedrock');
  
  // This test would need the TestRig to support streaming
  // For now, we just test that streaming flag doesn't break normal operation
  const output = rig.run('--stream Write a short poem about AWS Bedrock');
  
  assert.ok(output.length > 10, 'Should generate some content');
  assert.ok(output.toLowerCase().includes('bedrock') || output.toLowerCase().includes('aws'), 
    'Should mention Bedrock or AWS');
});

// Test error handling
bedrockTest('handles invalid AWS credentials gracefully', async (t) => {
  const rig = new TestRig();
  rig.setup(t.name);
  
  // Temporarily set invalid credentials
  const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
  const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
  
  process.env.AWS_ACCESS_KEY_ID = 'INVALID_KEY';
  process.env.AWS_SECRET_ACCESS_KEY = 'INVALID_SECRET';
  
  try {
    rig.run('config set selectedAuthType aws-bedrock');
    const output = rig.run('test message');
    
    // Should get an error message about credentials
    assert.ok(
      output.includes('credentials') || 
      output.includes('authentication') || 
      output.includes('AWS') ||
      output.includes('401') ||
      output.includes('403'),
      'Should indicate credential error'
    );
  } finally {
    // Restore original credentials
    if (originalAccessKey) process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
    if (originalSecretKey) process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
  }
});

// Log instructions if tests are skipped
if (!shouldRunBedrockTests) {
  console.log('\n⚠️  AWS Bedrock E2E tests are skipped.');
  console.log('To run these tests:');
  console.log('1. Set AWS_REGION environment variable');
  console.log('2. Configure AWS credentials (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or AWS_PROFILE)');
  console.log('3. Set BEDROCK_E2E_TESTS=true');
  console.log('4. Ensure you have access to Claude models in AWS Bedrock\n');
}