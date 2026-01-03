/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from '../../core/contentGenerator.js';
import { BrowserTools } from './browserTools.js';
import { BrowserManager } from './browserManager.js';
import {
  type Content,
  type Part,
  type Tool,
  type FunctionCall,
  Type,
  Environment,
} from '@google/genai';
import { GeminiChat, StreamEventType } from '../../core/geminiChat.js';
import { parseThought } from '../../utils/thoughtUtils.js';
import type { Config } from '../../config/config.js';

import * as os from 'node:os';

import { BrowserLogger } from './browserLogger.js';
import { debugLogger } from '../../utils/debugLogger.js';

// Semantic Tools (Orchestrator)
// Tools use `uid` from the accessibility tree snapshot, not CSS selectors
const semanticTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'navigate',
        description: 'Navigates the browser to a specific URL.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: 'The URL to visit' },
          },
          required: ['url'],
        },
      },
      {
        name: 'click',
        description:
          'Click on an element using its uid from the accessibility tree snapshot.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            uid: {
              type: Type.STRING,
              description:
                'The uid of the element from the accessibility tree (e.g., "87_4" for a button)',
            },
            dblClick: {
              type: Type.BOOLEAN,
              description: 'Set to true for double clicks. Default is false.',
            },
          },
          required: ['uid'],
        },
      },
      {
        name: 'hover',
        description: 'Hover over the provided element.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            uid: {
              type: Type.STRING,
              description:
                'The uid of the element from the accessibility tree (e.g., "87_4" for a button)',
            },
          },
          required: ['uid'],
        },
      },
      {
        name: 'fill',
        description:
          'Type text into a input, text area or select an option from a <select> element.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            uid: {
              type: Type.STRING,
              description: 'The uid of the element (input/select)',
            },
            value: {
              type: Type.STRING,
              description: 'The value to fill in',
            },
          },
          required: ['uid', 'value'],
        },
      },
      {
        name: 'fill_form',
        description: 'Fill out multiple form elements at once.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            elements: {
              type: Type.ARRAY,
              description: 'Elements from snapshot to fill out.',
              items: {
                type: Type.OBJECT,
                properties: {
                  uid: {
                    type: Type.STRING,
                    description: 'The uid of the element to fill out',
                  },
                  value: {
                    type: Type.STRING,
                    description: 'Value for the element',
                  },
                },
                required: ['uid', 'value'],
              },
            },
          },
          required: ['elements'],
        },
      },
      {
        name: 'upload_file',
        description: 'Upload a file through a provided element.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            uid: {
              type: Type.STRING,
              description:
                'The uid of the file input element or an element that will open file chooser',
            },
            filePath: {
              type: Type.STRING,
              description: 'The local path of the file to upload',
            },
          },
          required: ['uid', 'filePath'],
        },
      },
      {
        name: 'get_element_text',
        description:
          'Get the text content of an element using its uid from the accessibility tree.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            uid: {
              type: Type.STRING,
              description: 'The uid of the element from the accessibility tree',
            },
          },
          required: ['uid'],
        },
      },
      {
        name: 'scroll_document',
        description: 'Scroll the document.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            direction: {
              type: Type.STRING,
              enum: ['up', 'down', 'left', 'right'],
            },
            amount: { type: Type.NUMBER, description: 'Pixels to scroll' },
          },
          required: ['direction', 'amount'],
        },
      },
      {
        name: 'pagedown',
        description: 'Scroll down by one page height.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'pageup',
        description: 'Scroll up by one page height.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'take_snapshot',
        description:
          'Returns a text snapshot of the page accessibility tree. Use this to read the page content semantically.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            verbose: {
              type: Type.BOOLEAN,
              description: 'Whether to include full details',
            },
          },
        },
      },
      {
        name: 'wait_for',
        description:
          'Waits for specific text to appear on the page. Use this after actions that trigger loading.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: 'The text to wait for' },
          },
          required: ['text'],
        },
      },
      {
        name: 'handle_dialog',
        description:
          'Handles a native browser dialog (alert, confirm, prompt).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ['accept', 'dismiss'] },
            promptText: { type: Type.STRING },
          },
          required: ['action'],
        },
      },
      {
        name: 'evaluate_script',
        description:
          'Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON so returned values have to JSON-serializable.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            function: {
              type: Type.STRING,
              description:
                'A JavaScript function declaration to be executed by the tool in the currently selected page. Example without arguments: `() => { return document.title }` or `async () => { return await fetch("example.com") }`. Example with arguments: `(el) => { return el.innerText; }`',
            },
            args: {
              type: Type.ARRAY,
              description:
                'An optional list of arguments to pass to the function.',
              items: {
                type: Type.OBJECT,
                properties: {
                  uid: {
                    type: Type.STRING,
                    description:
                      'The uid of an element on the page from the page content snapshot',
                  },
                },
              },
            },
          },
          required: ['function'],
        },
      },
      {
        name: 'press_key',
        description:
          'Press a key or key combination (e.g., "Enter", "Control+A").',
        parameters: {
          type: Type.OBJECT,
          properties: {
            key: { type: Type.STRING, description: 'The key to press' },
          },
          required: ['key'],
        },
      },
      {
        name: 'open_web_browser',
        description: 'Opens the web browser if not already open.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'complete_task',
        description:
          "Call this when you have completely fulfilled the user's request. You MUST call this to exit the agent loop.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'A brief summary of what was accomplished',
            },
          },
          required: ['summary'],
        },
      },
      {
        name: 'delegate_to_visual_agent',
        description:
          'Delegate a task that requires visual interaction (coordinate-based clicks, complex drag-and-drop) OR visual identification (finding elements by color, layout, or visual appearance not in the AX tree).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            instruction: {
              type: Type.STRING,
              description:
                'Clear instruction for the visual agent (e.g., "Click the blue submit button", "Find the yellow letter").',
            },
          },
          required: ['instruction'],
        },
      },
    ],
  },
];

