/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
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

  describe.each([true, false])(
    'with useAlternateBuffer = %s',
    (useAlternateBuffer) => {
      it('should call colorizeCode with correct language for new file with known extension', async () => {
        const newFileDiffContent = `
diff --git a/test.py b/test.py
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/test.py
@@ -0,0 +1 @@
+print("hello world")
`;
        renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={newFileDiffContent}
              filename="test.py"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() =>
          expect(mockColorizeCode).toHaveBeenCalledWith({
            code: 'print("hello world")',
            language: 'python',
            availableHeight: undefined,
            maxWidth: 80,
            theme: undefined,
            settings: expect.anything(),
          }),
        );
      });

      it('should call colorizeCode with null language for new file with unknown extension', async () => {
        const newFileDiffContent = `
diff --git a/test.unknown b/test.unknown
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/test.unknown
@@ -0,0 +1 @@
+some content
`;
        renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={newFileDiffContent}
              filename="test.unknown"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() =>
          expect(mockColorizeCode).toHaveBeenCalledWith({
            code: 'some content',
            language: null,
            availableHeight: undefined,
            maxWidth: 80,
            theme: undefined,
            settings: expect.anything(),
          }),
        );
      });

      it('should call colorizeCode with null language for new file if no filename is provided', async () => {
        const newFileDiffContent = `
diff --git a/test.txt b/test.txt
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/test.txt
@@ -0,0 +1 @@
+some text content
`;
        renderWithProviders(
          <OverflowProvider>
            <DiffRenderer diffContent={newFileDiffContent} terminalWidth={80} />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() =>
          expect(mockColorizeCode).toHaveBeenCalledWith({
            code: 'some text content',
            language: null,
            availableHeight: undefined,
            maxWidth: 80,
            theme: undefined,
            settings: expect.anything(),
          }),
        );
      });

      it('should render diff content for existing file (not calling colorizeCode directly for the whole block)', async () => {
        const existingFileDiffContent = `

diff --git a/test.txt b/test.txt
index 0000001..0000002 100644
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-old line
+new line
`;
        const { lastFrame } = renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={existingFileDiffContent}
              filename="test.txt"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        // colorizeCode is used internally by the line-by-line rendering, not for the whole block
        await waitFor(() => expect(lastFrame()).toContain('new line'));
        expect(mockColorizeCode).not.toHaveBeenCalledWith(
          expect.objectContaining({
            code: expect.stringContaining('old line'),
          }),
        );
        expect(mockColorizeCode).not.toHaveBeenCalledWith(
          expect.objectContaining({
            code: expect.stringContaining('new line'),
          }),
        );
        expect(lastFrame()).toMatchSnapshot();
      });

      it('should handle diff with only header and no changes', async () => {
        const noChangeDiff = `diff --git a/file.txt b/file.txt
index 1234567..1234567 100644
--- a/file.txt
+++ b/file.txt
`;
        const { lastFrame } = renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={noChangeDiff}
              filename="file.txt"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() => expect(lastFrame()).toBeDefined());
        expect(lastFrame()).toMatchSnapshot();
        expect(mockColorizeCode).not.toHaveBeenCalled();
      });

      it('should handle empty diff content', async () => {
        const { lastFrame } = renderWithProviders(
          <OverflowProvider>
            <DiffRenderer diffContent="" terminalWidth={80} />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() => expect(lastFrame()).toBeDefined());
        expect(lastFrame()).toMatchSnapshot();
        expect(mockColorizeCode).not.toHaveBeenCalled();
      });

      it('should render a gap indicator for skipped lines', async () => {
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
        const { lastFrame } = renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={diffWithGap}
              filename="file.txt"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() => expect(lastFrame()).toContain('added line'));
        expect(lastFrame()).toMatchSnapshot();
      });

      it('should not render a gap indicator for small gaps (<= MAX_CONTEXT_LINES_WITHOUT_GAP)', async () => {
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
        const { lastFrame } = renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={diffWithSmallGap}
              filename="file.txt"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() => expect(lastFrame()).toContain('context line 15'));
        expect(lastFrame()).toMatchSnapshot();
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
          },
          {
            terminalWidth: 80,
            height: 6,
          },
          {
            terminalWidth: 30,
            height: 6,
          },
        ])(
          'with terminalWidth $terminalWidth and height $height',
          async ({ terminalWidth, height }) => {
            const { lastFrame } = renderWithProviders(
              <OverflowProvider>
                <DiffRenderer
                  diffContent={diffWithMultipleHunks}
                  filename="multi.js"
                  terminalWidth={terminalWidth}
                  availableTerminalHeight={height}
                />
              </OverflowProvider>,
              { useAlternateBuffer },
            );
            await waitFor(() => expect(lastFrame()).toContain('anotherNew'));
            const output = lastFrame();
            expect(sanitizeOutput(output, terminalWidth)).toMatchSnapshot();
          },
        );
      });

      it('should correctly render a diff with a SVN diff format', async () => {
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
        const { lastFrame } = renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={newFileDiff}
              filename="TEST"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() => expect(lastFrame()).toContain('newVar'));
        expect(lastFrame()).toMatchSnapshot();
      });

      it('should correctly render a new file with no file extension correctly', async () => {
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
        const { lastFrame } = renderWithProviders(
          <OverflowProvider>
            <DiffRenderer
              diffContent={newFileDiff}
              filename="Dockerfile"
              terminalWidth={80}
            />
          </OverflowProvider>,
          { useAlternateBuffer },
        );
        await waitFor(() => expect(lastFrame()).toContain('RUN npm run build'));
        expect(lastFrame()).toMatchSnapshot();
      });
    },
  );
});
