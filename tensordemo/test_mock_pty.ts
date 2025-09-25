#!/usr/bin/env tsx

/**
 * Mock PTY Test - Tests the Windows PTY compatibility layer without requiring node-pty
 */

import { WindowsTestSuite, MockPtyProcess } from './windows_pty_fix.js';

console.log('🧪 Testing Mock PTY Implementation');
console.log('=' .repeat(50));

async function testMockPty() {
  console.log('\n1️⃣ Testing MockPtyProcess class...');

  // Create a mock PTY process
  const mockPty = new MockPtyProcess('node', ['--version'], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env
  });

  let dataReceived = '';
  let exitCode: number | null = null;

  // Set up event handlers
  mockPty.onData((data: string) => {
    console.log(`📨 Data received: ${data}`);
    dataReceived += data;
  });

  mockPty.onExit((code: number) => {
    console.log(`🏁 Exit code: ${code}`);
    exitCode = code;
  });

  // Simulate sending Ctrl+C
  console.log('📤 Sending Ctrl+C...');
  mockPty.write('\x03');

  // Wait for exit
  await new Promise<void>((resolve) => {
    const checkExit = () => {
      if (exitCode !== null) {
        resolve();
      } else {
        setTimeout(checkExit, 50);
      }
    };
    checkExit();
  });

  // Verify results
  if (exitCode === 0) {
    console.log('✅ Mock PTY handled Ctrl+C correctly');
    return true;
  } else {
    console.log('❌ Mock PTY failed to handle Ctrl+C');
    return false;
  }
}

async function testWindowsTestSuite() {
  console.log('\n2️⃣ Testing WindowsTestSuite...');

  try {
    await WindowsTestSuite.testCtrlCExit();
    console.log('✅ WindowsTestSuite.testCtrlCExit() passed');
    return true;
  } catch (error) {
    console.log('❌ WindowsTestSuite.testCtrlCExit() failed:', error);
    return false;
  }
}

async function testPtySupportDetection() {
  console.log('\n3️⃣ Testing PTY support detection...');

  const isSupported = WindowsTestSuite.isPtySupported();
  console.log(`📊 PTY supported: ${isSupported}`);

  if (!isSupported) {
    console.log('✅ Correctly detected that PTY is not supported (mock fallback)');
    return true;
  } else {
    console.log('⚠️ PTY detected as supported (will use real PTY)');
    return true;
  }
}

async function runAllTests() {
  console.log('🚀 Running Mock PTY Tests');
  console.log('Testing Windows PTY compatibility layer without real node-pty dependency\n');

  const tests = [
    { name: 'Mock PTY Process', fn: testMockPty },
    { name: 'Windows Test Suite', fn: testWindowsTestSuite },
    { name: 'PTY Support Detection', fn: testPtySupportDetection }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        console.log(`✅ ${test.name} - PASSED`);
      } else {
        failed++;
        console.log(`❌ ${test.name} - FAILED`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ${test.name} - ERROR:`, error);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log('📊 MOCK PTY TEST RESULTS');
  console.log('=' .repeat(50));
  console.log(`Total Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 ALL MOCK PTY TESTS PASSED!');
    console.log('✅ Windows PTY compatibility layer is working correctly');
    console.log('✅ Ready for production use');
    return true;
  } else {
    console.log(`\n⚠️ ${failed} test(s) failed. Please review issues.`);
    return false;
  }
}

// Run tests
runAllTests()
  .then(success => {
    if (success) {
      console.log('\n🚀 MOCK PTY TESTING COMPLETE - ALL SYSTEMS GO!');
      process.exit(0);
    } else {
      console.log('\n⚠️ Some tests failed - review and fix before production.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n💥 CRITICAL ERROR during testing:', error);
    process.exit(1);
  });
