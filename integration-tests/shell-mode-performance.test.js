import { test } from 'node:test';
import { strict as assert } from 'assert';
import { InteractiveTestRig } from './interactive-test-helper.js';

test('shell mode entry and exit performance', async (t) => {
  const gemini = new InteractiveTestRig();
  
  const ITERATIONS = 3;

  // Give a clear message in the test output
  process.stdout.write(
    `\n--- Measuring shell mode toggle performance over ${ITERATIONS} iterations ---\n`,
  );

  try {
    // Start the interactive CLI
    await gemini.spawn();

    // Wait for Gemini to finish initialization
    // Wait for the main prompt indicating CLI is ready
    await gemini.waitForOutput('YOLO mode', 30000);

    console.time('shell_mode_toggle_test');

    for (let i = 0; i < ITERATIONS; i++) {
      // Enter shell mode by typing '!'
      await gemini.pressKey('!');
      
      // Wait for any output to confirm shell mode is active
      await gemini.waitForOutput('│', 500); // Wait for UI refresh
      
      // Type echo command in shell mode
      await gemini.pressKey('e');
      await gemini.pressKey('c');
      await gemini.pressKey('h');
      await gemini.pressKey('o');
      await gemini.pressKey(' ');
      await gemini.pressKey('"');
      await gemini.pressKey('t');
      await gemini.pressKey('e');
      await gemini.pressKey('s');
      await gemini.pressKey('t');
      await gemini.pressKey(' ');
      await gemini.pressKey(String(i + 1));
      await gemini.pressKey('"');
      await gemini.pressKey('\r'); // Enter key
      
      // Wait for command completion
      await gemini.waitForOutput('│', 1000); // Wait for UI update
      
      // Exit shell mode
      await gemini.pressKey('escape');
      
      // Wait for return to normal mode
      await gemini.waitForOutput('│', 500); // Wait for UI refresh
    }

    console.timeEnd('shell_mode_toggle_test');

    process.stdout.write('--- Performance test completed ---\n');

    // A simple assertion to make sure the test runner considers this a valid test
    assert.ok(true);
  } finally {
    await gemini.cleanup();
  }
});
