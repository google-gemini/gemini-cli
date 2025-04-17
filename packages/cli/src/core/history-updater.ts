import { Part } from "@google/genai";
import { toolRegistry } from "../tools/tool-registry.js";
import { HistoryItem, IndividualToolCallDisplay, ToolCallEvent, ToolCallStatus, ToolConfirmationOutcome, ToolEditConfirmationDetails, ToolExecuteConfirmationDetails } from "../ui/types.js";
import { ToolResultDisplay } from "../tools/tool.js";

/**
 * Processes a tool call chunk and updates the history state accordingly.
 * Manages adding new tool groups or updating existing ones.
 * Resides here as its primary effect is updating history based on tool events.
 */
export const handleToolCallChunk = (
    chunk: ToolCallEvent,
    setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
    submitQuery: (query: Part) => Promise<void>,
    getNextMessageId: () => number,
    currentToolGroupIdRef: React.MutableRefObject<number | null>
): void => {
    const toolDefinition = toolRegistry.getTool(chunk.name);
    const description = toolDefinition?.getDescription
        ? toolDefinition.getDescription(chunk.args)
        : '';
    const toolDisplayName = toolDefinition?.displayName ?? chunk.name;
    let confirmationDetails = chunk.confirmationDetails;
    if (confirmationDetails) {
        const originalConfirmationDetails = confirmationDetails;
        const historyUpdatingConfirm = async (outcome: ToolConfirmationOutcome) => {
            originalConfirmationDetails.onConfirm(outcome);

            if (outcome === ToolConfirmationOutcome.Cancel) {
                let resultDisplay: ToolResultDisplay | undefined;
                if ('fileDiff' in originalConfirmationDetails) {
                    resultDisplay = { fileDiff: (originalConfirmationDetails as ToolEditConfirmationDetails).fileDiff };
                } else {
                    resultDisplay = `~~${(originalConfirmationDetails as ToolExecuteConfirmationDetails).command}~~`;
                }
                handleToolCallChunk({ ...chunk, status: ToolCallStatus.Canceled, confirmationDetails: undefined, resultDisplay, }, setHistory, submitQuery, getNextMessageId, currentToolGroupIdRef);
                const functionResponse: Part = {
                    functionResponse: {
                        name: chunk.name,
                        response: { "error": "User rejected function call." },
                    },
                }
                await submitQuery(functionResponse);
            } else {
                const tool = toolRegistry.getTool(chunk.name)
                if (!tool) {
                    throw new Error(`Tool "${chunk.name}" not found or is not registered.`);
                }
                handleToolCallChunk({ ...chunk, status: ToolCallStatus.Invoked, resultDisplay: "Executing...", confirmationDetails: undefined }, setHistory, submitQuery, getNextMessageId, currentToolGroupIdRef);
                const result = await tool.execute(chunk.args);
                handleToolCallChunk({ ...chunk, status: ToolCallStatus.Invoked, resultDisplay: result.returnDisplay, confirmationDetails: undefined }, setHistory, submitQuery, getNextMessageId, currentToolGroupIdRef);
                const functionResponse: Part = {
                    functionResponse: {
                        name: chunk.name,
                        id: chunk.callId,
                        response: { "output": result.llmContent },
                    },
                }
                await submitQuery(functionResponse);
            }
        }

        confirmationDetails = {
            ...originalConfirmationDetails,
            onConfirm: historyUpdatingConfirm,
        };
    }
    const toolDetail: IndividualToolCallDisplay = {
        callId: chunk.callId,
        name: toolDisplayName,
        description,
        resultDisplay: chunk.resultDisplay,
        status: chunk.status,
        confirmationDetails: confirmationDetails,
    };

    const activeGroupId = currentToolGroupIdRef.current;
    setHistory(prev => {
        if (chunk.status === ToolCallStatus.Pending) {
            if (activeGroupId === null) {
                // Start a new tool group
                const newGroupId = getNextMessageId();
                currentToolGroupIdRef.current = newGroupId;
                return [
                    ...prev,
                    { id: newGroupId, type: 'tool_group', tools: [toolDetail] } as HistoryItem
                ];
            }

            // Add to existing tool group
            return prev.map(item =>
                item.id === activeGroupId && item.type === 'tool_group'
                    ? item.tools.some(t => t.callId === toolDetail.callId)
                        ? item // Tool already listed as pending
                        : { ...item, tools: [...item.tools, toolDetail] }
                    : item
            );
        }

        // Update the status of a pending tool within the active group
        if (activeGroupId === null) {
            // Log if an invoked tool arrives without an active group context
            console.warn("Received invoked tool status without an active tool group ID:", chunk);
            return prev;
        }

        return prev.map(item =>
            item.id === activeGroupId && item.type === 'tool_group'
                ? {
                    ...item,
                    tools: item.tools.map(t =>
                        t.callId === toolDetail.callId
                            ? { ...t, ...toolDetail, status: chunk.status } // Update details & status
                            : t
                    )
                }
                : item
        );
    });
};

/**
 * Appends an error or informational message to the history, attempting to attach
 * it to the last non-user message or creating a new entry.
 */
export const addErrorMessageToHistory = (
    error: any,
    setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
    getNextMessageId: () => number
): void => {
    const isAbort = error.name === 'AbortError';
    const errorType = isAbort ? 'info' : 'error';
    const errorText = isAbort
        ? '[Request cancelled by user]'
        : `[Error: ${error.message || 'Unknown error'}]`;

    setHistory(prev => {
        const reversedHistory = [...prev].reverse();
        // Find the last message that isn't from the user to append the error/info to
        const lastBotMessageIndex = reversedHistory.findIndex(item => item.type !== 'user');
        const originalIndex = lastBotMessageIndex !== -1 ? prev.length - 1 - lastBotMessageIndex : -1;

        if (originalIndex !== -1) {
            // Append error to the last relevant message
            return prev.map((item, index) => {
                if (index === originalIndex) {
                    let baseText = '';
                    // Determine base text based on item type
                    if (item.type === 'gemini') baseText = item.text ?? '';
                    else if (item.type === 'tool_group') baseText = `Tool execution (${item.tools.length} calls)`;
                    else if (item.type === 'error' || item.type === 'info') baseText = item.text ?? '';
                    // Safely handle potential undefined text

                    const updatedText = (baseText + (baseText && !baseText.endsWith('\n') ? '\n' : '') + errorText).trim();
                    // Reuse existing ID, update type and text
                    return { ...item, type: errorType, text: updatedText };
                }
                return item;
            });
        } else {
            // No previous message to append to, add a new error item
            return [
                ...prev,
                { id: getNextMessageId(), type: errorType, text: errorText } as HistoryItem
            ];
        }
    });
};