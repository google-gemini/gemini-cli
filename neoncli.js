
```javascript
/**                                                                                      * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0                                                   */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel, // Import GenerativeModel for type hinting
  ChatSession, // Import ChatSession for type hinting
} from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import mime from 'mime-types';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { highlight } from 'cli-highlight';

// --- Constants & Configuration ---
                                                                                        // Default Model Configuration                                                          const DEFAULT_MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
const DEFAULT_TEMPERATURE = parseFloat(process.env.GEMINI_DEFAULT_TEMP || '0.7');
const DEFAULT_HISTORY_FILE = process.env.GEMINI_HISTORY_FILE || './gemini_chat_history.json';
const DEFAULT_MAX_HISTORY_TURNS = parseInt(process.env.GEMINI_MAX_HISTORY || '50', 10);
const DEFAULT_SAFETY_SETTING = (process.env.GEMINI_SAFETY_SETTING || 'BLOCK_MEDIUM_AND_ABOVE').toUpperCase();
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';                                                                                  
// Safety Settings Mapping                                                              const SAFETY_MAP = {
  BLOCK_NONE: HarmBlockThreshold.BLOCK_NONE,                                              BLOCK_LOW_AND_ABOVE: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,                            BLOCK_MEDIUM_AND_ABOVE: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  BLOCK_ONLY_HIGH: HarmBlockThreshold.BLOCK_ONLY_HIGH,                                  };
                                                                                        // Supported Languages for Highlighting                                                 const SUPPORTED_LANGUAGES = new Set([
  'javascript', 'jsx', 'ts', 'tsx', 'python', 'java', 'cpp', 'c', 'h', 'go', 'rs',        'swift', 'php', 'rb', 'sh', 'sql', 'html', 'htm', 'md', 'txt', 'css', 'scss',           'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'Dockerfile', 'Makefile',
  'bash', 'typescript', 'scala', 'ruby', 'rust', 'csharp', 'kotlin', 'scala', 'xml',      'dockerfile', 'toml', 'markdown',
]);                                                                                     
// Text-Based File Extensions for potential content preview/handling
const TEXT_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'swift',
  'php', 'rb', 'sh', 'sql', 'html', 'htm', 'md', 'txt', 'css', 'scss', 'json',            'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'Dockerfile', 'Makefile',
]);                                                                                     
// Command Definitions                                                                  const CMD = {
  PREFIX: '/',                                                                            PASTE: '/paste',
  END_PASTE: '/endpaste',                                                                 TEMP: '/temp',                                                                          SAVE: '/save',
  FILE: '/file',                                                                          LOAD: '/load', // Alias for /file
  SAFETY: '/safety',                                                                      HELP: '/help',
  EXIT: '/exit',                                                                          CLEAR: '/clear',
  HISTORY: '/history',                                                                    MODEL: '/model',
  DEBUG: '/debug',
  HIGHLIGHT: '/highlight',
  PREVIEW: '/preview', // New command for file preview
  SEARCH: '/search',
  SYS_PROMPT: '/sysprompt', // Command to view/change system prompt                       MAX_TOKENS: '/maxtokens', // Command to view/change max output tokens
  CONFIG: '/config', // Command to view current config                                    ALIAS: {
    F: '/f', Q: '/q', QUIT: '/quit', T: '/t', S: '/s', H: '/h', C: '/c', P: '/p',           E: '/e', SP: '/sp', MT: '/mt', CFG: '/cfg', HELP_Q: '/?', L: '/l',
  },                                                                                    };
                                                                                        // --- Neon Sigils (Chalk Theme) ---
const neon = {                                                                            userPrompt: chalk.cyan.bold,                                                            aiResponse: chalk.white,                                                                aiThinking: chalk.yellow.dim,                                                           systemInfo: chalk.blue.bold,                                                            commandHelp: chalk.green,                                                               filePath: chalk.magenta,                                                                warning: chalk.yellow.bold,                                                             error: chalk.red.bold,                                                                  debug: chalk.gray.dim,
  promptMarker: chalk.cyan.bold('You: '),
  aiMarker: chalk.green.bold('AI: '),
  pasteMarker: chalk.yellow.bold('Paste> '),
  sysMarker: chalk.blue.bold('[System] '),                                                errorMarker: chalk.red.bold('[Error] '),
  warnMarker: chalk.yellow.bold('[Warning] '),                                            infoMarker: chalk.blue.bold('[Info] '),                                                 thinkingIndicator: chalk.yellow.dim('AI is thinking...'),                               highlightReset: chalk.reset, // For ensuring styles don't bleed
  userMessage: chalk.cyan, // For general user input                                    };                                                                                                                                                                              // --- State Variables ---
let chatHistory = [];
let currentChatSession: ChatSession | null = null;
let aiModelInstance: GenerativeModel | null = null;
let isPastingMode = false;                                                              let pasteBufferContent: string[] = [];
let lastTextResponse: string | null = null;                                             let saveFilePath: string | null = null;
let readlineInterface: readline.Interface | null = null;
let isAiThinking = false;                                                               let isHighlightingActive = true; // Default to enabled
let currentTemperature = DEFAULT_TEMPERATURE;                                           let maxOutputTokens = 8192; // Default max output tokens
let currentSystemPrompt = DEFAULT_SYSTEM_PROMPT;
let previewFileContent = false; // Default to disabled

// --- Argument Parsing ---                                                             const argv = yargs(hideBin(process.argv))                                                 .option('api-key', {
    alias: 'k',
    type: 'string',
    description: 'Google Generative AI API Key',                                          })
  .option('model', {
    alias: 'm',
    type: 'string',
    default: DEFAULT_MODEL_NAME,
    description: 'Gemini model name',
  })                                                                                      .option('temperature', {                                                                  alias: 't',
    type: 'number',                                                                         default: DEFAULT_TEMPERATURE,
    description: 'Generation temperature (0.0-2.0)',                                      })                                                                                      .option('max-tokens', {                                                                   alias: ['mt', 'max_tokens'],
    type: 'number',                                                                         default: maxOutputTokens,
    description: 'Maximum output tokens for generation',                                  })
  .option('history-file', {                                                                 alias: ['h', 'history_file'],                                                           type: 'string',                                                                         default: DEFAULT_HISTORY_FILE,                                                          description: 'Chat history JSON file path',                                           })                                                                                      .option('safety', {
    alias: 's',                                                                             type: 'string',                                                                         default: DEFAULT_SAFETY_SETTING,                                                        description: 'Safety threshold',                                                        choices: Object.keys(SAFETY_MAP),                                                       coerce: (val) => val.toUpperCase(),
  })                                                                                      .option('system-prompt', {
    alias: ['sp', 'system_prompt'],                                                         type: 'string',                                                                         description: 'Custom system prompt',
  })                                                                                      .option('debug', {                                                                        type: 'boolean',                                                                        default: process.env.DEBUG_MODE === 'true',                                             description: 'Enable debug logging',                                                  })
  .option('highlight', {                                                                    type: 'boolean',
    default: true,                                                                          description: 'Enable syntax highlighting',                                            })
  .option('no-highlight', {                                                                 type: 'boolean',
    default: false,                                                                         description: 'Disable syntax highlighting',
  })
  .option('max-history', {
    type: 'number',
    default: DEFAULT_MAX_HISTORY_TURNS,                                                     description: 'Max history turns to keep',
  })                                                                                      .option('preview-file', {
    alias: 'preview_file',                                                                  type: 'boolean',
    default: false,                                                                         description: 'Preview file content before sending',
  })                                                                                      .option('no-clear', {                                                                     type: 'boolean',                                                                        default: false,                                                                         description: 'Do not clear the console on startup',
  })                                                                                      .option('config-file', {                                                                  alias: 'config_file',                                                                   type: 'string',
    description: 'Path to a JSON configuration file',                                     })                                                                                      .help()
  .alias('help', 'H')                                                                     .alias('help', '?')
  .alias('help', CMD.ALIAS.HELP_Q)                                                        .argv;                                                                                                                                                                        // --- Utility Functions ---
                                                                                        /**
 * Loads configuration from a JSON file.                                                 * @param {string} filePath - Path to the configuration file.                            */
async function loadConfigFromFile(filePath) {                                             if (!filePath) return;                                                                  const resolvedPath = path.resolve(filePath);
  logDebug(`Loading configuration from: ${neon.filePath(resolvedPath)}`);                 try {
    if (!(await checkFileExists(resolvedPath))) {                                             logWarning(`Configuration file not found at ${neon.filePath(resolvedPath)}.`);          return;                                                                               }                                                                                       const configData = await fs.promises.readFile(resolvedPath, 'utf8');
    const config = JSON.parse(configData);                                                                                                                                          // Apply configuration, prioritizing CLI args, then env vars, then file config          // Note: CLI args are already parsed and will take precedence. This is for              // demonstrating how file config could be merged if needed.                             // For simplicity, we'll assume CLI args are the highest priority and                   // file config is a fallback if env vars aren't set.
    // In a real scenario, you'd merge carefully.                                           if (config.model && !argv.model) MODEL_NAME = config.model;
    if (config.temperature && !argv.temperature) currentTemperature = config.temperature;
    if (config.maxTokens && !argv.maxTokens) maxOutputTokens = config.maxTokens;
    if (config.safety && !argv.safety) requestedSafety = config.safety;                     if (config.systemPrompt && !argv.systemPrompt) currentSystemPrompt = config.systemPrompt;                                                                                       if (config.historyFile && !argv.historyFile) HISTORY_FILE = config.historyFile;
    if (config.highlight !== undefined && !argv.highlight && !argv.noHighlight) isHighlightingActive = config.highlight;                                                            if (config.previewFile !== undefined && !argv.previewFile) previewFileContent = config.previewFile;                                                                         
    logDebug('Configuration loaded from file.');                                          } catch (error) {                                                                         logError(`Error loading configuration from ${neon.filePath(resolvedPath)}.`, error);  }
}                                                                                                                                                                               // Loggers                                                                              const logDebug = (message, data = null) =>                                                IS_DEBUG_MODE &&                                                                        console.log(                                                                              neon.debug(`[Debug] ${message}`),                                                       data ? neon.debug(JSON.stringify(data, null, 2)) : '',                                );                                                                                    const logError = (message, error = null) => {
  console.error(neon.errorMarker + neon.error(message));                                  if (error) {
    let details = error.message || String(error);                                           if (IS_DEBUG_MODE && error.stack) details += `\nStack: ${error.stack}`;                 console.error(neon.error(`  > Details: ${details}`));                                 }
};                                                                                      const logWarning = (message) =>
  console.log(neon.warnMarker + neon.warning(message));                                 const logSystem = (message) =>
  console.log(neon.sysMarker + neon.systemInfo(message));                               const logInfo = (message) =>
  console.log(neon.infoMarker + neon.systemInfo(message));
const clearConsole = () =>
  process.stdout.write(
    process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1Bc',                            );                                                                                                                                                                            // File System Utilities
const checkFileExists = async (filePath) => {                                             try {
    await fs.promises.access(filePath, fs.constants.F_OK);                                  return true;
  } catch {
    return false;
  }                                                                                     };                                                                                      const getFileExtension = (filePath) =>                                                    path.extname(filePath).slice(1).toLowerCase();                                        
// --- History Load/Save ---
async function loadChatHistory() {
  if (!HISTORY_FILE) {                                                                      logWarning(                                                                               'History file not configured, history will not be loaded or saved.',
    );
    return;
  }                                                                                       logDebug(`Loading chat history from: ${neon.filePath(HISTORY_FILE)}`);
  try {
    if (!(await checkFileExists(HISTORY_FILE))) {
      logInfo(`No history file found at ${neon.filePath(HISTORY_FILE)}. Starting new chat.`);
      return;
    }
    const historyData = await fs.promises.readFile(HISTORY_FILE, 'utf8');
    if (!historyData.trim()) {
      logDebug(`History file ${neon.filePath(HISTORY_FILE)} is empty.`);
      return;
    }
    chatHistory = JSON.parse(historyData);
    logInfo(
      `Loaded ${neon.commandHelp(chatHistory.length)} chat history entries.`,
    );
  } catch (error) {
    logError(                                                                                 `Error loading chat history from ${neon.filePath(HISTORY_FILE)}. Starting new chat.`,
      error,
    );                                                                                      chatHistory = [];                                                                     }                                                                                     }

async function saveChatHistory() {
  if (!HISTORY_FILE) {                                                                      logDebug('History file path not set, skipping history save.');                          return;                                                                               }
  logDebug(`Saving chat history to: ${neon.filePath(HISTORY_FILE)}`);
  try {
    // Ensure we don't save more than MAX_HISTORY_LENGTH
    const historyToSave = chatHistory.slice(-MAX_HISTORY_LENGTH);                           await fs.promises.writeFile(                                                              HISTORY_FILE,                                                                           JSON.stringify(historyToSave, null, 2),
      'utf8',
    );
    logDebug('Chat history saved successfully.');
  } catch (error) {                                                                         logError('Failed to save chat history.', error);
  }
}                                                                                       
// --- File to Generative Part ---                                                      async function convertFileToGenerativePart(filePath) {
  const resolvedPath = path.resolve(filePath);                                            logDebug(`Processing file for AI: ${resolvedPath}`);
  try {                                                                                     if (!(await checkFileExists(resolvedPath))) {
      logError(`File not found: ${neon.filePath(resolvedPath)}`);
      return null;
    }
    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isFile()) {
      logError(`Path is not a file: ${neon.filePath(resolvedPath)}`);
      return null;                                                                          }                                                                                   
    const fileSizeMB = stats.size / (1024 * 1024);
    // Gemini Pro has a 10MB limit for files, but different models might have different limits.                                                                                     // For simplicity, we'll use a general limit.
    if (fileSizeMB > 10) {
      logWarning(
        `File size (${fileSizeMB.toFixed(2)}MB) exceeds the 10MB limit for Gemini Pro.`,
      );
      return null;
    }                                                                                   
    const fileExtension = getFileExtension(resolvedPath);                                   const mimeType = mime.lookup(resolvedPath) || 'application/octet-stream';
    const fileData = await fs.promises.readFile(resolvedPath);
                                                                                            if (TEXT_EXTENSIONS.has(fileExtension) || mimeType.startsWith('text/')) {
      logDebug(`Treating as text file, MIME type: ${mimeType}, Extension: ${fileExtension}`);
      const textContent = fileData.toString('utf8');                                          return {
        text: `\`\`\`${fileExtension || 'text'}\n${textContent}\n\`\`\``,                     };
    } else if (mimeType.startsWith('image/')) {                                               logDebug(`Treating as image file, MIME type: ${mimeType}`);
      return { inlineData: { mimeType, data: fileData.toString('base64') } };
    } else {
      logWarning(
        `Unsupported file type treated as binary, MIME type: ${mimeType}. Consider converting to text or image.`,
      );
      return {
        inlineData: {
          mimeType: 'application/octet-stream',
          data: fileData.toString('base64'),
        },
      };                                                                                    }
  } catch (error) {
    logError(`Error processing file: ${neon.filePath(resolvedPath)}`, error);
    return null;
  }
}

