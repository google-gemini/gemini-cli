const assert = require('assert');
const { grepTool } = require('../ts-tools/grep_tool');
const fs = require('fs/promises');
const path = require('path');

describe('grepTool', () => {
    const testDir = 'grep-test-dir';
    const testFile1 = path.join(testDir, 'file1.txt');
    const testFile2 = path.join(testDir, 'file2.txt');

    before(async () => {
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(testFile1, 'hello world\nGoodbye World\n');
        await fs.writeFile(testFile2, 'another file\nwith hello\n');
    });

    after(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should find a pattern in a single file', async () => {
        const result = await grepTool(['hello', testFile1]);
        assert.strictEqual(result.trim(), 'hello world');
    });

    it('should find a pattern in multiple files', async () => {
        const result = await grepTool(['hello', testFile1, testFile2]);
        const expected = `${testFile1}:hello world\n${testFile2}:with hello`;
        assert.strictEqual(result.trim(), expected);
    });

    it('should be case-insensitive with -i flag', async () => {
        const result = await grepTool(['-i', 'world', testFile1]);
        const expected = 'hello world\nGoodbye World';
        assert.strictEqual(result.trim(), expected);
    });

    it('should show line numbers with -n flag', async () => {
        const result = await grepTool(['-n', 'world', testFile1]);
        const expected = '1:hello world\n2:Goodbye World';
        assert.strictEqual(result.trim(), expected);
    });

    it('should show context with -C flag', async () => {
        await fs.writeFile(testFile1, 'line1\nline2\nhello world\nline4\nline5');
        const result = await grepTool(['-C', '1', 'hello', testFile1]);
        const expected = 'line2\nhello world\nline4';
        assert.strictEqual(result.trim(), expected);
    });
    
    it('should return a graceful message for no matches', async () => {
        const result = await grepTool(['nomatch', testFile1]);
        assert.strictEqual(result.trim(), 'No matches found.');
    });
});