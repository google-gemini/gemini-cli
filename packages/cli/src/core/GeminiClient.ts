import {
    GenerateContentConfig, GoogleGenAI, Part, Chat,
    Type,
    SchemaUnion,
    PartListUnion,
    Content
} from '@google/genai';
import { getApiKey } from '../config/env.js';
import { CoreSystemPrompt } from './prompts.js';
import { type ToolCallEvent, type ToolCallConfirmationDetails, ToolCallStatus } from '../ui/types.js';
import process from 'node:process';
import { toolRegistry } from '../tools/tool-registry.js';
import { ToolResult } from '../tools/ToolResult.js';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { GeminiEventType, GeminiStream } from './GeminiStream.js';

type ToolExecutionOutcome = {
    callId: string;
    name: string;
    args: Record<string, any>;
    result?: ToolResult;
    error?: any;
    confirmationDetails?: ToolCallConfirmationDetails;
};

export class GeminiClient {
    private ai: GoogleGenAI;
    private defaultHyperParameters: GenerateContentConfig = {
        temperature: 0,
        topP: 1,
    };
    private readonly MAX_TURNS = 100;

    constructor() {
        const apiKey = getApiKey();
        this.ai = new GoogleGenAI({ apiKey });
    }

    public async startChat(): Promise<Chat> {
        const tools = toolRegistry.getToolSchemas();

        // --- Get environmental information ---
        const cwd = process.cwd();
        const today = new Date().toLocaleDateString(undefined, { // Use locale-aware date formatting
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const platform = process.platform;

        // --- Format information into a conversational multi-line string ---
        const folderStructure = await getFolderStructure(cwd);
        // --- End folder structure formatting ---)
        const initialContextText = `
Okay, just setting up the context for our chat.
Today is ${today}.
My operating system is: ${platform}
I'm currently working in the directory: ${cwd}
${folderStructure}
        `.trim();

        const initialContextPart: Part = { text: initialContextText };
        // --- End environmental information formatting ---

        try {
            const chat = this.ai.chats.create({
                model: 'gemini-2.5-pro-preview-03-25',//'gemini-2.0-flash',
                config: {
                    systemInstruction: CoreSystemPrompt,
                    ...this.defaultHyperParameters,
                    tools,
                },
                history: [
                    // --- Add the context as a single part in the initial user message ---
                    {
                        role: "user",
                        parts: [initialContextPart] // Pass the single Part object in an array
                    },
                    // --- Add an empty model response to balance the history ---
                    {
                        role: "model",
                        parts: [{ text: "Got it. Thanks for the context!" }] // A slightly more conversational model response
                    }
                    // --- End history modification ---
                ],
            });
            return chat;
        } catch (error) {
            console.error("Error initializing Gemini chat session:", error);
            const message = error instanceof Error ? error.message : "Unknown error.";
            throw new Error(`Failed to initialize chat: ${message}`);
        }
    }

    public addMessageToHistory(chat: Chat, message: Content): void {
        const history = chat.getHistory();
        history.push(message);
        this.ai.chats
        chat
    }

    public async* sendMessageStream(
        chat: Chat,
        request: PartListUnion,
        signal?: AbortSignal
    ): GeminiStream {
        let currentMessageToSend: PartListUnion = request;
        let turns = 0;

        try {
            while (turns < this.MAX_TURNS) {
                turns++;
                const resultStream = await chat.sendMessageStream({ message: currentMessageToSend });
                let functionResponseParts: Part[] = [];
                let pendingToolCalls: Array<{ callId: string; name: string; args: Record<string, any> }> = [];
                let yieldedTextInTurn = false;
                const chunksForDebug = [];

                for await (const chunk of resultStream) {
                    chunksForDebug.push(chunk);
                    if (signal?.aborted) {
                        const abortError = new Error("Request cancelled by user during stream.");
                        abortError.name = 'AbortError';
                        throw abortError;
                    }

                    const functionCalls = chunk.functionCalls;
                    if (functionCalls && functionCalls.length > 0) {
                        for (const call of functionCalls) {
                            const callId = call.id ?? `${call.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                            const name = call.name || 'undefined_tool_name';
                            const args = (call.args || {}) as Record<string, any>;

                            pendingToolCalls.push({ callId, name, args });
                            const evtValue: ToolCallEvent = {
                                type: 'tool_call',
                                status: ToolCallStatus.Pending,
                                callId,
                                name,
                                args,
                                resultDisplay: undefined,
                                confirmationDetails: undefined,
                            }
                            yield {
                                type: GeminiEventType.ToolCallInfo,
                                value: evtValue,
                            };
                        }
                    } else {
                        const text = chunk.text;
                        if (text) {
                            yieldedTextInTurn = true;
                            yield {
                                type: GeminiEventType.Content,
                                value: text,
                            };
                        }
                    }
                }

                if (pendingToolCalls.length > 0) {
                    const toolPromises: Promise<ToolExecutionOutcome>[] = pendingToolCalls.map(async pendingToolCall => {
                        const tool = toolRegistry.getTool(pendingToolCall.name);

                        if (!tool) {
                            // Directly return error outcome if tool not found
                            return { ...pendingToolCall, error: new Error(`Tool "${pendingToolCall.name}" not found or is not registered.`) };
                        }

                        try {
                            const confirmation = await tool.shouldConfirmExecute(pendingToolCall.args);
                            if (confirmation) {
                                return { ...pendingToolCall, confirmationDetails: confirmation };
                            }
                        } catch (error) {
                            return { ...pendingToolCall, error: new Error(`Tool failed to check tool confirmation: ${error}`) };
                        }

                        try {
                            const result = await tool.execute(pendingToolCall.args);
                            return { ...pendingToolCall, result };
                        } catch (error) {
                            return { ...pendingToolCall, error: new Error(`Tool failed to execute: ${error}`) };
                        }
                    });
                    const toolExecutionOutcomes: ToolExecutionOutcome[] = await Promise.all(toolPromises);

                    for (const executedTool of toolExecutionOutcomes) {
                        const { callId, name, args, result, error, confirmationDetails } = executedTool;

                        if (error) {
                            const errorMessage = error?.message || String(error);
                            yield {
                                type: GeminiEventType.Content,
                                value: `[Error invoking tool ${name}: ${errorMessage}]`,
                            };
                        } else if (result && typeof result === 'object' && result !== null && 'error' in result) {
                            const errorMessage = String(result.error);
                            yield {
                                type: GeminiEventType.Content,
                                value: `[Error executing tool ${name}: ${errorMessage}]`,
                            };
                        } else {
                            const status = confirmationDetails ? ToolCallStatus.Confirming : ToolCallStatus.Invoked;
                            const evtValue: ToolCallEvent = { type: 'tool_call', status, callId, name, args, resultDisplay: result?.returnDisplay, confirmationDetails }
                            yield {
                                type: GeminiEventType.ToolCallInfo,
                                value: evtValue,
                            };
                        }
                    }

                    pendingToolCalls = [];

                    const waitingOnConfirmations = toolExecutionOutcomes.filter(outcome => outcome.confirmationDetails).length > 0;
                    if (waitingOnConfirmations) {
                        // Stop processing content, wait for user.
                        // TODO: Kill token processing once API supports signals.
                        break;
                    }

                    functionResponseParts = toolExecutionOutcomes.map((executedTool: ToolExecutionOutcome): Part => {
                        const { name, result, error } = executedTool;
                        const output = { "output": result?.llmContent };
                        let toolOutcomePayload: any;

                        if (error) {
                            const errorMessage = error?.message || String(error);
                            toolOutcomePayload = { error: `Invocation failed: ${errorMessage}` };
                            console.error(`[Turn ${turns}] Critical error invoking tool ${name}:`, error);
                        } else if (result && typeof result === 'object' && result !== null && 'error' in result) {
                            toolOutcomePayload = output;
                            console.warn(`[Turn ${turns}] Tool ${name} returned an error structure:`, result.error);
                        } else {
                            toolOutcomePayload = output;
                        }

                        return {
                            functionResponse: {
                                name: name,
                                id: executedTool.callId,
                                response: toolOutcomePayload,
                            },
                        };
                    });
                    currentMessageToSend = functionResponseParts;
                } else if (yieldedTextInTurn) {
                    const history = chat.getHistory();
                    const checkPrompt = `Analyze *only* the content and structure of your immediately preceding response (your last turn in the conversation history). Based *strictly* on that response, determine who should logically speak next: the 'user' or the 'model' (you).

**Decision Rules (apply in order):**

1.  **Model Continues:** If your last response explicitly states an immediate next action *you* intend to take (e.g., "Next, I will...", "Now I'll process...", "Moving on to analyze...", indicates an intended tool call that didn't execute), OR if the response seems clearly incomplete (cut off mid-thought without a natural conclusion), then the **'model'** should speak next.
2.  **Question to User:** If your last response ends with a direct question specifically addressed *to the user*, then the **'user'** should speak next.
3.  **Waiting for User:** If your last response completed a thought, statement, or task *and* does not meet the criteria for Rule 1 (Model Continues) or Rule 2 (Question to User), it implies a pause expecting user input or reaction. In this case, the **'user'** should speak next.

**Output Format:**

Respond *only* in JSON format according to the following schema. Do not include any text outside the JSON structure.

\`\`\`json
{
  "type": "object",
  "properties": {
    "reasoning": {
        "type": "string",
        "description": "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn."
    },
    "next_speaker": {
      "type": "string",
      "enum": ["user", "model"],
      "description": "Who should speak next based *only* on the preceding turn and the decision rules."
    }
  },
  "required": ["next_speaker", "reasoning"]
\`\`\`
}`;

                    // Schema Idea
                    const responseSchema: SchemaUnion = {
                        type: Type.OBJECT,
                        properties: {
                            reasoning: {
                                type: Type.STRING,
                                description: "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn."
                            },
                            next_speaker: {
                                type: Type.STRING,
                                enum: ['user', 'model'], // Enforce the choices
                                description: "Who should speak next based *only* on the preceding turn and the decision rules",
                            },
                        },
                        required: ['reasoning', 'next_speaker']
                    };

                    try {
                        // Use the new generateJson method, passing the history and the check prompt
                        const parsedResponse = await this.generateJson([...history, { role: "user", parts: [{ text: checkPrompt }] }], responseSchema);

                        // Safely extract the next speaker value
                        const nextSpeaker: string | undefined = typeof parsedResponse?.next_speaker === 'string' ? parsedResponse.next_speaker : undefined;

                        if (nextSpeaker === 'model') {
                            currentMessageToSend = { text: 'alright' }; // Or potentially a more meaningful continuation prompt
                        } else {
                            // 'user' should speak next, or value is missing/invalid. End the turn.
                            break;
                        }

                    } catch (error) {
                        console.error(`[Turn ${turns}] Failed to get or parse next speaker check:`, error);
                        // If the check fails, assume user should speak next to avoid infinite loops
                        break;
                    }
                } else {
                    console.warn(`[Turn ${turns}] No text or function calls received from Gemini. Ending interaction.`);
                    break;
                }

            }

            if (turns >= this.MAX_TURNS) {
                console.warn("sendMessageStream: Reached maximum tool call turns limit.");
                yield {
                    type: GeminiEventType.Content,
                    value: "\n\n[System Notice: Maximum interaction turns reached. The conversation may be incomplete.]",
                };
            }

        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log("Gemini stream request aborted by user.");
                throw error;
            } else {
                console.error(`Error during Gemini stream or tool interaction:`, error);
                const message = error instanceof Error ? error.message : String(error);
                yield {
                    type: GeminiEventType.Content,
                    value: `\n\n[Error: An unexpected error occurred during the chat: ${message}]`,
                };
                throw error;
            }
        }
    }

    /**
     * Generates structured JSON content based on conversational history and a schema.
     * @param contents The conversational history (Content array) to provide context.
     * @param schema The SchemaUnion defining the desired JSON structure.
     * @returns A promise that resolves to the parsed JSON object matching the schema.
     * @throws Throws an error if the API call fails or the response is not valid JSON.
     */
    public async generateJson(contents: Content[], schema: SchemaUnion): Promise<any> {
        try {
            const result = await this.ai.models.generateContent({
                model: 'gemini-2.0-flash', // Using flash for potentially faster structured output
                config: {
                    ...this.defaultHyperParameters,
                    systemInstruction: CoreSystemPrompt,
                    responseSchema: schema,
                    responseMimeType: 'application/json',
                },
                contents: contents, // Pass the full Content array
            });

            const responseText = result.text;
            if (!responseText) {
                throw new Error("API returned an empty response.");
            }

            try {
                const parsedJson = JSON.parse(responseText);
                // TODO: Add schema validation if needed
                return parsedJson;
            } catch (parseError) {
                console.error("Failed to parse JSON response:", responseText);
                throw new Error(`Failed to parse API response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
        } catch (error) {
            console.error("Error generating JSON content:", error);
            const message = error instanceof Error ? error.message : "Unknown API error.";
            throw new Error(`Failed to generate JSON content: ${message}`);
        }
    }
}