// --- Help Display with Detailed Messages ---                                          const helpMessages = {
  [CMD.HELP]: 'Display this help message',
  [CMD.EXIT]: 'Exit the chat session',
  [CMD.CLEAR]: 'Clear chat history',
  [CMD.HISTORY]: 'Show chat history',
  [CMD.FILE]:
    'Load a file and optionally provide a prompt: /file <file_path> [prompt_text] or /f',                                                                                         [CMD.LOAD]: 'Alias for /file',
  [CMD.PASTE]: 'Start multi-line paste mode (end with /endpaste or /p)',
  [CMD.END_PASTE]: 'End multi-line paste mode and send content',
  [CMD.TEMP]: 'Set generation temperature (0.0-2.0): /temp <value>',
  [CMD.SAVE]: 'Save next AI response to file: /save <filename>',
  [CMD.MODEL]: 'Display/Switch current model: /model <new_model_name>',
  [CMD.SAFETY]: 'Display current safety setting',
  [CMD.DEBUG]: 'Toggle debug logging',
  [CMD.HIGHLIGHT]: 'Toggle syntax highlighting',
  [CMD.PREVIEW]: 'Toggle file content preview before sending',
  [CMD.SEARCH]: 'Search chat history: /search <query>',
  [CMD.SYS_PROMPT]: 'View/Set system prompt: /sysprompt [new_prompt_text]',
  [CMD.MAX_TOKENS]: 'View/Set max output tokens: /maxtokens <number>',
  [CMD.CONFIG]: 'View current configuration',
};