// Visual Tools (Delegate)
// The Computer Use model requires the computerUse tool to be specified.
const visualTools: Tool[] = [
  // Built-in Computer Use tool - required for the Computer Use model
  // This automatically provides: click_at, type_text_at, drag_and_drop, scroll_document, key_combination, etc.
  // We exclude navigation tools since the semantic agent handles those
  {
    computerUse: {
      environment: Environment.ENVIRONMENT_BROWSER,
      excludedPredefinedFunctions: ['open_web_browser', 'search', 'navigate'],
    },
  },
];

/**
 * Analyzes accessibility tree snapshot for common overlay patterns.
 * Returns hints about detected overlays and suggested close buttons.
 */
function detectBlockingOverlays(snapshot: string): {
  hasOverlay: boolean;
  overlayInfo: string;
  suggestedAction: string;
} {
  const lines = snapshot.split('\n');
  const overlayRoles = ['dialog', 'alertdialog', 'tooltip'];
  const closeButtonPatterns = [
    'close',
    'dismiss',
    'got it',
    'no thanks',
    'accept',
    'ok',
    '×',
    'x button',
    'cancel',
  ];

  const overlayElements: string[] = [];
  const closeButtons: Array<{ uid: string; text: string }> = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Detect overlay roles
    for (const role of overlayRoles) {
      if (
        lowerLine.includes(`role="${role}"`) ||
        lowerLine.includes(` ${role} `)
      ) {
        overlayElements.push(line.trim());
        break;
      }
    }

    // Look for aria-modal
    if (lowerLine.includes('aria-modal="true"')) {
      overlayElements.push(line.trim());
    }

    // Look for close buttons
    const uidMatch = line.match(/uid=(\S+)/);
    if (uidMatch) {
      for (const closeText of closeButtonPatterns) {
        if (
          lowerLine.includes(closeText) &&
          (lowerLine.includes('button') || lowerLine.includes('link'))
        ) {
          closeButtons.push({ uid: uidMatch[1], text: line.trim() });
          break;
        }
      }
    }
  }

  const hasOverlay = overlayElements.length > 0;

  return {
    hasOverlay,
    overlayInfo:
      overlayElements.length > 0
        ? `Detected overlay elements:\n${overlayElements.slice(0, 3).join('\n')}`
        : '',
    suggestedAction:
      closeButtons.length > 0
        ? `Found potential close buttons: ${closeButtons.map((b) => `uid=${b.uid}`).join(', ')}`
        : '',
  };
}
export class BrowserAgent {
  private logger: BrowserLogger;
  private browserManager: BrowserManager;
  private browserTools: BrowserTools;

