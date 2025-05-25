/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { DiffRenderer } from './DiffRenderer.js';
import * as CodeColorizer from '../../utils/CodeColorizer.js';
import { vi } from 'vitest';

describe('<DiffRenderer />', () => {
  const mockColorizeCode = vi.spyOn(CodeColorizer, 'colorizeCode');

  beforeEach(() => {
    mockColorizeCode.mockClear();
  });

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
      <DiffRenderer diffContent={newFileDiffContent} filename="test.py" />,
    );
    expect(mockColorizeCode).toHaveBeenCalledWith(
      'print("hello world")',
      'python',
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
      <DiffRenderer diffContent={newFileDiffContent} filename="test.unknown" />,
    );
    expect(mockColorizeCode).toHaveBeenCalledWith('some content', null);
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
    render(<DiffRenderer diffContent={newFileDiffContent} />);
    expect(mockColorizeCode).toHaveBeenCalledWith('some text content', null);
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
      <DiffRenderer
        diffContent={existingFileDiffContent}
        filename="test.txt"
      />,
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
      <DiffRenderer diffContent={noChangeDiff} filename="file.txt" />,
    );
    expect(lastFrame()).toContain('No changes detected');
    expect(mockColorizeCode).not.toHaveBeenCalled();
  });

  it('should handle empty diff content', () => {
    const { lastFrame } = render(<DiffRenderer diffContent="" />);
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
      <DiffRenderer diffContent={diffWithGap} filename="file.txt" />,
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
      <DiffRenderer diffContent={diffWithSmallGap} filename="file.txt" />,
    );
    const output = lastFrame();
    expect(output).not.toContain('═'); // Ensure no separator is rendered

    // Verify that lines before and after the gap are rendered
    expect(output).toContain('context line 5');
    expect(output).toContain('context line 11');
  });
});