function displayHelp() {
  logSystem('\n--- Command Help ---');
  Object.entries(helpMessages).forEach(([cmd, desc]) => {
    const aliases = Object.entries(CMD.ALIAS)
      .filter(([, v]) => v === cmd)
      .map(([k]) => `/${k}`)                                                                  .join(', ');
    console.log(
      `${neon.commandHelp(cmd + (aliases ? ` (${aliases})` : ''))}: ${neon.systemInfo(desc)}`,
    );
  });
  logSystem('--------------------\n');
}                                                                                                                                                                               // --- Chat Initialization ---
async function initializeChatSession() {
  if (!API_KEY) {
    logError('GEMINI_API_KEY is missing. Configure via environment variable or --api-key flag.');
    process.exit(1);
  }                                                                                       try {
    logInfo(`Initializing with model: ${neon.filePath(MODEL_NAME)}`);                       const genAI = new GoogleGenerativeAI(API_KEY);

    const safetySettingValue = SAFETY_MAP[requestedSafety];
    if (safetySettingValue === undefined) {
      logWarning(`Unknown safety setting "${requestedSafety}". Using default.`);
      requestedSafety = DEFAULT_SAFETY_SETTING; // Fallback to default if invalid
    }
    const activeSafetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: safetySettingValue },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: safetySettingValue },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: safetySettingValue },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: safetySettingValue },
    ];

    aiModelInstance = genAI.getGenerativeModel({
      model: MODEL_NAME,
      safetySettings: activeSafetySettings,
      systemInstruction: currentSystemPrompt,
    });                                                                                     logInfo(
      `Safety setting: ${neon.filePath(requestedSafety)} (Threshold: ${neon.filePath(safetySettingValue)})`,
    );
    logInfo(`System prompt: "${currentSystemPrompt}"`);
    logInfo(`Max output tokens: ${neon.filePath(maxOutputTokens)}`);

    if (isHighlightingActive) logDebug('Syntax highlighting is enabled.');
    if (previewFileContent) logDebug('File preview mode is enabled.');

    await loadChatHistory();
    currentChatSession = aiModelInstance.startChat({ history: chatHistory });
    logDebug('Chat session initialized.');
  } catch (error) {
    logError('Failed to initialize chat session.', error);
    process.exit(1);
  }
}