  constructor(
    private generator: ContentGenerator,
    private config: Config,
    tempDir: string = os.tmpdir(),
  ) {
    this.logger = new BrowserLogger(tempDir);
    this.browserManager = new BrowserManager(config);
    this.browserTools = new BrowserTools(this.browserManager);
  }

  async runTask(
    prompt: string,
    signal: AbortSignal,
    printOutput?: (message: string) => void,
  ) {
    // Use the main CLI model unless explicitly overridden in browser agent settings
    const model =
      this.config.browserAgentSettings?.model ?? this.config.getActiveModel();

    const systemInstruction = `You are an expert browser automation agent (Orchestrator). Your goal is to completely fulfill the user's request.

IMPORTANT: You will receive an accessibility tree snapshot showing elements with uid values (e.g., uid=87_4 button "Login"). 
Use these uid values directly with your tools:
- click(uid="87_4") to click the Login button
- fill(uid="87_2", value="john") to fill a text field
- fill_form(elements=[{uid: "87_2", value: "john"}, {uid: "87_3", value: "pass"}]) to fill multiple fields at once

PARALLEL TOOL CALLS - CRITICAL:
- Do NOT make parallel calls for actions that change page state (click, fill, press_key, etc.)
- Each action changes the DOM and invalidates UIDs from the current snapshot
- Make state-changing actions ONE AT A TIME, then observe the results
- For typing text, prefer press_key with the characters instead of clicking on-screen keyboard buttons

OVERLAY/POPUP HANDLING:
Before interacting with page content, scan the accessibility tree for blocking overlays:
- Tooltips, popups, modals, cookie banners, newsletter prompts, promo dialogs
- These often have: close buttons (×, X, Close, Dismiss), "Got it", "Accept", "No thanks" buttons
- Common patterns: elements with role="dialog", role="tooltip", role="alertdialog", or aria-modal="true"
- If you see such elements, DISMISS THEM FIRST by clicking close/dismiss buttons before proceeding
- If a click seems to have no effect, check if an overlay appeared or is blocking the target

For complex visual interactions (coordinate-based clicks, dragging) OR when you need to identify elements by visual attributes not present in the AX tree (e.g., "click the yellow button", "find the red error message"), use delegate_to_visual_agent with a clear instruction.

CRITICAL: When you have fully completed the user's task, you MUST call the complete_task tool with a summary of what you accomplished. Do NOT just return text - you must explicitly call complete_task to exit the loop.`;

    // Initialize GeminiChat
    const chat = new GeminiChat(this.config, systemInstruction, semanticTools);

    const MAX_ITERATIONS = 20;

    // Consolidated logging: System stuff goes to debugLogger, User stuff goes to printOutput
    let status = 'Connecting to browser...';
    debugLogger.log(status);

    try {
      // Ensure browser connection
      await this.browserManager.ensureConnection();

      // Initialize persistent overlay
      await this.browserTools.updateBorderOverlay({
        active: true,
        capturing: false,
      });

      status = 'Browser connected. Starting task loop...';
      debugLogger.log(status);
    } catch (e) {
      const msg = `Error: Failed to connect to browser: ${e instanceof Error ? e.message : String(e)}`;
      debugLogger.log(msg);
      if (printOutput) printOutput(msg); // Fatal error should be shown
      return msg;
    }

    await this.browserTools.updateBorderOverlay({
      active: true,
      capturing: false,
    });

    // The current input to send to the model (User message parts)
    let currentInputParts: Part[] = [{ text: `Task: ${prompt}` }];
    let iterationCount = 0;
    let taskCompleted = false; // Track if complete_task was called
    let taskSummary = ''; // Store the summary from complete_task

    // Take initial snapshot and include it with the first message
    try {
      const client = await this.browserManager.getMcpClient();
      const snapResult = await client.callTool('take_snapshot', {
        verbose: false,
      });
      const snapContent = snapResult.content;
      if (snapContent && Array.isArray(snapContent)) {
        const initialSnapshot = snapContent
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((p: any) => p.type === 'text')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => p.text || '')
          .join('');
        if (initialSnapshot) {
          // Check for blocking overlays on initial load
          const overlayCheck = detectBlockingOverlays(initialSnapshot);
          if (overlayCheck.hasOverlay) {
            debugLogger.log(
              `Overlay detected on initial load: ${overlayCheck.overlayInfo}`,
            );
            currentInputParts.push({
              text: `⚠️ BLOCKING OVERLAY DETECTED: ${overlayCheck.overlayInfo}\n${overlayCheck.suggestedAction}\nPlease dismiss this overlay before proceeding.`,
            });
          }
          currentInputParts.push({
            text: `<accessibility_tree>\n${initialSnapshot}\n</accessibility_tree>`,
          });
        }
      }
    } catch (e) {
      debugLogger.log(`Warning: Failed to capture initial snapshot: ${e}`);
    }

