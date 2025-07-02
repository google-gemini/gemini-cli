/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { render } from 'ink-testing-library';
import { DiffRenderer } from './DiffRenderer.js';
import * as CodeColorizer from '../../utils/CodeColorizer.js';
import { vi } from 'vitest';

describe('<OverflowProvider><DiffRenderer /></OverflowProvider>', () => {
  const mockColorizeCode = vi.spyOn(CodeColorizer, 'colorizeCode');

  beforeEach(() => {
    mockColorizeCode.mockClear();
  });

  const sanitizeOutput = (output: string | undefined, terminalWidth: number) =>
    output?.replace(/GAP_INDICATOR/g, '═'.repeat(terminalWidth));

  it('should call colorizeCode with correct language for new file with known extension', () => {
    const newFileDiffContent = `
diff --git a/test.py b/test.py
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/test.py
@@ -0,0 +1 @@
+print("hello world")
`;
    render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={newFileDiffContent}
          filename="test.py"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    expect(mockColorizeCode).toHaveBeenCalledWith(
      'print("hello world")',
      'python',
      undefined,
      80,
    );
  });

  it('should call colorizeCode with null language for new file with unknown extension', () => {
    const newFileDiffContent = `
diff --git a/test.unknown b/test.unknown
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/test.unknown
@@ -0,0 +1 @@
+some content
`;
    render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={newFileDiffContent}
          filename="test.unknown"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    expect(mockColorizeCode).toHaveBeenCalledWith(
      'some content',
      null,
      undefined,
      80,
    );
  });

  it('should call colorizeCode with null language for new file if no filename is provided', () => {
    const newFileDiffContent = `
diff --git a/test.txt b/test.txt
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/test.txt
@@ -0,0 +1 @@
+some text content
`;
    render(
      <OverflowProvider>
        <DiffRenderer diffContent={newFileDiffContent} terminalWidth={80} />
      </OverflowProvider>,
    );
    expect(mockColorizeCode).toHaveBeenCalledWith(
      'some text content',
      null,
      undefined,
      80,
    );
  });

  it('should render diff content for existing file (not calling colorizeCode directly for the whole block)', () => {
    const existingFileDiffContent = `
diff --git a/test.txt b/test.txt
index 0000001..0000002 100644
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-old line
+new line
`;
    const { lastFrame } = render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={existingFileDiffContent}
          filename="test.txt"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    // colorizeCode is used internally by the line-by-line rendering, not for the whole block
    expect(mockColorizeCode).not.toHaveBeenCalledWith(
      expect.stringContaining('old line'),
      expect.anything(),
    );
    expect(mockColorizeCode).not.toHaveBeenCalledWith(
      expect.stringContaining('new line'),
      expect.anything(),
    );
    const output = lastFrame();
    const lines = output!.split('\n');
    expect(lines[0]).toBe('1    - old line');
    expect(lines[1]).toBe('1    + new line');
  });

  it('should handle diff with only header and no changes', () => {
    const noChangeDiff = `diff --git a/file.txt b/file.txt
index 1234567..1234567 100644
--- a/file.txt
+++ b/file.txt
`;
    const { lastFrame } = render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={noChangeDiff}
          filename="file.txt"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    expect(lastFrame()).toContain('No changes detected');
    expect(mockColorizeCode).not.toHaveBeenCalled();
  });

  it('should handle empty diff content', () => {
    const { lastFrame } = render(
      <OverflowProvider>
        <DiffRenderer diffContent="" terminalWidth={80} />
      </OverflowProvider>,
    );
    expect(lastFrame()).toContain('No diff content');
    expect(mockColorizeCode).not.toHaveBeenCalled();
  });

  it('should render a gap indicator for skipped lines', () => {
    const diffWithGap = `
diff --git a/file.txt b/file.txt
index 123..456 100644
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 context line 1
-deleted line
+added line
@@ -10,2 +10,2 @@
 context line 10
 context line 11
`;
    const { lastFrame } = render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={diffWithGap}
          filename="file.txt"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    const output = lastFrame();
    expect(output).toContain('═'); // Check for the border character used in the gap

    // Verify that lines before and after the gap are rendered
    expect(output).toContain('context line 1');
    expect(output).toContain('added line');
    expect(output).toContain('context line 10');
  });

  it('should not render a gap indicator for small gaps (<= MAX_CONTEXT_LINES_WITHOUT_GAP)', () => {
    const diffWithSmallGap = `
diff --git a/file.txt b/file.txt
index abc..def 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
 context line 1
 context line 2
 context line 3
 context line 4
 context line 5
@@ -11,5 +11,5 @@
 context line 11
 context line 12
 context line 13
 context line 14
 context line 15
`;
    const { lastFrame } = render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={diffWithSmallGap}
          filename="file.txt"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    const output = lastFrame();
    expect(output).not.toContain('═'); // Ensure no separator is rendered

    // Verify that lines before and after the gap are rendered
    expect(output).toContain('context line 5');
    expect(output).toContain('context line 11');
  });

  describe('should correctly render a diff with multiple hunks and a gap indicator', () => {
    const diffWithMultipleHunks = `
diff --git a/multi.js b/multi.js
index 123..789 100644
--- a/multi.js
+++ b/multi.js
@@ -1,3 +1,3 @@
 console.log('first hunk');
-const oldVar = 1;
+const newVar = 1;
 console.log('end of first hunk');
@@ -20,3 +20,3 @@
 console.log('second hunk');
-const anotherOld = 'test';
+const anotherNew = 'test';
 console.log('end of second hunk');
`;

    it.each([
      {
        terminalWidth: 80,
        height: undefined,
        expected: `1      console.log('first hunk');
2    - const oldVar = 1;
2    + const newVar = 1;
3      console.log('end of first hunk');
════════════════════════════════════════════════════════════════════════════════
20     console.log('second hunk');
21   - const anotherOld = 'test';
21   + const anotherNew = 'test';
22     console.log('end of second hunk');`,
      },
      {
        terminalWidth: 80,
        height: 6,
        expected: `... first 4 lines hidden ...
════════════════════════════════════════════════════════════════════════════════
20     console.log('second hunk');
21   - const anotherOld = 'test';
21   + const anotherNew = 'test';
22     console.log('end of second hunk');`,
      },
      {
        terminalWidth: 30,
        height: 6,
        expected: `... first 10 lines hidden ...
       'test';
21   + const anotherNew =
       'test';
22     console.log('end of
       second hunk');`,
      },
    ])(
      'with terminalWidth $terminalWidth and height $height',
      ({ terminalWidth, height, expected }) => {
        const { lastFrame } = render(
          <OverflowProvider>
            <DiffRenderer
              diffContent={diffWithMultipleHunks}
              filename="multi.js"
              terminalWidth={terminalWidth}
              availableTerminalHeight={height}
            />
          </OverflowProvider>,
        );
        const output = lastFrame();
        expect(sanitizeOutput(output, terminalWidth)).toEqual(expected);
      },
    );
  });

  it('should correctly render a diff with a SVN diff format', () => {
    const newFileDiff = `
fileDiff Index: file.txt
===================================================================
--- a/file.txt   Current
+++ b/file.txt   Proposed
--- a/multi.js
+++ b/multi.js
@@ -1,1 +1,1 @@
-const oldVar = 1;
+const newVar = 1;
@@ -20,1 +20,1 @@
-const anotherOld = 'test';
+const anotherNew = 'test';
\\ No newline at end of file  
`;
    const { lastFrame } = render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={newFileDiff}
          filename="TEST"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    const output = lastFrame();

    expect(output).toEqual(`1    - const oldVar = 1;
1    + const newVar = 1;
════════════════════════════════════════════════════════════════════════════════
20   - const anotherOld = 'test';
20   + const anotherNew = 'test';`);
  });

  it('should correctly render a new file with no file extension correctly', () => {
    const newFileDiff = `
fileDiff Index: Dockerfile
===================================================================
--- Dockerfile   Current
+++ Dockerfile   Proposed
@@ -0,0 +1,3 @@
+FROM node:14
+RUN npm install
+RUN npm run build
\\ No newline at end of file  
`;
    const { lastFrame } = render(
      <OverflowProvider>
        <DiffRenderer
          diffContent={newFileDiff}
          filename="Dockerfile"
          terminalWidth={80}
        />
      </OverflowProvider>,
    );
    const output = lastFrame();
    expect(output).toEqual(`1 FROM node:14
2 RUN npm install
3 RUN npm run build`);
  });
});