// --- Response Processing & Highlighting ---
async function processAndDisplayResponse(responseText) {
  let highlightedResponse = responseText;
  if (isHighlightingActive) {
    // Improved regex to capture language hints and code blocks more robustly
    const codeBlockRegex = /```([\w-]*)\n([\s\S]*?)\n```/g;
    highlightedResponse = responseText.replace(                                               codeBlockRegex,
      (match, languageHint, code) => {
        const lang = languageHint && SUPPORTED_LANGUAGES.has(languageHint.toLowerCase())
          ? languageHint.toLowerCase()
          : 'text'; // Default to text if language not recognized or missing
        try {
          const highlightedCode = highlight(code, { language: lang, ignoreIllegals: true });
          return `${neon.highlightReset()}\`\`\`${lang}\n${highlightedCode}\n\`\`\`${neon.highlightReset()}`;
        } catch (_error) {
          logWarning(
            `Highlighting failed for language '${languageHint}'. Using plain text.`,
          );
          return `${neon.highlightReset()}\`\`\`text\n${code}\n\`\`\`${neon.highlightReset()}`;
        }
      },
    );
  }

  process.stdout.write(neon.aiMarker + neon.aiResponse(highlightedResponse) + '\n');
}                                                                                       
// --- Send Message to AI with Enhanced Highlighting and History Management ---
async function sendMessageToAI(messageParts) {
  if (!currentChatSession) {
    logError('Chat session not initialized. Cannot send message.');
    return;
  }
  if (isAiThinking) {
    logWarning('AI is already processing a request. Please wait.');
    return;
  }
  isAiThinking = true;
  // Overwrite prompt with thinking indicator
  readlineInterface?.write(neon.thinkingIndicator + '\r');

  try {
    const streamResult = await currentChatSession.sendMessageStream(
      messageParts,                                                                           { generationConfig: { temperature: currentTemperature, maxOutputTokens } },
    );                                                                                  
    let aiResponseText = '';                                                                for await (const chunk of streamResult.stream) {
      aiResponseText += chunk.text();
    }

    // Clear the thinking indicator line
    readlineInterface?.clearLine(0);
    readlineInterface?.cursorTo(0);

    await processAndDisplayResponse(aiResponseText);

    // Update history and save
    // Ensure messageParts are correctly formatted for history
    const formattedMessageParts = messageParts.map(part => {
      if (typeof part === 'string') return { text: part };
      return part;
    });
    chatHistory.push({ role: 'user', parts: formattedMessageParts });
    chatHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

    // Trim history if it exceeds the maximum length
    if (chatHistory.length > MAX_HISTORY_LENGTH) {
      chatHistory = chatHistory.slice(-MAX_HISTORY_LENGTH);
      logDebug(`Trimmed history to last ${MAX_HISTORY_LENGTH} entries.`);                   }
    await saveChatHistory();

    lastTextResponse = aiResponseText;                                                      if (saveFilePath) {
      await fs.promises.writeFile(saveFilePath, lastTextResponse, 'utf8');
      logSystem(`AI response saved to ${neon.filePath(saveFilePath)}`);
      saveFilePath = null;
    }
  } catch (apiError) {
    readlineInterface?.clearLine(0);
    readlineInterface?.cursorTo(0);
    logError('Error generating response from AI.', apiError);
  } finally {
    isAiThinking = false;
    readlineInterface?.prompt(); // Re-display prompt
  }
}