    while (iterationCount < MAX_ITERATIONS) {
      // Check for abort (following local-executor pattern)
      if (signal.aborted) {
        if (printOutput) printOutput('⚠️  Browser task cancelled');
        debugLogger.log('Task cancelled by user');
        break;
      }

      // The model manages its own state via take_snapshot tool.
      // currentInputParts contains either the initial prompt+snapshot, or function responses from the previous turn.
      const messageParts = [...currentInputParts];

      // Prepare for Model Call
      status = `[Turn ${iterationCount + 1}/${MAX_ITERATIONS}] Calling model (${messageParts.length} parts)...`;
      debugLogger.log(status);

      // Call Model with Streaming
      const functionCalls: FunctionCall[] = [];
      let _textResponse = '';
      const promptId = `browser-agent-${Date.now()}`;

      try {
        const stream = await chat.sendMessageStream(
          {
            // We construct the model config key dynamically
            model,
          },
          messageParts,
          promptId,
          signal,
        );

        for await (const event of stream) {
          // Check for cancellation during streaming
          if (signal.aborted) {
            debugLogger.log('Task cancelled during model streaming');
            break;
          }

          if (event.type === StreamEventType.CHUNK) {
            const chunk = event.value;
            const parts = chunk.candidates?.[0]?.content?.parts;

            // Parse Thoughts
            const thoughtPart = parts?.find((p) => p.thought);
            if (thoughtPart) {
              const { subject } = parseThought(thoughtPart.text || '');
              if (subject && printOutput) {
                printOutput(`💭 ${subject}`);
              }
            }

            // Collect text (non-thought)
            const text =
              parts
                ?.filter((p) => !p.thought && p.text)
                .map((p) => p.text)
                .join('') || '';
            if (text) _textResponse += text;

            // Collect Function Calls
            if (chunk.functionCalls) {
              functionCalls.push(...chunk.functionCalls);
              if (printOutput) {
                for (const call of chunk.functionCalls) {
                  if (call.name === 'delegate_to_visual_agent') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const instruction = (call.args as any)?.instruction;
                    if (instruction) {
                      printOutput(`🤖 Visual Agent: ${instruction}`);
                      continue;
                    }
                  }
                  printOutput(`🔧 Generating tool call: ${call.name}...`);
                }
              }
            }
          }
        }

        // Check if cancelled after streaming
        if (signal.aborted) {
          if (printOutput) printOutput('⚠️  Browser task cancelled');
          debugLogger.log('Task cancelled after model call');
          break;
        }
      } catch (e) {
        const msg = `Error calling model: ${e instanceof Error ? e.message : String(e)}`;
        if (msg.includes('Model stream ended with empty response text')) {
          debugLogger.log(
            'Warning: Caught empty stream error from model. Continuing...',
          );
          // We return, which means the textResponse will be empty, and functionCalls empty.
          // The subsequent check "if (!textResponse && functionCalls.length === 0)"
          // will catch this and handle it gracefully.
        }

        debugLogger.log(msg);
        if (printOutput) printOutput(msg);
        return msg;
      }

