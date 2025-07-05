
const assert = require('assert');
const { refactorCodeTool } = require('../ts-tools/refactor-code');
const fs = require('fs/promises');
const path = require('path');

describe('refactorCodeTool', () => {
    const testDir = 'refactor-test-dir';
    const testFile = path.join(testDir, 'test-class.ts');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
        const initialContent = `
class MyTestClass {
    constructor() {
        console.log('constructor');
    }

    myMethod() {
        console.log('line 1');
        const x = 1;
        const y = 2;
        const z = x + y;
        console.log('result:', z);
        console.log('line 2');
    }
}
`;
        await fs.writeFile(testFile, initialContent.trim());
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should extract a block of code into a new method', async () => {
        const args = [
            'extract-method',
            '--file', testFile,
            '--start-line', '8',
            '--end-line', '10',
            '--new-method-name', 'calculateSum'
        ];
        
        const result = await refactorCodeTool(args);
        assert.strictEqual(result, `Successfully extracted code to new method 'calculateSum' in ${testFile}`);

        const newContent = await fs.readFile(testFile, 'utf-8');
        
        // Verify the new method was called
        assert.ok(newContent.includes('this.calculateSum();'), 'The new method should be called.');
        
        // Verify the new method exists
        assert.ok(newContent.includes('private calculateSum() {'), 'The new method definition should exist.');
        
        // Verify the extracted code is inside the new method
        assert.ok(newContent.includes('const z = x + y;'), 'The extracted code should be in the new method.');
        
        // Verify the original code is removed from the old method
        const oldMethodContent = newContent.match(/myMethod\(\) \{([\s\S]*?)\}/s)[1];
        assert.ok(!oldMethodContent.includes('const z = x + y;'), 'The extracted code should be removed from the original method.');
    });
});