// --- Command Handlers ---

const commandHandlers = {
  // Exit commands
  EXIT: async () => readlineInterface?.close(),
  QUIT: async () => readlineInterface?.close(),
  E: async () => readlineInterface?.close(),
  Q: async () => readlineInterface?.close(),

  // Help and Info
  HELP: async () => displayHelp(),
  H: async () => displayHelp(),
  '?': async () => displayHelp(),
  [CMD.ALIAS.HELP_Q]: async () => displayHelp(),

  CONFIG: async () => {
    logSystem('\n--- Current Configuration ---');
    logSystem(`Model: ${neon.filePath(MODEL_NAME)}`);
    logSystem(`Temperature: ${neon.filePath(currentTemperature)}`);
    logSystem(`Max Output Tokens: ${neon.filePath(maxOutputTokens)}`);
    logSystem(`History File: ${neon.filePath(HISTORY_FILE)}`);
    logSystem(`Max History Turns: ${neon.filePath(MAX_HISTORY_LENGTH)}`);
    logSystem(`Safety Setting: ${neon.filePath(requestedSafety)}`);
    logSystem(`System Prompt: "${currentSystemPrompt}"`);                                   logSystem(`Highlighting: ${neon.filePath(isHighlightingActive ? 'Enabled' : 'Disabled')}`);
    logSystem(`File Preview: ${neon.filePath(previewFileContent ? 'Enabled' : 'Disabled')}`);
    logSystem(`Debug Mode: ${neon.filePath(IS_DEBUG_MODE ? 'Enabled' : 'Disabled')}`);
    logSystem('-----------------------------\n');
  },

  // History and State Management
  CLEAR: async () => {
    chatHistory = [];
    await saveChatHistory();
    logSystem('Chat history cleared.');
  },
  C: async () => commandHandlers.CLEAR(),

  HISTORY: async () => {                                                                    logSystem('\n--- Chat History ---');
    if (chatHistory.length === 0) {                                                           console.log(chalk.gray('(Empty history)'));                                           } else {
      chatHistory.forEach((message, index) => {
        const sender = message.role === 'user' ? neon.promptMarker : neon.aiMarker;
        const content = message.parts.length > 0 ? message.parts[0].text : '';                  const displayContent = content.length > 150 ? content.substring(0, 150) + '...' : content;
        console.log(`${sender}Turn ${index + 1}: ${displayContent}`);
      });
    }
    logSystem('--------------------\n');
  },

  // Model and Generation Control
  MODEL: async (newModelName) => {
    if (!newModelName) {
      logSystem(`Current model: ${neon.filePath(MODEL_NAME)}`);
      logWarning(`Usage: ${CMD.MODEL} <new_model_name>`);
      return;
    }
    logInfo(`Switching model to ${neon.filePath(newModelName)}...`);
    try {                                                                                     const genAI = new GoogleGenerativeAI(API_KEY);
      aiModelInstance = genAI.getGenerativeModel({
        model: newModelName,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: SAFETY_MAP[requestedSafety] },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: SAFETY_MAP[requestedSafety] },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: SAFETY_MAP[requestedSafety] },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: SAFETY_MAP[requestedSafety] },
        ],
        systemInstruction: currentSystemPrompt,
      });
      MODEL_NAME = newModelName; // Update global model name
      currentChatSession = aiModelInstance.startChat({ history: [] }); // Start fresh chat
      chatHistory = []; // Clear history for the new model
      await saveChatHistory(); // Save empty history
      logSystem(`Model switched to ${neon.filePath(MODEL_NAME)}. Chat history cleared.`);
    } catch (error) {
      logError(`Failed to switch to model ${neon.filePath(newModelName)}.`, error);
      logWarning('Keeping the current model.');
    }
  },

  TEMP: async (tempValue) => {
    if (!tempValue) {
      logSystem(`Current temperature: ${neon.filePath(currentTemperature)}`);
      logWarning(`Usage: ${CMD.TEMP} <value>`);
      return;
    }
    const temp = parseFloat(tempValue);
    if (isNaN(temp) || temp < 0 || temp > 2) { // Allow up to 2.0
      logWarning('Temperature must be a number between 0.0 and 2.0.');
      return;
    }
    currentTemperature = temp;
    logSystem(`Temperature set to ${neon.filePath(temp)}`);
  },
  T: async (tempValue) => commandHandlers.TEMP(tempValue),

  MAX_TOKENS: async (tokens) => {                                                           if (!tokens) {
      logSystem(`Current max output tokens: ${neon.filePath(maxOutputTokens)}`);              logWarning(`Usage: ${CMD.MAX_TOKENS} <number>`);
      return;
    }                                                                                       const numTokens = parseInt(tokens, 10);
    if (isNaN(numTokens) || numTokens <= 0) {                                                 logWarning('Max output tokens must be a positive number.');                             return;
    }                                                                                       maxOutputTokens = numTokens;
    logSystem(`Max output tokens set to ${neon.filePath(numTokens)}`);
  },                                                                                      MT: async (tokens) => commandHandlers.MAX_TOKENS(tokens),                               MAX_TOKENS_ALIAS: async (tokens) => commandHandlers.MAX_TOKENS(tokens), // For explicit alias handling

  SAFETY: async () => {
    const safetySettingValue = SAFETY_MAP[requestedSafety];
    logSystem(`Current safety setting: ${neon.filePath(requestedSafety)} (Threshold: ${neon.filePath(safetySettingValue)})`);
  },
  S: async () => commandHandlers.SAFETY(), // Alias for safety

  SYS_PROMPT: async (newPrompt) => {                                                        if (!newPrompt) {
      logSystem(`Current system prompt:\n${neon.systemInfo(currentSystemPrompt)}`);
      logWarning(`Usage: ${CMD.SYS_PROMPT} [new_prompt_text]`);                               return;                                                                               }
    currentSystemPrompt = newPrompt;
    // Re-initialize model with the new system prompt
    try {                                                                                     const genAI = new GoogleGenerativeAI(API_KEY);
      const safetySettingValue = SAFETY_MAP[requestedSafety];                                 aiModelInstance = genAI.getGenerativeModel({
        model: MODEL_NAME,                                                                      safetySettings: [                                                                         { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: safetySettingValue },                                                                                             { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: safetySettingValue },                                                                                            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: safetySettingValue },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: safetySettingValue },
        ],
        systemInstruction: currentSystemPrompt,
      });
      currentChatSession = aiModelInstance.startChat({ history: chatHistory }); // Keep history
      logSystem(`System prompt updated.`);                                                  } catch (error) {
      logError('Failed to update system prompt.', error);
      logWarning('Keeping the previous system prompt.');                                    }
  },                                                                                      SP: async (newPrompt) => commandHandlers.SYS_PROMPT(newPrompt),

  // File Operations                                                                      FILE: async (args) => {
    if (!args) {
      logWarning(`Usage: ${CMD.FILE} <file_path> [prompt_text]`);
      return;
    }
    const parts = args.split(' ');
    const filePath = parts[0];
    const promptText = parts.slice(1).join(' ');

    const fileContentPart = await convertFileToGenerativePart(filePath);
    if (!fileContentPart) {
      return; // Error already logged in convertFileToGenerativePart
    }

    if (previewFileContent) {
      logSystem(`\n--- Previewing Content of ${neon.filePath(filePath)} ---`);
      const previewText = fileContentPart.text ? fileContentPart.text : `[${fileContentPart.inlineData.mimeType}]`;
      const truncatedPreview = previewText.substring(0, 500) + (previewText.length > 500 ? '...' : '');
      console.log(truncatedPreview);
      logSystem('-------------------------------------------------');
      const answer = await new Promise(resolve => {
        readlineInterface?.question(neon.warning('Send this file? (Y/n) '), resolve);
      });                                                                                     if (answer.toLowerCase() === 'n') {
        logInfo('File sending cancelled.');
        return;
      }
    }

    const messageToSend = promptText                                                          ? [fileContentPart, { text: promptText }]
      : [fileContentPart];                                                                  await sendMessageToAI(messageToSend);
  },                                                                                      F: async (args) => commandHandlers.FILE(args),
  LOAD: async (args) => commandHandlers.FILE(args),
  L: async (args) => commandHandlers.FILE(args),

  PASTE: async () => {
    isPastingMode = true;                                                                   pasteBufferContent = [];
    logInfo('Paste mode ON. Type /endpaste or /p to send.');
    readlineInterface?.setPrompt(neon.pasteMarker);
    readlineInterface?.prompt();
  },
  P: async () => commandHandlers.PASTE(),

  END_PASTE: async () => {                                                                  if (!isPastingMode) {
      logWarning('Not in paste mode.');
      return;
    }
    isPastingMode = false;
    await sendMessageToAI([{ text: pasteBufferContent.join('\n') }]);
    pasteBufferContent = [];
    logInfo('Pasted content sent.');
    readlineInterface?.setPrompt(neon.promptMarker);                                        readlineInterface?.prompt();
  },
                                                                                          SAVE: async (filename) => {
    if (!filename) {
      logWarning(`Usage: ${CMD.SAVE} <filename>`);                                            return;
    }
    saveFilePath = path.resolve(filename);
    if (fs.existsSync(saveFilePath)) {
      logWarning(
        `File ${neon.filePath(saveFilePath)} already exists and will be overwritten.`,
      );
    }
    logSystem(
      `Next AI response will be saved to: ${neon.filePath(saveFilePath)}`,                  );
  },
  S: async (filename) => commandHandlers.SAVE(filename),

  // Toggles
  DEBUG: async () => {                                                                      IS_DEBUG_MODE = !IS_DEBUG_MODE;                                                         logSystem(
      `Debug mode ${IS_DEBUG_MODE ? neon.commandHelp('enabled') : neon.warning('disabled')}`,
    );
  },

  HIGHLIGHT: async () => {
    isHighlightingActive = !isHighlightingActive;
    logSystem(
      `Syntax highlighting ${isHighlightingActive ? neon.commandHelp('enabled') : neon.warning('disabled')}`,
    );
  },

  PREVIEW: async () => {                                                                    previewFileContent = !previewFileContent;
    logSystem(
      `File preview ${previewFileContent ? neon.commandHelp('enabled') : neon.warning('disabled')}`,
    );
  },

  // Search                                                                               SEARCH: async (query) => {
    if (!query) {
      logWarning(`Usage: ${CMD.SEARCH} <query>`);
      return;
    }
    const lowerCaseQuery = query.toLowerCase();
    const results = chatHistory.filter((message) =>
      message.parts.some((part) =>                                                              part.text.toLowerCase().includes(lowerCaseQuery),
      ),
    );
    logSystem(`\n--- Search Results for "${query}" (${results.length} found) ---`);
    if (results.length === 0) {
      console.log(chalk.gray('(No matches found)'));
    } else {
      results.forEach((message) => {                                                            const sender = message.role === 'user' ? neon.promptMarker : neon.aiMarker;
        const content = message.parts.length > 0 ? message.parts[0].text : '';
        const displayContent = content.length > 150 ? content.substring(0, 150) + '...' : content;
        // Highlight search query in results
        const highlightedContent = displayContent.replace(
          new RegExp(`(${query})`, 'gi'),
          (match) => chalk.yellow.bold(match),                                                  );
        console.log(
          `${sender}Turn ${chatHistory.indexOf(message) + 1}: ${highlightedContent}`,
        );
      });
    }
    logSystem('--------------------\n');
  },
};

