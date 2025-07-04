#!/usr/bin/env node
// Pyrmethus, the Termux Coding Wizard, forges a script to cycle API keys.

const fs = require('fs');
const path = require('path');

// Chromatic constants for enchanted logging, using ANSI escape codes for JS
const NG = '\x1b[32m\x1b[1m'; // Bright Green
const NB = '\x1b[36m\x1b[1m'; // Bright Cyan
const NP = '\x1b[35m\x1b[1m'; // Bright Magenta
const NY = '\x1b[33m\x1b[1m'; // Bright Yellow
const NR = '\x1b[91m\x1b[1m'; // Bright Red
const RST = '\x1b[0m';         // Reset

const keysFilePath = path.resolve(process.cwd(), 'keys.md');

/**
 * Reads the scroll of keys and extracts them into a list.
 * @param {string} filePath - The path to the sacred keys.md file.
 * @returns {string[]} A list of API keys.
 */
function readApiKeys(filePath) {
    try {
        console.log(`${NB}// Reading the sacred scroll from ${filePath}...${RST}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const keyRegex = /-\s*"([^"]+)"/g;
        const keys = [];
        let match;
        while ((match = keyRegex.exec(content)) !== null) {
            keys.push(match[1]);
        }
        if (keys.length === 0) {
            console.error(`${NR}No keys found in the scroll. Ensure they are formatted as '- "YOUR_KEY"'${RST}`);
        }
        return keys;
    } catch (error) {
        console.error(`${NR}Failed to read the scroll of keys at ${filePath}: ${error.message}${RST}`);
        return [];
    }
}

/**
 * Finds the next key in the cycle.
 * @param {string[]} keys - The list of all available keys.
 * @param {string} currentKey - The currently active key.
 * @returns {string|null} The next key to use, or null if no keys are available.
 */
function getNextKey(keys, currentKey) {
    if (!keys || keys.length === 0) {
        return null;
    }
    if (!currentKey) {
        console.log(`${NY}No current key detected. Selecting the first key from the scroll.${RST}`);
        return keys[0];
    }

    const currentIndex = keys.indexOf(currentKey);
    if (currentIndex === -1) {
        console.log(`${NY}Current key not found in the scroll. Selecting the first key.${RST}`);
        return keys[0];
    }

    const nextIndex = (currentIndex + 1) % keys.length;
    return keys[nextIndex];
}

/**
 * The main incantation.
 */
function cycleApiKey() {
    console.log(`${NP}# Summoning the key-cycling spell...${RST}`);
    const keys = readApiKeys(keysFilePath);
    if (keys.length === 0) {
        console.error(`${NR}Incantation failed. No keys to cycle.${RST}`);
        return;
    }

    const currentKey = process.env.GEMINI_API_KEY;
    const nextKey = getNextKey(keys, currentKey);

    if (nextKey) {
        console.log(`${NG}Next key selected. To apply it to your session, run the following command:${RST}`);
        // This output is meant to be captured and executed by the shell
        console.log(`export GEMINI_API_KEY="${nextKey}"`);
        console.log(`${NP}# Incantation complete.${RST}`);
    } else {
        console.error(`${NR}Could not determine the next key.${RST}`);
    }
}

cycleApiKey();