      // Update logs with full turn
      const fullHistory = chat.getHistory();
      // fullHistory = [User, Model, User, Model...]
      // partial history is not what we want. We want the latest turn.
      // Usually: Last item is Model Response. Item before that is User Prompt.
      if (fullHistory.length >= 2) {
        const lastModelMessage = fullHistory[fullHistory.length - 1];
        const lastUserMessage = fullHistory[fullHistory.length - 2];

        if (lastModelMessage && lastUserMessage) {
          // Log summary
          void this.logger.logSummary(lastModelMessage);
          // Log full turn (including prompt)
          void this.logger.logFullTurn([lastUserMessage], lastModelMessage);
        }
      }

      // Execute Tools
      if (functionCalls.length > 0) {
        currentInputParts = []; // Reset input parts for the next turn (will hold tool outputs)

        for (const call of functionCalls) {
          // Check if cancelled before each tool execution
          if (signal.aborted) {
            if (printOutput) printOutput('⚠️  Browser task cancelled');
            debugLogger.log('Task cancelled before tool execution');
            break;
          }

          const fnName = call.name;
          const fnArgs = call.args || {};

          if (!fnName) {
            debugLogger.log('❌ Warning: Received function call without name');
            if (printOutput)
              printOutput('❌ Warning: Received function call without name');
            continue;
          }

          if (printOutput)
            printOutput(`🔧 Executing ${fnName}(${JSON.stringify(fnArgs)})`);

          // Helper to process tool response and extract snapshot
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const processToolResponse = (responseContent: any[]) => {
            let textOutput = '';
            let foundSnapshot = '';

            for (const item of responseContent) {
              if (item.type === 'text' && item.text) {
                if (item.text.includes('## Latest page snapshot')) {
                  const parts = item.text.split('## Latest page snapshot');
                  if (parts[0].trim()) textOutput += parts[0].trim() + '\n';
                  if (parts[1]) foundSnapshot = parts[1].trim();
                  // Attempt to grab lines starting with uid= from the snapshot part or the whole thing
                  // The MCP output format is usually:
                  // ... text ...
                  // ## Latest page snapshot
                  // uid=...
                  // uid=...
                } else if (item.text.includes('uid=')) {
                  foundSnapshot += item.text;
                } else {
                  textOutput += item.text;
                }
              } else if (item.type === 'resource') {
                textOutput += `[Resource: ${item.resource.uri}]\n`;
              }
            }
            return { text: textOutput.trim(), snapshot: foundSnapshot.trim() };
          };

          let functionResponse;
          try {
            const client = await this.browserManager.getMcpClient();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let rawContent: any[] = [];

            switch (fnName) {
              case 'navigate':
                rawContent =
                  (
                    await client.callTool(
                      'navigate_page',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'click':
                rawContent =
                  (
                    await client.callTool(
                      'click',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'hover':
                rawContent =
                  (
                    await client.callTool(
                      'hover',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'fill':
                rawContent =
                  (
                    await client.callTool(
                      'fill',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'fill_form':
                rawContent =
                  (
                    await client.callTool(
                      'fill_form',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'upload_file':
                rawContent =
                  (
                    await client.callTool(
                      'upload_file',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'get_element_text':
                rawContent =
                  (
                    await client.callTool(
                      'get_element_text',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'wait_for':
                rawContent =
                  (
                    await client.callTool(
                      'wait_for',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'handle_dialog':
                rawContent =
                  (
                    await client.callTool(
                      'handle_dialog',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'evaluate_script':
                rawContent =
                  (
                    await client.callTool(
                      'evaluate_script',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'press_key':
                rawContent =
                  (
                    await client.callTool(
                      'press_key',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;
              case 'drag':
                rawContent =
                  (
                    await client.callTool(
                      'drag',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;

              case 'close_page':
                rawContent =
                  (
                    await client.callTool(
                      'close_page',
                      fnArgs as unknown as Record<string, unknown>,
                    )
                  ).content || [];
                break;

              case 'take_snapshot': {
                const snapRes = await this.browserTools.takeSnapshot(
                  (fnArgs['verbose'] as boolean) ?? false,
                );
                // Return the actual snapshot so the model can use it
                functionResponse = snapRes.output || snapRes.error || '';
                break;
              }

              case 'complete_task': {
                taskCompleted = true;
                const summary =
                  (fnArgs['summary'] as string) || 'Task completed';
                taskSummary = summary; // Store summary to return
                functionResponse = summary;
                if (printOutput) printOutput(`✅ ${summary}`);
                break;
              }

              case 'delegate_to_visual_agent': {
                const screen = await this.captureScreenshot();
                const visualRes = await this.runVisualDelegate(
                  (fnArgs['instruction'] as string) || '',
                  screen,
                  printOutput || (() => {}),
                );
                functionResponse = visualRes;
                break;
              }

              case 'scroll_document': {
                const res = await this.browserTools.scrollDocument(
                  fnArgs['direction'] as 'up' | 'down' | 'left' | 'right',
                  fnArgs['amount'] as number,
                );
                functionResponse = res.output || res.error || '';
                break;
              }

              case 'pagedown': {
                const res = await this.browserTools.pagedown();
                functionResponse = res.output || res.error || '';
                break;
              }

              case 'pageup': {
                const res = await this.browserTools.pageup();
                functionResponse = res.output || res.error || '';
                break;
              }

              case 'open_web_browser': {
                const res = await this.browserTools.openWebBrowser();
                functionResponse = res.output || res.error || '';
                break;
              }

              default:
                // Handle legacy visual tools or unknown tools
                functionResponse = `Error: Tool ${fnName} not recognized or supported directly.`;
            }

            // Post-process for Semantic Tools - extract text from MCP response
            if (
              [
                'navigate',
                'click',
                'hover',
                'fill',
                'fill_form',
                'get_element_text',
                'wait_for',
                'handle_dialog',
                'press_key',
                'drag',
                'close_page',
              ].includes(fnName)
            ) {
              // Extract text response, strip any embedded snapshots (model can call take_snapshot if needed)
              const processed = processToolResponse(rawContent);
              functionResponse = processed.text;
            } else if (!functionResponse && rawContent.length > 0) {
              // Fallback for tools that populated rawContent but weren't in the semantic list
              functionResponse = rawContent
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((p: any) => p.text || '')
                .join('\n');
            }
          } catch (error) {
            functionResponse = `Error executing ${fnName}: ${error instanceof Error ? error.message : String(error)}`;
          }

          // Check for click blocked by overlay
          if (
            typeof functionResponse === 'string' &&
            (functionResponse.includes('not interactable') ||
              functionResponse.includes('obscured') ||
              functionResponse.includes('intercept') ||
              functionResponse.includes('blocked'))
          ) {
            debugLogger.log(`⚠️ Click may have been blocked by overlay`);
            functionResponse +=
              '\n\n⚠️ This action may have been blocked by an overlay, popup, or tooltip. Look for close/dismiss buttons in the accessibility tree and click them first.';
          }

          currentInputParts.push({
            functionResponse: {
              name: fnName,
              response: {
                content: [{ type: 'text', text: functionResponse }],
              },
            },
          });
        }

        // Check if task was completed after executing tools
        if (taskCompleted) {
          status = 'Task completed successfully.';
          debugLogger.log(status);
          break;
        }
      } else {
        // No function calls - protocol violation (agent should call complete_task or tools)
        debugLogger.log(
          'Warning: Model stopped calling tools without calling complete_task',
        );
        if (printOutput) {
          printOutput(
            '⚠️  Agent stopped without calling complete_task. Prompting to complete...',
          );
        }

        // Give one more chance to call complete_task
        currentInputParts = [
          {
            text: 'You must call the complete_task tool to finish. If the task is done, call complete_task with a summary. If you cannot complete the task, call complete_task explaining why.',
          },
        ];
      }

      iterationCount++;
    }

    status = 'Task loop finished.';
    debugLogger.log(status);
    return taskSummary || 'Task finished';
  }
  private async runVisualDelegate(
    instruction: string,
    initialScreenshot: string,
    printOutput?: (message: string) => void,
  ): Promise<{ output: string }> {
    const visualModel =
      this.config.browserAgentSettings?.visualModel ??
      'gemini-2.5-computer-use-preview-10-2025';

    // Visual Agent Loop
    const VISUAL_MAX_STEPS = 5;
    const contents: Content[] = [];
    const actionHistory: string[] = [];

    // System instruction for Visual Agent
    const systemInstruction = `You are a Visual Delegate Agent. You have been delegated a specific task: "${instruction}".

IMPORTANT: The browser is ALREADY OPEN and navigated to the correct page. You are looking at a screenshot of the current page state. Do NOT attempt to open a browser, navigate, or search - those actions are handled by the orchestrator.

Your role is to perform visual interactions on the CURRENT page using these tools:
- click_at(x, y) - Click at coordinates
- type_text_at(x, y, text) - Type text at coordinates  
- drag_and_drop(x, y, dest_x, dest_y) - Drag between coordinates
- scroll_document(direction) - Scroll to find elements

If the element is not visible, use scroll_document to find it.
Return a concise summary of your actions when done.
`;
    // We add the instruction and the initial screenshot
    const initialParts: Part[] = [{ text: systemInstruction }];
    if (initialScreenshot) {
      initialParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: initialScreenshot,
        },
      });
    }

    contents.push({ role: 'user', parts: initialParts });

    for (let i = 0; i < VISUAL_MAX_STEPS; i++) {
      const result = await this.generator.generateContent(
        {
          model: visualModel,
          contents,
          config: {
            tools: visualTools,
          },
        },
        'browser-agent-visual-delegate',
      );

      const response = result.candidates?.[0]?.content;
      if (!response) break;

      // Log visual agent thinking and actions
      if (printOutput) {
        const visualLogParts: string[] = [];
        const textResponse =
          response.parts
            ?.filter((p) => p.text)
            .map((p) => p.text)
            .join('') || '';
        if (textResponse) {
          visualLogParts.push(`  💭 ${textResponse}`);
        }

        const vFunctionCalls =
          response.parts?.filter((p) => 'functionCall' in p) || [];
        if (vFunctionCalls.length > 0) {
          const toolInfo = vFunctionCalls
            .map((p) => {
              const call = p.functionCall!;
              const argsStr = call.args
                ? Object.entries(call.args)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')
                : '';
              return `  🔧 ${call.name}(${argsStr})`;
            })
            .join('\n');
          visualLogParts.push(
            `[Visual Turn ${i + 1}/${VISUAL_MAX_STEPS}]\n${toolInfo}`,
          );
        }

        if (visualLogParts.length > 0) {
          printOutput(visualLogParts.join('\n'));
        }
      }
      contents.push(response);

      const functionCalls =
        response.parts?.filter((p) => 'functionCall' in p) || [];
      if (functionCalls.length === 0) {
        // Ideally the model explains what it did.
        const text = response.parts?.map((p) => p.text).join('') || 'Done';

        // Invalidate MCP cache to prevent stale UIDs
        try {
          const client = await this.browserManager.getMcpClient();
          await client.callTool('evaluate_script', {
            function: '() => { return true; }',
          });
        } catch (_e) {
          /* ignore */
        }

        return {
          output: `Visual Agent Completed.\nFinal Message: ${text}\nActions Taken:\n${actionHistory.join('\n')}`,
        };
      }

      const functionResponses: Part[] = [];

      for (const part of functionCalls) {
        const call = part.functionCall!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let funcResult: any = {};

        try {
          switch (call.name) {
            case 'click_at':
              funcResult = await this.browserTools.clickAt(
                call.args!['x'] as number,
                call.args!['y'] as number,
              );
              break;
            case 'type_text_at':
              funcResult = await this.browserTools.typeTextAt(
                call.args!['x'] as number,
                call.args!['y'] as number,
                call.args!['text'] as string,
                call.args!['press_enter'] as boolean,
                call.args!['clear_before_typing'] as boolean,
              );
              break;
            case 'drag_and_drop':
              funcResult = await this.browserTools.dragAndDrop(
                call.args!['x'] as number,
                call.args!['y'] as number,
                call.args!['destination_x'] as number,
                call.args!['destination_y'] as number,
              );
              break;
            case 'press_key':
            case 'key_combination':
              // Model might uses 'key_combination' with 'keys' arg, or we fallback to 'press_key' with 'key'
              // eslint-disable-next-line no-case-declarations
              const keys =
                (call.args!['keys'] as string) || (call.args!['key'] as string);
              funcResult = await this.browserTools.pressKey(keys);
              break;
            case 'scroll_document':
              funcResult = await this.browserTools.scrollDocument(
                call.args!['direction'] as 'up' | 'down' | 'left' | 'right',
              );
              break;
            case 'open_web_browser':
              funcResult = await this.browserTools.openWebBrowser();
              break;
            case 'wait_5_seconds':
              // Simple wait, could be enhanced with actual sleep if useful for letting page settle
              await new Promise((resolve) => setTimeout(resolve, 5000));
              funcResult = { output: 'Waited 5 seconds' };
              break;
            case 'go_back':
              funcResult = await this.browserTools.goBack();
              break;
            case 'go_forward':
              funcResult = await this.browserTools.goForward();
              break;
            case 'navigate':
              funcResult = await this.browserTools.navigate(
                call.args!['url'] as string,
              );
              break;
            case 'hover_at':
              funcResult = await this.browserTools.hoverAt(
                call.args!['x'] as number,
                call.args!['y'] as number,
              );
              break;
            case 'scroll_at':
              funcResult = await this.browserTools.scrollAt(
                call.args!['x'] as number,
                call.args!['y'] as number,
                call.args!['direction'] as 'up' | 'down' | 'left' | 'right',
                call.args!['magnitude'] as number,
              );
              break;
            case 'search':
              // Documentation shows "search" with empty args but undefined behavior.
              // We log it as a request, but typically this might imply using browser search or URL bar.
              // For now, we treat it as a no-op that acknowledges the request.
              funcResult = { output: 'Search requested (not implemented)' };
              break;
            default:
              funcResult = { error: `Unknown visual tool: ${call.name}` };
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          funcResult = { error: message };
        }

        // Computer Use model requires URL in function response
        // Get URL from funcResult if available, otherwise get current page URL
        let currentUrl = funcResult.url;
        if (!currentUrl) {
          try {
            const page = await this.browserManager.getPage();
            currentUrl = page?.url() || '';
          } catch {
            currentUrl = '';
          }
        }

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: {
              ...funcResult,
              url: currentUrl,
            },
          },
        });

        // Track action for history
        actionHistory.push(
          `- ${call.name}(${Object.keys(call.args || {})
            .map((k) => `${k}=${call.args![k]}`)
            .join(', ')}) => ${JSON.stringify(funcResult)}`,
        );
      }

      // Capture new state for next visual turn
      // We need a screenshot!
      let newScreenshot = '';
      try {
        // Use captureScreenshot helper which now defaults to Playwright CSS scale
        newScreenshot = await this.captureScreenshot();
      } catch {
        /* ignore */
      }

      if (newScreenshot) {
        functionResponses.push({
          inlineData: {
            mimeType: 'image/png',
            data: newScreenshot,
          },
        });
      }

      // Function responses are sent as 'user' role in the Gemini API
      contents.push({ role: 'user', parts: functionResponses });
    }

    // Invalidate MCP cache to prevent stale UIDs
    try {
      const client = await this.browserManager.getMcpClient();
      await client.callTool('evaluate_script', {
        function: '() => { return true; }',
      });
    } catch (_e) {
      /* ignore */
    }

    return {
      output: `Visual Agent reached max steps.\nActions Taken:\n${actionHistory.join('\n')}`,
    };
  }

  // Helper to capture screenshot on demand (for visual delegate or fallback)
  private async captureScreenshot(): Promise<string> {
    try {
      const page = await this.browserManager.getPage();
      await page.bringToFront();

      await this.browserTools.updateBorderOverlay({
        active: true,
        capturing: true,
      });

      // TODO: Consider using Playwright's CSS scale option and jpeg quality to reduce file size
      const buffer = await page.screenshot();
      const screenshotBase64 = buffer.toString('base64');

      await this.browserTools.updateBorderOverlay({
        active: true,
        capturing: false,
      });

      return screenshotBase64;
    } catch (e) {
      debugLogger.log(`Warning: Screenshot capture failed: ${e}`);
      return '';
    }
  }
}