// --- Readline Setup with Auto-Completion ---
function completer(line) {
  const input = line.trim();
  const commandList = Object.values(CMD)
    .filter((cmd) => typeof cmd === 'string' && cmd.startsWith(CMD.PREFIX))
    .concat(Object.values(CMD.ALIAS).filter((alias) => typeof alias === 'string' && alias.startsWith(CMD.PREFIX)));

  const commandTokens = input.split(' ');
  const currentCommandPrefix = commandTokens[0];
  const currentArgPrefix = commandTokens.length > 1 ? commandTokens[commandTokens.length - 1] : '';

  if (currentCommandPrefix.startsWith(CMD.PREFIX)) {
    const commandName = currentCommandPrefix.slice(1);
                                                                                            // Handle file path completion
    if (
      (commandName === 'file' || commandName === 'f' || commandName === 'load' || commandName === 'l') &&
      commandTokens.length > 1
    ) {
      const dirPath = currentArgPrefix.includes('/') ? path.dirname(currentArgPrefix) || '.' : '.';                                                                                   const fileNamePrefix = currentArgPrefix.includes('/') ? path.basename(currentArgPrefix) : currentArgPrefix;

      try {
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath)
            .filter(f => f.startsWith(fileNamePrefix))
            .map(f => path.join(dirPath, f).replace(/\\/g, '/')); // Normalize paths

          // If only one file matches and it's a directory, append '/'
          if (files.length === 1 && fs.statSync(path.join(dirPath, files[0])).isDirectory()) {
            return [[`${currentCommandPrefix} ${files[0]}/`], input];
          }
          return [[`${currentCommandPrefix} ${files.join(' ')}`], input];
        }
      } catch (e) {
        logDebug(`Completion error for path ${dirPath}: ${e.message}`);
        // Fallback to command completion if file system access fails
      }
    }                                                                                   
    // General command completion
    const hits = commandList.filter(c => c.startsWith(input));
    return [hits.length ? hits : commandList, input];
  }
  return [[], input]; // No completion for non-command input
}

async function setupReadlineInterface() {
  readlineInterface = readline.createInterface({                                            input: process.stdin,
    output: process.stdout,                                                                 prompt: neon.promptMarker,
    completer,
    historySize: 1000,
  });

  const updatePrompt = () => {                                                              readlineInterface?.setPrompt(
      isPastingMode ? neon.pasteMarker : neon.promptMarker,
    );
    readlineInterface?.prompt();
  };

  readlineInterface
    .on('line', async (line) => {                                                             const input = line.trim();

      if (isPastingMode) {                                                                      if (input === CMD.END_PASTE || input === CMD.ALIAS.P) { // Handle alias for end paste                                                                                             await commandHandlers.END_PASTE();
        } else {
          pasteBufferContent.push(input);                                                       }
        updatePrompt();
        return;
      }                                                                                 
      if (input.startsWith(CMD.PREFIX)) {
        const [command, ...argsArray] = input.slice(1).split(' ');
        const args = argsArray.join(' ');

        // Handle command aliases mapping
        let actualCommand = command;
        let handler = commandHandlers[command.toUpperCase()]; // Check direct command first
        if (!handler) {
          for (const [aliasKey, aliasValue] of Object.entries(CMD.ALIAS)) {
            if (aliasValue.slice(1) === command) {
              actualCommand = aliasKey; // Use the key name for lookup
              handler = commandHandlers[actualCommand] || commandHandlers[actualCommand.toUpperCase()];
              break;                                                                                }
          }                                                                                     }

        if (handler) {
          try {
            await handler(args);
          } catch (err) {
            logError(`Error executing command ${CMD.PREFIX}${command}`, err);
          }
        } else {
          logWarning(`Unknown command: ${command}. Type /help for commands.`);
        }
      } else if (input) {
        await sendMessageToAI([{ text: input }]);
      }
      updatePrompt();
    })
    .on('close', async () => {
      logInfo('Chat session ended. Saving history...');
      await saveChatHistory();
      console.log(neon.magenta.bold('Goodbye!'));
      process.exit(0);
    })                                                                                      .on('SIGINT', () => {
      if (isPastingMode) {
        isPastingMode = false;
        pasteBufferContent = [];
        readlineInterface?.clearLine(0);
        readlineInterface?.cursorTo(0);
        logWarning('Paste mode cancelled.');
        updatePrompt();
      } else if (isAiThinking) {                                                                logWarning('AI is processing. Please wait. (Ctrl+C again to force quit)');
      } else {
        readlineInterface?.question(                                                              neon.warning('Exit session? (y/N) '),
          (answer) => {
            if (answer.match(/^y(es)?$/i)) {
              readlineInterface?.close();
            } else {
              updatePrompt();
            }                                                                                     },
        );                                                                                    }
    });                                                                                 
  displayHelp();
  updatePrompt();
}

// --- Main Execution ---                                                               async function main() {
  if (!argv.noClear) {
    clearConsole();                                                                       }
  logSystem('--- Gemini AI Chat Client ---');

  // Load config from file first, then apply CLI args
  await loadConfigFromFile(argv.configFile);

  // Apply CLI arguments, overriding file/env config                                      MODEL_NAME = argv.model || MODEL_NAME;
  currentTemperature = argv.temperature;
  maxOutputTokens = argv.maxTokens;
  HISTORY_FILE = argv.historyFile || HISTORY_FILE;
  requestedSafety = argv.safety; // Already uppercased by yargs
  currentSystemPrompt = argv.systemPrompt || currentSystemPrompt;                         IS_DEBUG_MODE = argv.debug;
  isHighlightingActive = !argv.noHighlight && argv.highlight; // Prioritize --no-highlight
  previewFileContent = argv.previewFile;
  MAX_HISTORY_LENGTH = argv.maxHistory;

  await initializeChatSession();
  await setupReadlineInterface();
}

// --- Run the Main Function ---
main().catch((error) => logError('Fatal error during execution.', error));